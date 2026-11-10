import { supabaseServer } from "@/lib/supabase-server";

// Ce qui a ete LIVRE du Depot F au Depot E, par article matiere premiere : somme des lignes des Transfer Invoice (TI) VALIDES
// (c'est la validation qui fait entrer le stock dans le Depot E) dont le Transfer Order va du Depot F au Depot E, crees a partir
// de `depuis` (et avant `avant` si donne). Sert a faire baisser la commande de Statistique Article Plastique (E3) : une commande
// "a fabriquer 30 000" dont 12 000 sont deja arrives par un TI n'a plus que 18 000 a fabriquer.
// Les TI sont relus a chaque affichage (jamais mis en memoire) : un TI supprime, ou une ligne retiree apres coup, fait remonter
// le reste a fabriquer tout de suite.
export type TiLivre = { code: string; href: string; quantite: number };
export type LivraisonArticle = { livre: number; tis: TiLivre[] };

const arrondi = (valeur: number) => Math.round(valeur * 1e6) / 1e6 || 0;

// Les requetes de la base sont plafonnees a 1000 lignes : les identifiants sont lus par paquets assez petits pour que chaque
// paquet reste largement en dessous, et chaque lecture est paginee.
async function lireParPaquets<T>(
  ids: number[],
  taille: number,
  lireUnePage: (paquet: number[], debut: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const lignes: T[] = [];
  for (let i = 0; i < ids.length; i += taille) {
    const paquet = ids.slice(i, i + taille);
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await lireUnePage(paquet, debut);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as T[];
      lignes.push(...page);
      if (page.length < 1000) break;
    }
  }
  return lignes;
}

export async function lireLivraisonsDepotFVersDepotE(options: {
  articleIds: number[];
  depuis: string;
  avant?: string | null;
}): Promise<Map<number, LivraisonArticle>> {
  const resultat = new Map<number, LivraisonArticle>();
  const articlesCherches = new Set(options.articleIds);
  if (articlesCherches.size === 0) return resultat;

  const { data: depotsData, error: erreurDepots } = await supabaseServer.from("depots").select("id, nom").in("nom", ["Depot E", "Depot F"]);
  if (erreurDepots) throw new Error(erreurDepots.message);
  const depots = (depotsData ?? []) as { id: number; nom: string }[];
  const depotE = depots.find((depot) => depot.nom === "Depot E")?.id;
  const depotF = depots.find((depot) => depot.nom === "Depot F")?.id;
  if (!depotE) throw new Error('Depot "Depot E" introuvable');
  if (!depotF) throw new Error('Depot "Depot F" introuvable');

  // 1. Transfer Invoice valides crees depuis la commande
  const tis: { id: number; numero: number | null; date_jour: string; transfer_order_id: number }[] = [];
  for (let debut = 0; ; debut += 1000) {
    let requete = supabaseServer
      .from("invoice_orders")
      .select("id, numero, date_jour, transfer_order_id")
      .eq("statut", "valide")
      .gte("created_at", options.depuis);
    if (options.avant) requete = requete.lt("created_at", options.avant);
    const { data, error } = await requete.order("id", { ascending: true }).range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof tis;
    tis.push(...page);
    if (page.length < 1000) break;
  }
  if (tis.length === 0) return resultat;

  // 2. seulement ceux dont le Transfer Order va du Depot F au Depot E
  const tosFversE = new Set(
    (
      await lireParPaquets<{ id: number }>([...new Set(tis.map((ti) => ti.transfer_order_id))], 100, (paquet, debut) =>
        supabaseServer
          .from("transfer_orders")
          .select("id")
          .in("id", paquet)
          .eq("depot_source_id", depotF)
          .eq("depot_destination_id", depotE)
          .order("id", { ascending: true })
          .range(debut, debut + 999)
      )
    ).map((to) => to.id)
  );
  const tisFversE = tis.filter((ti) => tosFversE.has(ti.transfer_order_id));
  if (tisFversE.length === 0) return resultat;
  const tiParId = new Map(tisFversE.map((ti) => [ti.id, ti]));

  // 3. leurs lignes, puis l'article de chaque ligne (articles matiere premiere de la commande seulement)
  const lignesTi = await lireParPaquets<{ id: number; invoice_order_id: number; transfer_order_ligne_id: number; quantite: number | string | null }>(
    tisFversE.map((ti) => ti.id),
    50,
    (paquet, debut) =>
      supabaseServer
        .from("invoice_order_lignes")
        .select("id, invoice_order_id, transfer_order_ligne_id, quantite")
        .in("invoice_order_id", paquet)
        .order("id", { ascending: true })
        .range(debut, debut + 999)
  );
  const lignesTo = await lireParPaquets<{ id: number; article_type: string; article_id: number }>(
    [...new Set(lignesTi.map((ligne) => ligne.transfer_order_ligne_id))],
    100,
    (paquet, debut) =>
      supabaseServer
        .from("transfer_order_lignes")
        .select("id, article_type, article_id")
        .in("id", paquet)
        .order("id", { ascending: true })
        .range(debut, debut + 999)
  );
  const articleParLigneTo = new Map(lignesTo.filter((ligne) => ligne.article_type === "MP").map((ligne) => [ligne.id, ligne.article_id]));

  for (const ligne of lignesTi) {
    const articleId = articleParLigneTo.get(ligne.transfer_order_ligne_id);
    const ti = tiParId.get(ligne.invoice_order_id);
    const quantite = Number(ligne.quantite ?? 0);
    if (articleId === undefined || !ti || !articlesCherches.has(articleId) || !(quantite > 0)) continue;

    const entree = resultat.get(articleId) ?? { livre: 0, tis: [] };
    entree.livre += quantite;
    const code = `TI.${ti.date_jour.slice(0, 4)}.${ti.numero ?? ti.id}`;
    const existant = entree.tis.find((candidat) => candidat.code === code);
    if (existant) existant.quantite += quantite;
    else entree.tis.push({ code, href: `/depots/invoice-order/${ti.id}`, quantite });
    resultat.set(articleId, entree);
  }

  for (const entree of resultat.values()) {
    entree.livre = arrondi(entree.livre);
    for (const ti of entree.tis) ti.quantite = arrondi(ti.quantite);
    entree.tis.sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  }
  return resultat;
}

// La quantite d'une commande est un texte libre ("30000", "30 000", "30000 pcs"...) : un nombre se deduit, le reste non.
export function lireQuantiteCommande(valeur: string | null | undefined): number | null {
  const texte = (valeur ?? "").trim();
  if (!texte) return null;
  const nombre = Number(texte.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(nombre) ? nombre : null;
}

// Reste a fabriquer = quantite commandee - livre (jamais en dessous de 0). Une quantite qui n'est pas un nombre reste telle quelle.
export function resteAFabriquer(quantiteCommande: string | null, livre: number): string | null {
  if (quantiteCommande === null) return null;
  const nombre = lireQuantiteCommande(quantiteCommande);
  if (nombre === null) return quantiteCommande;
  return String(Math.max(0, arrondi(nombre - livre)));
}
