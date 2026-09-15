import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleMpRow = { id: number; nom_article: string; categorie: string | null; unite: string | null };
type LotBalanceRow = { article_id: number; numero_lot: string; stock: number };

async function fetchAllLotsNegatifs() {
  const rows: LotBalanceRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .rpc("stock_mp_lot_balances_negatifs")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as LotBalanceRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

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

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

type SearchParams = Promise<{ article?: string; categorie?: string }>;

export default async function StockNegatifMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();
  const hasFilters = Boolean(articleFilter || categorieFilter);

  const [{ rows: lotsNegatifs, error: lotsError }, { rows: articles, error: articlesError }] = await Promise.all([
    fetchAllLotsNegatifs(),
    fetchAllArticlesMp(),
  ]);
  const error = lotsError || articlesError;

  const articleById = new Map(articles.map((a) => [a.id, a]));

  // Tolerance flottante - un stock a -0.0000000000007 ou -0.0004 est du
  // bruit d'arrondi sur des sommes de decimales, jamais une vraie anomalie
  // de saisie (meme tolerance EPSILON que la regularisation d'inventaire).
  const EPSILON = 0.01;

  const rows = lotsNegatifs
    .map((lot) => {
      const article = articleById.get(lot.article_id);
      return {
        articleId: lot.article_id,
        nomArticle: article?.nom_article ?? `Article #${lot.article_id}`,
        categorie: article?.categorie ?? null,
        unite: article?.unite ?? null,
        numeroLot: lot.numero_lot,
        stock: Number(lot.stock),
      };
    })
    .filter((row) => row.stock < -EPSILON)
    .filter((row) => !articleFilter || matchesArticleSearch(row.nomArticle, articleFilter))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .sort((a, b) => a.stock - b.stock);

  const articleOptions = [...new Set(articles.map((a) => a.nom_article))].map((label, id) => ({ id, label }));
  const categorieOptions = ([...new Set(articles.map((a) => a.categorie).filter(Boolean))] as string[]).map(
    (label, id) => ({ id, label })
  );

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Categorie", key: "categorie" },
    { label: "Code (numero de lot)", key: "code" },
    { label: "Unite", key: "unite" },
    { label: "Stock", key: "stock" },
  ];
  const exportRows = rows.map((row) => ({
    article: row.nomArticle,
    categorie: row.categorie || "-",
    code: row.numeroLot,
    unite: row.unite || "-",
    stock: row.stock,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">ERP Rodis</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Stock Negatif MP</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Tous les articles et codes de lot (numero_lot) dont le stock calcule (entrees moins sorties) est
              negatif - toujours une anomalie de saisie (plus sorti qu&apos;entre), jamais un cas normal.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <ExportExcelButton
              rows={exportRows}
              columns={exportColumns}
              filename={`stock-negatif-mp-${new Date().toISOString().slice(0, 10)}.xlsx`}
            />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-3">
            <SearchableFilterInput
              name="article"
              defaultValue={articleFilter}
              options={articleOptions}
              placeholder="Article..."
            />
            <SearchableFilterInput
              name="categorie"
              defaultValue={params.categorie || ""}
              options={categorieOptions}
              placeholder="Categorie..."
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/matiere-premiere/rapport/stock-negatif"
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
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error.message}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun stock negatif pour le moment."}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Categorie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Unite</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.articleId}::${row.numeroLot}`} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nomArticle}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.numeroLot}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                          {formatNumber(row.stock)}
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
