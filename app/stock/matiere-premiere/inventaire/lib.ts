import { supabaseServer } from "@/lib/supabase-server";
import { lireSoldesLotsMp, type LotBalanceRow } from "@/lib/lot-balances-mp";

export type { LotBalanceRow };
export type CategorieCount = { categorie: string; count: number };
export type GammeCount = { gamme: string; count: number };

// Soldes par article + lot : lecture partagee et gardee 10 s (voir lib/lot-balances-mp.ts), car chaque
// affichage de l'Inventaire la relisait 2 a 3 fois (comptes par categorie et par gamme, nombre de lots).
export async function fetchAllLotBalances(): Promise<LotBalanceRow[]> {
  return lireSoldesLotsMp();
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
