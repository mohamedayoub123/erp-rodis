import { supabaseServer } from "@/lib/supabase-server";

export type StockActuelMpRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  stock_actuel: number;
};

export type RecetteLigneRow = {
  id: number;
  article_pf_id: number;
  article_mp_id: number;
  quantite: number;
};

export type LigneCapacite = {
  ligneId: number;
  articleMpId: number;
  nomArticle: string;
  categorie: string;
  unite: string | null;
  quantiteParCarton: number | null;
  stockActuel: number;
  cartonsPossibles: number | null;
};

type ArticleMpInfoRow = { id: number; nom_article: string; categorie: string | null; unite: string | null };
type StockByDepotRow = { article_id: number; depot_id: number; stock: number };

async function fetchAllArticlesMpInfo(): Promise<ArticleMpInfoRow[]> {
  const rows: ArticleMpInfoRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, unite")
      .range(from, from + pageSize - 1);
    if (error) return rows;
    const chunk = (data ?? []) as ArticleMpInfoRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchAllStockByArticleDepot(): Promise<StockByDepotRow[]> {
  const rows: StockByDepotRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.rpc("stock_by_article_depot_mp").range(from, from + pageSize - 1);
    if (error) return rows;
    const chunk = (data ?? []) as StockByDepotRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// La production Conditionnement ne peut utiliser que ce qui est
// physiquement au Depot E : les articles plastique/conditionnement sont
// fabriques au Depot F puis transferes au Depot E, qui est le seul depot
// "disponible" pour la production reelle - le stock Depot F (ou un autre
// depot) ne compte pas comme utilisable ici, meme si le total global est
// plus grand.
export async function fetchStockActuelMpDepotE(): Promise<StockActuelMpRow[]> {
  const { data: depotE, error: depotError } = await supabaseServer
    .from("depots")
    .select("id")
    .eq("nom", "Depot E")
    .maybeSingle();

  if (depotError || !depotE) return [];

  const depotEId = (depotE as { id: number }).id;

  const [articlesInfo, stockByDepot] = await Promise.all([fetchAllArticlesMpInfo(), fetchAllStockByArticleDepot()]);

  const stockDepotEByArticleId = new Map(
    stockByDepot.filter((row) => row.depot_id === depotEId).map((row) => [row.article_id, row.stock])
  );

  return articlesInfo.map((article) => ({
    article_id: article.id,
    nom_article: article.nom_article,
    categorie: article.categorie,
    unite: article.unite,
    stock_actuel: stockDepotEByArticleId.get(article.id) ?? 0,
  }));
}

// Pour chaque article de la recette, combien de cartons son stock actuel
// permet a lui seul (stock / quantite necessaire par carton) - le plus
// petit de tous est le goulot d'etranglement de la production reelle.
export function computeLignesCapacite(
  lignes: { id: number; article_mp_id: number; quantite: number }[],
  quantiteRecetteBase: number | null,
  stockById: Map<number, StockActuelMpRow>
): LigneCapacite[] {
  return lignes.map((ligne) => {
    const stockInfo = stockById.get(ligne.article_mp_id);
    const quantiteParCarton =
      quantiteRecetteBase && quantiteRecetteBase > 0 ? ligne.quantite / quantiteRecetteBase : null;
    const stockActuel = stockInfo?.stock_actuel ?? 0;
    const cartonsPossibles =
      quantiteParCarton !== null && quantiteParCarton > 0 ? Math.floor(stockActuel / quantiteParCarton) : null;

    return {
      ligneId: ligne.id,
      articleMpId: ligne.article_mp_id,
      nomArticle: stockInfo?.nom_article || `Article #${ligne.article_mp_id}`,
      categorie: stockInfo?.categorie || "AUTRE",
      unite: stockInfo?.unite ?? null,
      quantiteParCarton,
      stockActuel,
      cartonsPossibles,
    };
  });
}

export function computeCartonsPossiblesTotal(lignesCapacite: LigneCapacite[]): number | null {
  const valeurs = lignesCapacite
    .map((ligne) => ligne.cartonsPossibles)
    .filter((value): value is number => value !== null);
  return valeurs.length > 0 ? Math.min(...valeurs) : null;
}

export function findLigneLimitante(
  lignesCapacite: LigneCapacite[],
  cartonsPossiblesTotal: number | null
): LigneCapacite | null {
  if (cartonsPossiblesTotal === null) return null;
  return lignesCapacite.find((ligne) => ligne.cartonsPossibles === cartonsPossiblesTotal) ?? null;
}
