import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { matchesArticleSearch } from "@/lib/article-search";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

type StockActuelPfRpcRow = {
  article_id: number;
  nom_article: string;
  type_article: string | null;
  stock_actuel: number;
  codes: string[] | null;
};

type StockRow = {
  article_id: number;
  nom_article: string;
  type_article: string | null;
  stock_actuel: number;
  codes: string[];
};

// Le stock par article (somme de tous les mouvements TE/TS) est calcule
// directement en base (fonction stock_actuel_pf_rows, voir
// scripts/sql/add_stock_actuel_rpcs.sql) - avant, cette page rapatriait
// TOUTE la table lots_stock (un journal de mouvements qui ne fait que
// grossir, 16 000+ lignes) pour la sommer en JS a chaque chargement.
//
// Pagine (.range()) - sous les 1000 articles PF actuels ca ne changeait
// rien, mais un simple appel RPC sans pagination plafonne silencieusement a
// 1000 lignes (limite par defaut Supabase/PostgREST) des que le catalogue
// depasse ce seuil - bug reel confirme sur l'equivalent MP (voir
// fetchStockActuelMp, meme fichier cote MP), corrige ici par prevention.
async function fetchStockActuelPf() {
  const pageSize = 1000;
  const rows: StockActuelPfRpcRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer.rpc("stock_actuel_pf_rows").range(from, from + pageSize - 1);
    if (error) return { rows: [] as StockActuelPfRpcRow[], error };
    const chunk = (data ?? []) as StockActuelPfRpcRow[];
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

export default async function StockActuelPfPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();
  const hasFilters = Boolean(articleFilter || codeFilter || categorieFilter);

  const { rows: rpcRows, error } = await fetchStockActuelPf();

  const stockRows: StockRow[] = rpcRows
    .map((row) => ({
      article_id: row.article_id,
      nom_article: row.nom_article,
      type_article: row.type_article,
      stock_actuel: Number(row.stock_actuel ?? 0),
      codes: row.codes ?? [],
    }))
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !codeFilter || row.codes.some((code) => code.toLowerCase().includes(codeFilter)))
    .filter((row) => !categorieFilter || (row.type_article || "").toLowerCase().includes(categorieFilter))
    .sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

  const articleOptions = [...new Set(rpcRows.map((row) => row.nom_article))].map((label, index) => ({
    id: index,
    label,
  }));
  const categorieOptions = (
    [...new Set(rpcRows.map((row) => row.type_article).filter(Boolean))] as string[]
  ).map((label, index) => ({ id: index, label }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef5f0_0%,#f8fbf8_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Stock Actuel PF
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Tous les articles produit fini avec leur stock actuel (calcule depuis les mouvements
              TE/TS), meme a zero.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/rapport" label="Retour rapport" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <SearchableFilterInput
              name="article"
              defaultValue={articleFilter}
              options={articleOptions}
              placeholder="Article..."
            />
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code (numero de lot)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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
                  href="/stock/stock-actuel"
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
                    <th className="px-6 py-4 font-semibold">Stock actuel</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.type_article || "-"}</td>
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
