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

export type ArticleOption = { id: number; label: string; lots: number };

// Noms des articles MP (tri sur id : pagination fiable au-dela de 1000 lignes).
export async function fetchArticleNomsParId(ids?: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids && ids.length === 0) return map;
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabaseServer.from("articles_matiere_premiere").select("id, nom_article").order("id", { ascending: true });
    if (ids) query = query.in("id", ids);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { id: number; nom_article: string | null }[];
    for (const row of chunk) map.set(row.id, row.nom_article || `Article ${row.id}`);
    if (chunk.length < pageSize) break;
  }
  return map;
}

// Articles proposes au choix d'un inventaire "par article" : seulement ceux qui ont du stock en lots
// (les autres n'ont rien a compter), avec leur nombre de lots a cote du nom.
export async function fetchArticleOptions(): Promise<ArticleOption[]> {
  const balances = await fetchAllLotBalances();
  const lotsParArticle = new Map<number, number>();
  for (const row of balances) lotsParArticle.set(row.article_id, (lotsParArticle.get(row.article_id) ?? 0) + 1);
  if (lotsParArticle.size === 0) return [];

  const noms = await fetchArticleNomsParId();
  return [...lotsParArticle.entries()]
    .map(([id, lots]) => ({ id, label: noms.get(id) ?? `Article ${id}`, lots }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
}

export type PerimetreInventaire = {
  categories: string[] | null;
  gammes: string[] | null;
  articles: number[] | null;
};

// Un lot (article + numero de lot) fait-il partie du perimetre d'une session ? Un seul endroit pour la regle,
// utilise a la distribution des lots ET pour le total affiche :
// - articles choisis : le lot doit etre d'un de ces articles (en plus des autres filtres s'il y en a) ;
// - categorie seule ou gamme seule : ce filtre seul ;
// - categorie ET gamme ensemble : intersection (ex. categorie "BASE" + gamme "ELIXIR" = les BASE de la gamme ELIXIR).
export function lotDansPerimetre(
  articleId: number,
  perimetre: PerimetreInventaire,
  categorieByArticleId: Map<number, string | null> | null,
  gammeByArticleId: Map<number, string | null> | null
): boolean {
  const articleSet = perimetre.articles && perimetre.articles.length > 0 ? new Set(perimetre.articles) : null;
  const categorieSet = perimetre.categories && perimetre.categories.length > 0 ? new Set(perimetre.categories) : null;
  const gammeSet = perimetre.gammes && perimetre.gammes.length > 0 ? new Set(perimetre.gammes) : null;

  if (articleSet && !articleSet.has(articleId)) return false;
  if (!categorieSet && !gammeSet) return true;

  const matchesCategorie = categorieSet ? categorieSet.has(categorieByArticleId?.get(articleId) ?? "") : false;
  const matchesGamme = gammeSet ? gammeSet.has(gammeByArticleId?.get(articleId) ?? "") : false;
  return categorieSet && gammeSet ? matchesCategorie && matchesGamme : matchesCategorie || matchesGamme;
}

// Nombre exact de lots a compter dans le perimetre d'une session qui a des articles choisis.
export async function compterLotsPerimetre(perimetre: PerimetreInventaire): Promise<number> {
  const hasCategorie = !!perimetre.categories && perimetre.categories.length > 0;
  const hasGamme = !!perimetre.gammes && perimetre.gammes.length > 0;
  const [balances, categorieByArticleId, gammeByArticleId] = await Promise.all([
    fetchAllLotBalances(),
    hasCategorie ? fetchArticleCategorieById() : Promise.resolve(null),
    hasGamme ? fetchArticleGammeById() : Promise.resolve(null),
  ]);
  return balances.filter((row) => lotDansPerimetre(row.article_id, perimetre, categorieByArticleId, gammeByArticleId)).length;
}

// Libelle court du perimetre : categories, gammes, puis les articles choisis (2 noms puis "+ N").
export function libellePerimetre(
  categories: string[] | null,
  gammes: string[] | null,
  nomsArticles: string[]
): string {
  const articles =
    nomsArticles.length === 0
      ? null
      : nomsArticles.length <= 2
        ? nomsArticles.join(", ")
        : `${nomsArticles.slice(0, 2).join(", ")} + ${nomsArticles.length - 2} autre(s)`;
  const parts = [
    categories && categories.length > 0 ? categories.join(", ") : null,
    gammes && gammes.length > 0 ? gammes.join(", ") : null,
    articles,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "tout le MP";
}
