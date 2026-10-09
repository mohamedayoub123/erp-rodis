import { supabaseServer } from "@/lib/supabase-server";
import { lirePagesAvecLimite } from "@/lib/lecteur-valide";

export type LotBalance = { articleId: number; numeroLot: string; solde: number };

export type StockDepot = {
  soldePf: LotBalance[];
  soldeMp: LotBalance[];
  // `${articleId}::${numeroLot}` -> "Conforme" | "A recuperer" (lots de vrac du produit fini)
  vracStatusByLot: Map<string, string>;
};

type LotRow = {
  article_id: number | null;
  numero_lot: string | null;
  qte_entree: number;
  qte_sortie: number;
  depot_id: number | null;
  note: string | null;
};
type ArticleDepotRow = { id: number; depot_id: number | null };

// Solde par article ET par numero de lot DANS CE DEPOT precis - un lot dont depot_id est encore vide (jamais
// transfere) est considere dans le depot PAR DEFAUT de son article (voir articles.depot_id) - un article MP par
// defaut "Depot E" peut donc quand meme avoir du stock affiche ici sur un AUTRE depot, une fois qu'un Transfer
// Order/Transfer Invoice valide l'a deplace.
function computeSoldeByArticleLot(
  lots: LotRow[],
  depotIdByArticleId: Map<number, number | null>,
  depotId: number
): LotBalance[] {
  const map = new Map<string, LotBalance>();
  for (const lot of lots) {
    if (!lot.article_id) continue;
    const effectiveDepotId = lot.depot_id ?? depotIdByArticleId.get(lot.article_id) ?? null;
    if (effectiveDepotId !== depotId) continue;
    const numeroLot = (lot.numero_lot || "").trim();
    const key = `${lot.article_id}::${numeroLot}`;
    const existing = map.get(key);
    const delta = Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0);
    if (existing) {
      existing.solde += delta;
    } else {
      map.set(key, { articleId: lot.article_id, numeroLot, solde: delta });
    }
  }
  return [...map.values()];
}

// Statut qualite d'un lot de vrac (Conforme / A recuperer), derive de la note posee au credit par
// crediterVracFabrique (voir app/production/suivi-production/actions.ts) - "A detruire" ne credite JAMAIS le
// stock (production_destruction_history a la place), donc un lot detruit n'apparait structurellement jamais ici
// et ne peut pas etre choisi dans le picker "Code vrac recupere" de la Fabrication.
function deriveVracStatusByLot(lots: LotRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lot of lots) {
    if (!lot.article_id || !lot.note?.startsWith("Fabrication vrac")) continue;
    const key = `${lot.article_id}::${(lot.numero_lot || "").trim()}`;
    map.set(key, lot.note.includes("A recuperer") ? "A recuperer" : "Conforme");
  }
  return map;
}

function fonctionAbsente(erreur: { code?: string; message: string }) {
  return (
    erreur.code === "PGRST202" ||
    erreur.code === "42883" ||
    /could not find the function|does not exist/i.test(erreur.message)
  );
}

type RpcMp = { article_id: number; numero_lot: string | null; solde: number | string };
type RpcPf = RpcMp & { statut: string | null };

// Voie rapide : la base fait elle-meme les sommes par article + lot de CE depot (voir scripts/sql/
// add_depot_stock_par_lot_rpc.sql) et ne renvoie que quelques centaines de lignes. Renvoie null si les deux
// fonctions n'ont pas encore ete creees dans Supabase (on retombe alors sur la lecture complete ci-dessous).
async function lireParFonctions(depotId: number): Promise<StockDepot | null> {
  const [mp, pf] = await Promise.all([
    supabaseServer.rpc("depot_stock_par_lot_mp", { p_depot_id: depotId }),
    supabaseServer.rpc("depot_stock_par_lot_pf", { p_depot_id: depotId }),
  ]);
  for (const resultat of [mp, pf]) {
    if (resultat.error) {
      if (fonctionAbsente(resultat.error)) return null;
      throw new Error(resultat.error.message);
    }
  }

  const lignesMp = (mp.data ?? []) as RpcMp[];
  const lignesPf = (pf.data ?? []) as RpcPf[];
  const versBalance = (ligne: RpcMp): LotBalance => ({
    articleId: Number(ligne.article_id),
    numeroLot: (ligne.numero_lot ?? "").trim(),
    solde: Number(ligne.solde ?? 0),
  });

  const vracStatusByLot = new Map<string, string>();
  for (const ligne of lignesPf) {
    if (ligne.statut) vracStatusByLot.set(`${ligne.article_id}::${(ligne.numero_lot ?? "").trim()}`, ligne.statut);
  }
  return { soldePf: lignesPf.map(versBalance), soldeMp: lignesMp.map(versBalance), vracStatusByLot };
}

// Voie de secours (identique a l'ancien calcul, mais pages lues 6 par 6 au lieu d'une par une, et dans un ordre
// stable) : telecharge tous les mouvements puis les additionne ici.
async function lireTousLesMouvements(depotId: number): Promise<StockDepot> {
  const lireTable = <T,>(table: string, colonnes: string) =>
    lirePagesAvecLimite<T>(
      () => supabaseServer.from(table).select("id", { count: "exact", head: true }),
      (debut, fin) =>
        supabaseServer.from(table).select(colonnes).order("id", { ascending: true }).range(debut, fin) as unknown as PromiseLike<{
          data: T[] | null;
          error: { message: string } | null;
        }>
    );

  const colonnesLots = "article_id, numero_lot, qte_entree, qte_sortie, depot_id, note";
  const [articlesPf, articlesMp, lotsPf, lotsMp] = await Promise.all([
    lireTable<ArticleDepotRow>("articles", "id, depot_id"),
    lireTable<ArticleDepotRow>("articles_matiere_premiere", "id, depot_id"),
    lireTable<LotRow>("lots_stock", colonnesLots),
    lireTable<LotRow>("lots_stock_matiere_premiere", colonnesLots),
  ]);

  return {
    soldePf: computeSoldeByArticleLot(lotsPf, new Map(articlesPf.map((a) => [a.id, a.depot_id])), depotId),
    soldeMp: computeSoldeByArticleLot(lotsMp, new Map(articlesMp.map((a) => [a.id, a.depot_id])), depotId),
    vracStatusByLot: deriveVracStatusByLot(lotsPf),
  };
}

export async function lireStockDepot(depotId: number): Promise<StockDepot> {
  return (await lireParFonctions(depotId)) ?? (await lireTousLesMouvements(depotId));
}
