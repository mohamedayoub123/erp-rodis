import { supabaseServer } from "@/lib/supabase-server";

type DepotRow = { id: number; nom: string };

// Lecture des reservations d'un depot (Transfer Orders approuves, avec leur origine) - sorti de page.tsx pour
// pouvoir etre verifie sur les vraies donnees.
// D'ou vient une reservation : un Transfer Order approuve (TO) ou une validation Salle de pesage /
// conditionnement de la production. Sert au detail "Reserve ou ?" de chaque ligne.
export type SourceReservation = {
  type: "TO" | "PRODUCTION";
  code: string;
  detail: string;
  href: string;
  quantite: number;
};
export type SourcesParArticleLot = Map<number, Map<string, SourceReservation[]>>;

const STATUT_TO_LIBELLE: Record<string, string> = {
  en_attente: "en attente",
  approuve: "approuve",
  partiellement_fini: "partiellement livre",
  poste: "poste",
};
export const ETAPE_PRODUCTION_LIBELLE: Record<string, string> = {
  pesage: "Salle de pesage",
  salle_conditionnement: "Salle de conditionnement",
  vrac: "Fabrication",
  carton: "Conditionnement",
  emballage: "Emballage",
};

export function ajouterSource(cible: SourcesParArticleLot, articleId: number, numeroLot: string, source: SourceReservation) {
  const parLot = cible.get(articleId) ?? new Map<string, SourceReservation[]>();
  const liste = parLot.get(numeroLot) ?? [];
  const existante = liste.find((s) => s.type === source.type && s.code === source.code);
  if (existante) existante.quantite += source.quantite;
  else liste.push({ ...source });
  parLot.set(numeroLot, liste);
  cible.set(articleId, parLot);
}

// Lit des lignes par paquets d'identifiants (adresses courtes, et chaque paquet reste tres en dessous du
// plafond de 1000 lignes par requete de la base).
async function lireParPaquets<T>(
  ids: number[],
  lireUnPaquet: (paquet: number[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  taille = 150
): Promise<T[]> {
  const lignes: T[] = [];
  for (let i = 0; i < ids.length; i += taille) {
    const { data, error } = await lireUnPaquet(ids.slice(i, i + taille));
    if (error) throw new Error(error.message);
    lignes.push(...((data ?? []) as T[]));
  }
  return lignes;
}

// Reservation Transfer Order deja promise sur ce depot, par article puis par numero de lot, avec les Transfer
// Orders qui les reservent (code, depot de destination, statut) pour le detail "Reserve ou ?".
//
// On part des RESERVATIONS ACTIVES (lots de lignes de TO dont la quantite restante est > 0 : environ 250 sur
// toute la base) puis on remonte vers leurs lignes et leurs Transfer Orders, en gardant ceux dont le depot
// SOURCE est ce depot. L'ancienne lecture partait de TOUS les Transfer Orders du depot (1 799 pour le Depot E)
// puis de toutes leurs lignes : la base plafonne chaque requete a 1000 lignes, donc la lecture etait tronquee
// en silence et des reservations disparaissaient (cas reel : 392 reserves vus sur la page Produit mais pas
// dans le depot). Toute erreur de lecture est maintenant remontee au lieu d'afficher "rien de reserve".
export async function fetchReservedByLotForDepot(depotId: number): Promise<{
  pf: Map<number, Map<string, number>>;
  mp: Map<number, Map<string, number>>;
  sourcesPf: SourcesParArticleLot;
  sourcesMp: SourcesParArticleLot;
}> {
  const pf = new Map<number, Map<string, number>>();
  const mp = new Map<number, Map<string, number>>();
  const sourcesPf: SourcesParArticleLot = new Map();
  const sourcesMp: SourcesParArticleLot = new Map();
  const vide = { pf, mp, sourcesPf, sourcesMp };

  // 1. toutes les reservations encore actives, par pages (au cas ou il y en aurait plus de 1000 un jour)
  const lots: { transfer_order_ligne_id: number; numero_lot: string | null; quantite: number }[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("transfer_order_ligne_lots")
      .select("id, transfer_order_ligne_id, numero_lot, quantite")
      .gt("quantite", 0)
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof lots;
    lots.push(...page);
    if (page.length < 1000) break;
  }
  if (lots.length === 0) return vide;

  // 2. leurs lignes puis 3. leurs Transfer Orders (seulement ceux dont ce depot est la SOURCE)
  const lignes = await lireParPaquets<{
    id: number;
    transfer_order_id: number;
    article_type: string;
    article_id: number;
  }>([...new Set(lots.map((lot) => lot.transfer_order_ligne_id))], (paquet) =>
    supabaseServer.from("transfer_order_lignes").select("id, transfer_order_id, article_type, article_id").in("id", paquet)
  );
  const transferOrders = await lireParPaquets<{
    id: number;
    numero: number | null;
    date_jour: string;
    statut: string;
    depot_destination_id: number;
  }>([...new Set(lignes.map((ligne) => ligne.transfer_order_id))], (paquet) =>
    supabaseServer
      .from("transfer_orders")
      .select("id, numero, date_jour, statut, depot_destination_id")
      .in("id", paquet)
      .eq("depot_source_id", depotId)
  );
  if (transferOrders.length === 0) return vide;

  const transferOrderById = new Map(transferOrders.map((t) => [t.id, t]));
  const ligneById = new Map(lignes.map((l) => [l.id, l]));
  const { data: depotsData, error: erreurDepots } = await supabaseServer.from("depots").select("id, nom");
  if (erreurDepots) throw new Error(erreurDepots.message);
  const depotNomById = new Map(((depotsData ?? []) as DepotRow[]).map((d) => [d.id, d.nom]));

  for (const row of lots) {
    const ligne = ligneById.get(row.transfer_order_ligne_id);
    if (!ligne) continue;
    const transferOrder = transferOrderById.get(ligne.transfer_order_id);
    if (!transferOrder) continue; // reservation d'un Transfer Order parti d'un AUTRE depot

    const target = ligne.article_type === "MP" ? mp : pf;
    const byLot = target.get(ligne.article_id) ?? new Map<string, number>();
    const key = row.numero_lot || "";
    const quantite = Number(row.quantite ?? 0);
    byLot.set(key, (byLot.get(key) ?? 0) + quantite);
    target.set(ligne.article_id, byLot);

    ajouterSource(ligne.article_type === "MP" ? sourcesMp : sourcesPf, ligne.article_id, key, {
      type: "TO",
      code: `TO.${transferOrder.date_jour.slice(0, 4)}.${transferOrder.numero ?? transferOrder.id}`,
      detail: `vers ${depotNomById.get(transferOrder.depot_destination_id) ?? "un autre depot"} (${
        STATUT_TO_LIBELLE[transferOrder.statut] ?? transferOrder.statut
      })`,
      href: `/depots/transfer-order/${transferOrder.id}`,
      quantite,
    });
  }

  return vide;
}
