import { supabaseServer } from "@/lib/supabase-server";

export type LotBalanceRow = { article_id: number; numero_lot: string; stock: number };
export type CategorieCount = { categorie: string; count: number };
export type GammeCount = { gamme: string; count: number };

export async function fetchAllLotBalances(): Promise<LotBalanceRow[]> {
  // Deduplique par (article_id, numero_lot) - filet de securite en plus de
  // l'ORDER BY cote SQL (stock_mp_lot_balances) : sans ordre stable, une
  // pagination en plusieurs appels peut renvoyer la meme ligne deux fois
  // (bug reel confirme sur l'equivalent PF, voir
  // scripts/sql/fix_lot_balances_pagination_order.sql), ce qui provoquait
  // une violation de contrainte unique lors de la distribution d'un lot de
  // travail.
  const byKey = new Map<string, LotBalanceRow>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer.rpc("stock_mp_lot_balances").range(from, from + pageSize - 1);
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

export async function fetchArticleCategorieById(): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, categorie")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { id: number; categorie: string | null }[];
    for (const row of chunk) map.set(row.id, row.categorie);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

export async function fetchArticleGammeById(): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, gamme")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { id: number; gamme: string | null }[];
    for (const row of chunk) map.set(row.id, row.gamme);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

// Nombre de LOTS (pas d'articles) par categorie - un article peut exister
// au catalogue sans avoir de stock actuel (donc 0 lot a compter), compter
// les articles donnait un chiffre trompeur a cote de chaque case a cocher
// (ex: "MASK (1)" alors que cet article n'a en realite aucun lot en stock,
// bug reel signale par l'utilisateur).
export async function fetchCategorieCounts(): Promise<CategorieCount[]> {
  const [balances, categorieByArticleId] = await Promise.all([fetchAllLotBalances(), fetchArticleCategorieById()]);

  const counts = new Map<string, number>();
  for (const row of balances) {
    const cat = (categorieByArticleId.get(row.article_id) || "").trim();
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([categorie, count]) => ({ categorie, count }))
    .sort((a, b) => a.categorie.localeCompare(b.categorie, "fr"));
}

// Meme principe que fetchCategorieCounts, par gamme - demande explicite :
// pouvoir limiter une session d'inventaire par gamme, pas seulement par
// categorie.
export async function fetchGammeCounts(): Promise<GammeCount[]> {
  const [balances, gammeByArticleId] = await Promise.all([fetchAllLotBalances(), fetchArticleGammeById()]);

  const counts = new Map<string, number>();
  for (const row of balances) {
    const gamme = (gammeByArticleId.get(row.article_id) || "").trim();
    if (!gamme) continue;
    counts.set(gamme, (counts.get(gamme) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([gamme, count]) => ({ gamme, count }))
    .sort((a, b) => a.gamme.localeCompare(b.gamme, "fr"));
}
