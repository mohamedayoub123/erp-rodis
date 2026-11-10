import { supabaseServer } from "@/lib/supabase-server";
import { fetchReservedByLotForDepot } from "@/app/depots/[id]/reservations";

// Ce que les Transfer Orders (TO) vont encore faire SORTIR d'un depot, par article matiere premiere. Sert a deduire du stock
// d'un depot ce qui est deja demande par un TO, meme si le stock n'a pas encore bouge (Statistique Article Plastique (E3)).
//  - TO approuve / poste / partiellement livre : la quantite RESTANTE reservee sur ses lots (transfer_order_ligne_lots). Elle
//    baisse a chaque Transfer Invoice valide, donc ce qui est deja sorti du stock n'est jamais compte deux fois. C'est le meme
//    chiffre que "Reserve" sur la page du depot (fetchReservedByLotForDepot).
//  - TO en attente : aucun lot n'est encore reserve (il ne l'est qu'a l'approbation), on prend la quantite DEMANDEE de ses
//    lignes. Pas de double comptage possible : un TO en attente n'a jamais de lots reserves.
// Seuls les TO qui PARTENT de ce depot comptent (un TO qui arrive dans le depot ne retire rien).
export type TransferOrderEnCours = { code: string; detail: string; href: string; quantite: number };
export type TransferOrdersArticle = { reserve: number; enAttente: number; tos: TransferOrderEnCours[] };

const arrondi = (valeur: number) => Math.round(valeur * 1e6) / 1e6 || 0;

export async function lireTransferOrdersEnCoursDepot(nomDepot: string): Promise<Map<number, TransferOrdersArticle>> {
  const { data: depotsData, error: erreurDepots } = await supabaseServer.from("depots").select("id, nom");
  if (erreurDepots) throw new Error(erreurDepots.message);
  const depots = (depotsData ?? []) as { id: number; nom: string }[];
  const depotId = depots.find((depot) => depot.nom === nomDepot)?.id;
  if (!depotId) throw new Error(`Depot "${nomDepot}" introuvable`);
  const nomDepotParId = new Map(depots.map((depot) => [depot.id, depot.nom]));

  const parArticle = new Map<number, TransferOrdersArticle>();
  const ajouter = (articleId: number, to: TransferOrderEnCours, enAttente: boolean) => {
    const entree = parArticle.get(articleId) ?? { reserve: 0, enAttente: 0, tos: [] };
    if (enAttente) entree.enAttente += to.quantite;
    else entree.reserve += to.quantite;
    // un meme TO peut reserver plusieurs lots du meme article : une seule ligne par TO
    const existant = entree.tos.find((candidat) => candidat.code === to.code);
    if (existant) existant.quantite += to.quantite;
    else entree.tos.push({ ...to });
    parArticle.set(articleId, entree);
  };

  // 1. TO approuves / postes / partiellement livres : quantite restante reservee
  const { sourcesMp } = await fetchReservedByLotForDepot(depotId);
  for (const [articleId, parLot] of sourcesMp) {
    for (const sources of parLot.values()) {
      for (const source of sources) ajouter(articleId, { code: source.code, detail: source.detail, href: source.href, quantite: source.quantite }, false);
    }
  }

  // 2. TO en attente : quantite demandee de leurs lignes (lecture par pages : la base plafonne chaque requete a 1000 lignes)
  const tosEnAttente: { id: number; numero: number | null; date_jour: string; depot_destination_id: number }[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("transfer_orders")
      .select("id, numero, date_jour, depot_destination_id")
      .eq("depot_source_id", depotId)
      .eq("statut", "en_attente")
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof tosEnAttente;
    tosEnAttente.push(...page);
    if (page.length < 1000) break;
  }
  const toParId = new Map(tosEnAttente.map((to) => [to.id, to]));
  const taillePaquet = 50;
  for (let i = 0; i < tosEnAttente.length; i += taillePaquet) {
    const ids = tosEnAttente.slice(i, i + taillePaquet).map((to) => to.id);
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await supabaseServer
        .from("transfer_order_lignes")
        .select("id, transfer_order_id, article_id, quantite_demandee")
        .eq("article_type", "MP")
        .in("transfer_order_id", ids)
        .order("id", { ascending: true })
        .range(debut, debut + 999);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as { id: number; transfer_order_id: number; article_id: number; quantite_demandee: number | string | null }[];
      for (const ligne of page) {
        const to = toParId.get(ligne.transfer_order_id);
        const quantite = Number(ligne.quantite_demandee ?? 0);
        if (!to || !(quantite > 0)) continue;
        ajouter(
          ligne.article_id,
          {
            code: `TO.${to.date_jour.slice(0, 4)}.${to.numero ?? to.id}`,
            detail: `vers ${nomDepotParId.get(to.depot_destination_id) ?? "un autre depot"} (en attente)`,
            href: `/depots/transfer-order/${to.id}`,
            quantite,
          },
          true
        );
      }
      if (page.length < 1000) break;
    }
  }

  for (const entree of parArticle.values()) {
    entree.reserve = arrondi(entree.reserve);
    entree.enAttente = arrondi(entree.enAttente);
    for (const to of entree.tos) to.quantite = arrondi(to.quantite);
    entree.tos.sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  }
  return parArticle;
}
