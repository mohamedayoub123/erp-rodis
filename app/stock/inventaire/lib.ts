import { supabaseServer } from "@/lib/supabase-server";

export type LotBalanceRow = { article_id: number; numero_lot: string; stock: number };
export type CategorieCount = { categorie: string; count: number };
export type GammeCount = { gamme: string; count: number };

export async function fetchAllLotBalances(): Promise<LotBalanceRow[]> {
  // Deduplique par (article_id, numero_lot) - filet de securite en plus de
  // l'ORDER BY cote SQL (stock_pf_lot_balances) : sans ordre stable, une
  // pagination en plusieurs appels peut renvoyer la meme ligne deux fois
  // (bug reel confirme : 457 doublons sur 1861 lignes recuperees avant ce
  // correctif), ce qui provoquait une violation de contrainte unique lors
  // de la distribution d'un lot de travail. Voir
  // scripts/sql/fix_lot_balances_pagination_order.sql.
  const byKey = new Map<string, LotBalanceRow>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer.rpc("stock_pf_lot_balances").range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as LotBalanceRow[];
    for (const row of chunk) {
      byKey.set(`${row.article_id}::${row.numero_lot}`, row);
    }
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return [...byKey.values()];
}

type ArticleScopeRow = { id: number; type_article: string | null; gamme: string | null; nature: string | null };

async function fetchArticleScopeRows(): Promise<ArticleScopeRow[]> {
  const rows: ArticleScopeRow[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, type_article, gamme, nature")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as ArticleScopeRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// PF n'a pas de colonne "categorie" dediee (contrairement au MP) - on
// reutilise "type_article" (gel douche, savon, hydratant...) qui joue le
// meme role de regroupement pour limiter une session d'inventaire.
export async function fetchArticleCategorieById(): Promise<Map<number, string | null>> {
  const rows = await fetchArticleScopeRows();
  return new Map(rows.map((row) => [row.id, row.type_article]));
}

export async function fetchArticleGammeById(): Promise<Map<number, string | null>> {
  const rows = await fetchArticleScopeRows();
  return new Map(rows.map((row) => [row.id, row.gamme]));
}

// Nombre de LOTS (pas d'articles) par categorie/gamme - un article peut
// exister au catalogue sans avoir de stock actuel (donc 0 lot a compter),
// compter les articles donnait un chiffre trompeur a cote de chaque case a
// cocher (meme correctif que cote MP). Le vrac (nature "vrac") n'est jamais
// inventoriable en PF - exclu des comptes comme du reste du flux. Un lot a
// stock systeme exactement 0 n'a non plus rien a compter physiquement
// (demande explicite, PF seulement) - exclu ici pour que le chiffre entre
// parentheses corresponde exactement a ce qui sera reellement distribue.
export async function fetchCategorieCounts(): Promise<CategorieCount[]> {
  const [balances, articleRows] = await Promise.all([fetchAllLotBalances(), fetchArticleScopeRows()]);
  const scopeByArticleId = new Map(articleRows.map((row) => [row.id, row]));

  const counts = new Map<string, number>();
  for (const row of balances) {
    if (row.stock === 0) continue;
    const article = scopeByArticleId.get(row.article_id);
    if (!article || article.nature !== "fini") continue;
    const cat = (article.type_article || "").trim();
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([categorie, count]) => ({ categorie, count }))
    .sort((a, b) => a.categorie.localeCompare(b.categorie, "fr"));
}

export async function fetchGammeCounts(): Promise<GammeCount[]> {
  const [balances, articleRows] = await Promise.all([fetchAllLotBalances(), fetchArticleScopeRows()]);
  const scopeByArticleId = new Map(articleRows.map((row) => [row.id, row]));

  const counts = new Map<string, number>();
  for (const row of balances) {
    if (row.stock === 0) continue;
    const article = scopeByArticleId.get(row.article_id);
    if (!article || article.nature !== "fini") continue;
    const gamme = (article.gamme || "").trim();
    if (!gamme) continue;
    counts.set(gamme, (counts.get(gamme) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([gamme, count]) => ({ gamme, count }))
    .sort((a, b) => a.gamme.localeCompare(b.gamme, "fr"));
}

// Total de lots reellement distribuables (stock non nul, article fini) -
// remplace le compte brut RPC (stock_pf_lot_balances) sur les affichages
// "X lot(s) au total", pour rester coherent avec ce que
// distribuerProchainLot (actions.ts) va effectivement donner a compter.
export async function fetchTotalDistribuableLotCount(): Promise<number> {
  const [balances, articleRows] = await Promise.all([fetchAllLotBalances(), fetchArticleScopeRows()]);
  const scopeByArticleId = new Map(articleRows.map((row) => [row.id, row]));
  let count = 0;
  for (const row of balances) {
    if (row.stock === 0) continue;
    const article = scopeByArticleId.get(row.article_id);
    if (!article || article.nature !== "fini") continue;
    count += 1;
  }
  return count;
}
