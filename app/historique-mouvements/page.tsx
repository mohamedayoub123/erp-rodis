import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { PersistPageFilters } from "@/app/_components/persist-page-filters";
import { BackButton } from "@/app/_components/back-button";

type SearchParams = Promise<{
  article_q?: string;
  page?: string;
}>;

type SaleRow = {
  id: number;
  article_id: number | null;
  date_jour: string | null;
  qte_sortie: number;
  articles: {
    nom_article: string;
    type_article: string | null;
    marque: string | null;
    gamme: string | null;
  } | null;
};

type ArticleStatsRow = {
  article_id: number | null;
  nom_article: string;
  type_article: string | null;
  marque: string | null;
  gamme: string | null;
  total_vendu: number;
  by_month: Record<string, number>;
};

const PAGE_SIZE = 100;

function buildChartPoints(values: number[]) {
  const width = 760;
  const height = 260;
  const padding = 28;
  const maxValue = Math.max(...values, 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return values
    .map((value, index) => {
      const x =
        padding + (values.length <= 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth);
      const y = padding + innerHeight - (value / maxValue) * innerHeight;
      return `${x},${y}`;
    })
    .join(" ");
}

function getMonthKey(value: string | null) {
  if (!value) return "";
  return value.slice(0, 7);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;

  return `${month}/${year.slice(2)}`;
}

export default async function HistoriqueMouvementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const articleQ = (params.article_q || "").trim();
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: articleSuggestionsData } = await supabaseServer
    .from("articles")
    .select("id, nom_article")
    .order("nom_article", { ascending: true })
    .limit(5000);

  const matchingArticleIds = articleQ
    ? (
        (
          await supabaseServer
            .from("articles")
            .select("id")
            .or(
              `nom_article.ilike.%${articleQ}%,type_article.ilike.%${articleQ}%,marque.ilike.%${articleQ}%,gamme.ilike.%${articleQ}%`
            )
            .limit(1000)
        ).data ?? []
      ).map((row) => row.id)
    : [];

  // PostgREST plafonne chaque requete a son max-rows interne (~1000) peu
  // importe le .range() demande - il faut paginer en boucle, sinon la
  // plupart des sorties sont silencieusement absentes des statistiques.
  const rows: SaleRow[] = [];
  let fetchError: { message: string } | null = null;
  let salesFrom = 0;
  const salesPageSize = 1000;

  while (true) {
    let salesQuery = supabaseServer
      .from("lots_stock")
      .select(
        "id, article_id, date_jour, qte_sortie, articles!inner(nom_article, type_article, marque, gamme)"
      )
      .gt("qte_sortie", 0)
      .order("date_jour", { ascending: false })
      .order("id", { ascending: false })
      .range(salesFrom, salesFrom + salesPageSize - 1);

    if (articleQ) {
      if (matchingArticleIds.length === 0) {
        salesQuery = salesQuery.eq("article_id", -1);
      } else {
        salesQuery = salesQuery.in("article_id", matchingArticleIds);
      }
    }

    const { data, error } = await salesQuery;

    if (error) {
      fetchError = error;
      break;
    }

    const chunk = (data as unknown as SaleRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < salesPageSize) break;
    salesFrom += salesPageSize;
  }

  const error = fetchError;
  const articleSuggestions =
    ((articleSuggestionsData as { id: number; nom_article: string }[] | null) ?? []).map(
      (article) => article.nom_article
    );

  const statsMap = new Map<string, ArticleStatsRow>();
  const monthSet = new Set<string>();

  for (const row of rows) {
    const monthKey = getMonthKey(row.date_jour);
    if (!monthKey) continue;

    monthSet.add(monthKey);

    const articleKey = String(row.article_id ?? `na-${row.articles?.nom_article || row.id}`);
    const current =
      statsMap.get(articleKey) ??
      ({
        article_id: row.article_id,
        nom_article: row.articles?.nom_article || "-",
        type_article: row.articles?.type_article || null,
        marque: row.articles?.marque || null,
        gamme: row.articles?.gamme || null,
        total_vendu: 0,
        by_month: {},
      } satisfies ArticleStatsRow);

    current.total_vendu += Number(row.qte_sortie ?? 0);
    current.by_month[monthKey] =
      Number(current.by_month[monthKey] ?? 0) + Number(row.qte_sortie ?? 0);

    statsMap.set(articleKey, current);
  }

  const monthColumns = [...monthSet].sort().reverse().slice(0, 12).reverse();
  const allStatsRows = [...statsMap.values()].sort((a, b) => b.total_vendu - a.total_vendu);
  const pagedRows = allStatsRows.slice(from, to + 1);
  const totalRows = allStatsRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const totalVenduVisible = pagedRows.reduce((sum, row) => sum + Number(row.total_vendu ?? 0), 0);
  const effectiveError = error;
  const showChartOnly = articleQ.length > 0;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f9ff_0%,#fbfdff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <PersistPageFilters />
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Statistique ventes par mois
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Cette page montre combien on a vendu par mois avec filtre article et courbe.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/statistique" />
              <Link
                href="/stock"
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Voir stock
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1.3fr_auto_auto]">
            <div className="grid gap-2">
              <input
                type="text"
                list="stats-articles-list"
                name="article_q"
                defaultValue={articleQ}
                placeholder="Filtrer par article..."
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                autoComplete="off"
              />
              <datalist id="stats-articles-list">
                {articleSuggestions.map((articleName) => (
                  <option key={articleName} value={articleName} />
                ))}
              </datalist>
            </div>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            <Link
              href="/historique-mouvements"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm">
              Articles visibles :
              <span className="ml-2 font-bold text-sky-900">{pagedRows.length}</span>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
              Vente visible :
              <span className="ml-2 font-bold text-emerald-900">{totalVenduVisible}</span>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              Mois affiches :
              <span className="ml-2 font-bold text-slate-900">{monthColumns.length}</span>
            </div>
          </div>
        </section>

        {showChartOnly && !effectiveError && pagedRows.length > 0 ? (
          <section className="space-y-5">
            {pagedRows.map((row) => {
              const chartValues = monthColumns.map((monthKey) => Number(row.by_month[monthKey] ?? 0));
              const points = buildChartPoints(chartValues);
              const chartMax = Math.max(...chartValues, 1);

              return (
                <article
                  key={`${row.article_id}-${row.nom_article}`}
                  className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                        Statistique article
                      </p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                        {row.nom_article}
                      </h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {row.type_article || "-"} | {row.marque || "-"} | {row.gamme || "-"}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
                        Total vendu :
                        <span className="ml-2 font-bold text-emerald-900">{row.total_vendu}</span>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                        Pic mois :
                        <span className="ml-2 font-bold text-slate-900">{chartMax}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <div className="min-w-[780px] rounded-[1.5rem] border border-sky-100 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] p-4">
                      <svg viewBox="0 0 760 260" className="h-72 w-full">
                        {[0, 1, 2, 3].map((line) => {
                          const y = 28 + ((260 - 56) / 3) * line;
                          return (
                            <line
                              key={line}
                              x1="28"
                              y1={y}
                              x2="732"
                              y2={y}
                              stroke="#cbd5e1"
                              strokeDasharray="4 6"
                              strokeWidth="1"
                            />
                          );
                        })}

                        <polyline
                          fill="none"
                          stroke="#0f172a"
                          strokeWidth="4"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          points={points}
                        />

                        {chartValues.map((value, index) => {
                          const [x, y] = points
                            .split(" ")
                            [index].split(",")
                            .map((item) => Number(item));

                          return (
                            <g key={`${row.nom_article}-${monthColumns[index]}`}>
                              <circle cx={x} cy={y} r="5" fill="#0ea5e9" />
                              <text
                                x={x}
                                y={Math.max(18, y - 12)}
                                textAnchor="middle"
                                className="fill-slate-700 text-[11px] font-semibold"
                              >
                                {value}
                              </text>
                              <text
                                x={x}
                                y="248"
                                textAnchor="middle"
                                className="fill-slate-500 text-[11px] font-medium"
                              >
                                {formatMonthLabel(monthColumns[index])}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {effectiveError ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {effectiveError.message}
              </p>
            </div>
          ) : pagedRows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune statistique trouvee.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Article</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Marque</th>
                    <th className="px-4 py-3 font-semibold">Gamme</th>
                    {monthColumns.map((monthKey) => (
                      <th key={monthKey} className="px-4 py-3 text-center font-semibold">
                        {formatMonthLabel(monthKey)}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center font-semibold">Total vendu</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={`${row.article_id}-${row.nom_article}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-4 py-3 text-slate-600">{row.type_article || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.marque || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.gamme || "-"}</td>
                      {monthColumns.map((monthKey) => (
                        <td key={monthKey} className="px-4 py-3 text-center text-slate-700">
                          {Number(row.by_month[monthKey] ?? 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-bold text-sky-900">
                        {row.total_vendu}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!effectiveError && totalRows > 0 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 text-sm">
              <p className="text-slate-500">
                Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows}
              </p>

              <div className="flex gap-3">
                <Link
                  href={`/historique-mouvements?page=${Math.max(1, currentPage - 1)}&article_q=${encodeURIComponent(articleQ)}`}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    currentPage === 1
                      ? "pointer-events-none bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  Precedent
                </Link>
                <Link
                  href={`/historique-mouvements?page=${Math.min(totalPages, currentPage + 1)}&article_q=${encodeURIComponent(articleQ)}`}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    currentPage >= totalPages
                      ? "pointer-events-none bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  Suivant
                </Link>
              </div>
            </div>
          ) : null}
        </section>
        )}
      </div>
    </main>
  );
}

