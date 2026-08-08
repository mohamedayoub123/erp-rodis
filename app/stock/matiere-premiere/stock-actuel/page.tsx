import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
  numero_lot: string | null;
};

type StockRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  stock_actuel: number;
  codes: string[];
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, unite")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllMouvements() {
  const rows: MouvementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("article_id, qte_entree, qte_sortie, numero_lot")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as MouvementRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type SearchParams = Promise<{ article?: string; code?: string; categorie?: string }>;

export default async function StockActuelMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();
  const hasFilters = Boolean(articleFilter || codeFilter || categorieFilter);

  const [{ rows: articles, error: articlesError }, { rows: mouvements, error: mouvementsError }] =
    await Promise.all([fetchAllArticlesMp(), fetchAllMouvements()]);

  const error = articlesError || mouvementsError;

  // Stock actuel = somme entree-sortie de tous les mouvements de l'article
  // (meme calcul que Stock Alert MP) - "codes" retient chaque numero de lot
  // deja vu pour cet article, pour que le filtre Code puisse retrouver
  // l'article a partir d'un lot precis meme si ce report reste par article.
  const stockByArticle = new Map<number, number>();
  const codesByArticle = new Map<number, Set<string>>();
  for (const row of mouvements) {
    if (!row.article_id) continue;
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockByArticle.set(row.article_id, (stockByArticle.get(row.article_id) ?? 0) + mouvement);

    const code = (row.numero_lot || "").trim();
    if (code) {
      const set = codesByArticle.get(row.article_id) ?? new Set<string>();
      set.add(code);
      codesByArticle.set(row.article_id, set);
    }
  }

  const stockRows: StockRow[] = articles
    .map((article) => ({
      article_id: article.id,
      nom_article: article.nom_article,
      categorie: article.categorie,
      unite: article.unite,
      stock_actuel: stockByArticle.get(article.id) ?? 0,
      codes: [...(codesByArticle.get(article.id) ?? [])],
    }))
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !codeFilter || row.codes.some((code) => code.toLowerCase().includes(codeFilter)))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))];
  const categorieOptions = [...new Set(articles.map((article) => article.categorie).filter(Boolean))] as string[];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Stock Actuel MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Tous les articles matiere premiere avec leur stock actuel (calcule depuis les
              mouvements TE/TS), meme a zero.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <input
              type="text"
              name="article"
              list="stock-actuel-mp-articles"
              autoComplete="off"
              defaultValue={articleFilter}
              placeholder="Article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="stock-actuel-mp-articles">
              {articleOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code (numero de lot)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="categorie"
              list="stock-actuel-mp-categories"
              autoComplete="off"
              defaultValue={params.categorie || ""}
              placeholder="Categorie..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="stock-actuel-mp-categories">
              {categorieOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/matiere-premiere/stock-actuel"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </a>
              ) : null}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : stockRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun article pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Categorie</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Stock actuel</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            row.stock_actuel <= 0
                              ? "bg-slate-100 text-slate-600"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {formatNumber(row.stock_actuel)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
