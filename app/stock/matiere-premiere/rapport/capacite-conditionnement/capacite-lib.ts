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

export type ImportEnCours = {
  nDoss4d: string | null;
  nDossErp: string | null;
  statut: string;
  datePrevueReception: string | null;
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
  importEnCours: ImportEnCours | null;
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

function dossierKey(nDoss4d: string | null, nDossErp: string | null) {
  return `${nDoss4d ?? ""}|||${nDossErp ?? ""}`;
}

type BcLigneArticleRow = { id: number; article_id: number | null };
type ImportRow = {
  bc_ligne_id: number;
  n_doss_4d_import: string | null;
  n_doss_erp_import: string | null;
  lot_stock_id: number | null;
};
type DossierStatutRow = {
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  statut: string;
  date_prevue_reception: string | null;
};

// Pour chaque article MP demande, le prochain import DEJA COMMANDE mais pas
// encore arrive en stock (bons_commande_mp_imports.lot_stock_id encore nul -
// voir commande/page.tsx, meme convention : une "Reception" cree sa propre
// ligne AVEC lot_stock_id rempli) et dont le dossier n'est pas deja marque
// "Receptionne Rodis". Si un article a plusieurs imports en cours, garde
// celui dont la date prevue est la plus proche (les dates non renseignees
// passent en dernier, jamais choisies devant une date connue).
export async function fetchImportsEnCoursMp(articleMpIds: number[]): Promise<Map<number, ImportEnCours>> {
  const result = new Map<number, ImportEnCours>();
  if (articleMpIds.length === 0) return result;

  const { data: bcLignesData, error: bcError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id, article_id")
    .in("article_id", articleMpIds);

  if (bcError) return result;
  const bcLignes = (bcLignesData ?? []) as BcLigneArticleRow[];
  const bcLigneIds = bcLignes.map((row) => row.id);
  if (bcLigneIds.length === 0) return result;

  const articleIdByBcLigneId = new Map(bcLignes.map((row) => [row.id, row.article_id]));

  const { data: importsData, error: importsError } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("bc_ligne_id, n_doss_4d_import, n_doss_erp_import, lot_stock_id")
    .in("bc_ligne_id", bcLigneIds)
    .is("lot_stock_id", null);

  if (importsError) return result;
  const imports = (importsData ?? []) as ImportRow[];
  if (imports.length === 0) return result;

  const { data: statutsData, error: statutsError } = await supabaseServer
    .from("dossiers_import_mp_statut")
    .select("n_doss_4d, n_doss_erp, statut, date_prevue_reception");

  if (statutsError) return result;
  const statutByDossier = new Map(
    ((statutsData ?? []) as DossierStatutRow[]).map((row) => [dossierKey(row.n_doss_4d, row.n_doss_erp), row])
  );

  for (const row of imports) {
    const articleId = articleIdByBcLigneId.get(row.bc_ligne_id);
    if (!articleId) continue;

    const statutInfo = statutByDossier.get(dossierKey(row.n_doss_4d_import, row.n_doss_erp_import));
    const statut = statutInfo?.statut ?? "Fabrication";
    // Deja receptionne physiquement (le lot n'est simplement pas encore
    // cree) - ne compte plus comme "en cours" pour cette page.
    if (statut === "Receptionne Rodis") continue;

    const datePrevueReception = statutInfo?.date_prevue_reception ?? null;
    const existing = result.get(articleId);
    const estPlusProche =
      !existing ||
      (datePrevueReception && (!existing.datePrevueReception || datePrevueReception < existing.datePrevueReception));

    if (estPlusProche) {
      result.set(articleId, {
        nDoss4d: row.n_doss_4d_import,
        nDossErp: row.n_doss_erp_import,
        statut,
        datePrevueReception,
      });
    }
  }

  return result;
}

// Pour chaque article de la recette, combien de cartons son stock actuel
// permet a lui seul (stock / quantite necessaire par carton) - le plus
// petit de tous est le goulot d'etranglement de la production reelle.
export function computeLignesCapacite(
  lignes: { id: number; article_mp_id: number; quantite: number }[],
  quantiteRecetteBase: number | null,
  stockById: Map<number, StockActuelMpRow>,
  importsByArticleMpId: Map<number, ImportEnCours> = new Map()
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
      importEnCours: importsByArticleMpId.get(ligne.article_mp_id) ?? null,
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
