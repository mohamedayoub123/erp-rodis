import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRowsParallel } from "@/lib/fetch-all-rows-parallel";
import { PersistPageFilters } from "@/app/_components/persist-page-filters";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { StatistiqueChart, type YearMonthRow } from "@/app/_components/entree-sortie-chart";

type SearchParams = Promise<{
  article_q?: string;
  page?: string;
}>;

type SortieRow = {
  id: number;
  article_id: number | null;
  date_jour: string | null;
  qte_sortie: number;
  articles_matiere_premiere: {
    nom_article: string;
    categorie: string | null;
    gamme: string | null;
  } | null;
};

type ArticleStatsRow = {
  article_id: number | null;
  nom_article: string;
  categorie: string | null;
  gamme: string | null;
  total_sorti: number;
  by_month: Record<string, number>;
};

const PAGE_SIZE = 100;

function getMonthKey(value: string | null) {
  if (!value) return "";
  return value.slice(0, 7);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;

  return `${month}/${year.slice(2)}`;
}

export default async function RapportMouvementsMpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const articleQ = (params.article_q || "").trim();
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const matchingArticleIds = articleQ
    ? (
        (
          await supabaseServer
            .from("articles_matiere_premiere")
            .select("id")
            .or(`nom_article.ilike.%${articleQ}%,categorie.ilike.%${articleQ}%,gamme.ilike.%${articleQ}%`)
            .limit(1000)
        ).data ?? []
      ).map((row) => row.id)
    : [];

  // PostgREST plafonne chaque requete a son max-rows interne (~1000) peu
  // importe le .range() demande - il faut paginer, sinon la plupart des
  // sorties sont silencieusement absentes des statistiques. Sans filtre
  // article, cette table a 40 000+ lignes de sortie (~41 pages) : une
  // pagination SEQUENTIELLE (une page apres l'autre) prenait a elle seule
  // 50 sec+ - toutes les pages partent maintenant en parallele (compte exact
  // d'abord, puis chaque .range() lance d'un coup) via fetchAllRowsParallel.
  function buildSortiesQuery(from: number, to: number) {
    let query = supabaseServer
      .from("lots_stock_matiere_premiere")
      .select(
        "id, article_id, date_jour, qte_sortie, articles_matiere_premiere!inner(nom_article, categorie, gamme)"
      )
      .gt("qte_sortie", 0)
      .order("date_jour", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (articleQ) {
      query = matchingArticleIds.length === 0 ? query.eq("article_id", -1) : query.in("article_id", matchingArticleIds);
    }

    return query;
  }

  function buildSortiesCountQuery() {
    let query = supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("id", { count: "exact", head: true })
      .gt("qte_sortie", 0);

    if (articleQ) {
      query = matchingArticleIds.length === 0 ? query.eq("article_id", -1) : query.in("article_id", matchingArticleIds);
    }

    return query;
  }

  // articleSuggestionsData et sortiesResult sont totalement independants
  // (l'un ne depend jamais du resultat de l'autre) - partis en parallele
  // plutot qu'en cascade.
  const [articleSuggestionsData, sortiesResult] = await Promise.all([
    // .limit(5000) ne suffisait pas a lui seul : PostgREST plafonne chaque
    // requete a son max-rows interne (~1000) peu importe le .limit() demande
    // - les 2/3 des articles (2704 au total) restaient silencieusement
    // absents des suggestions au-dela des 1000 premiers par ordre
    // alphabetique.
    fetchAllRowsParallel<{ id: number; nom_article: string }>(
      () => supabaseServer.from("articles_matiere_premiere").select("id", { count: "exact", head: true }),
      (from, to) =>
        supabaseServer
          .from("articles_matiere_premiere")
          .select("id, nom_article")
          .order("nom_article", { ascending: true })
          .range(from, to)
    ),
    (async (): Promise<{ rows: SortieRow[]; fetchError: { message: string } | null }> => {
      try {
        const rows = await fetchAllRowsParallel<SortieRow>(buildSortiesCountQuery, (from, to) =>
          buildSortiesQuery(from, to).then(
            (res) => res as unknown as { data: SortieRow[] | null; error: { message: string } | null }
          )
        );
        return { rows, fetchError: null };
      } catch (e) {
        return { rows: [], fetchError: { message: e instanceof Error ? e.message : "Erreur inconnue." } };
      }
    })(),
  ]);

  const rows = sortiesResult.rows;
  const error = sortiesResult.fetchError;
  const articleSuggestions = articleSuggestionsData.map((article) => article.nom_article);

  const statsMap = new Map<string, ArticleStatsRow>();
  const monthSet = new Set<string>();

  for (const row of rows) {
    const monthKey = getMonthKey(row.date_jour);
    if (!monthKey) continue;

    monthSet.add(monthKey);

    const articleKey = String(row.article_id ?? `na-${row.articles_matiere_premiere?.nom_article || row.id}`);
    const current =
      statsMap.get(articleKey) ??
      ({
        article_id: row.article_id,
        nom_article: row.articles_matiere_premiere?.nom_article || "-",
        categorie: row.articles_matiere_premiere?.categorie || null,
        gamme: row.articles_matiere_premiere?.gamme || null,
        total_sorti: 0,
        by_month: {},
      } satisfies ArticleStatsRow);

    current.total_sorti += Number(row.qte_sortie ?? 0);
    current.by_month[monthKey] =
      Number(current.by_month[monthKey] ?? 0) + Number(row.qte_sortie ?? 0);

    statsMap.set(articleKey, current);
  }

  const monthColumns = [...monthSet].sort().reverse().slice(0, 12).reverse();
  const allStatsRows = [...statsMap.values()].sort((a, b) => b.total_sorti - a.total_sorti);
  const pagedRows = allStatsRows.slice(from, to + 1);
  const totalRows = allStatsRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const totalSortiVisible = pagedRows.reduce((sum, row) => sum + Number(row.total_sorti ?? 0), 0);
  const effectiveError = error;
  const showChartOnly = articleQ.length > 0;

  // Entree ET sortie, par annee et par mois, pour chaque article affiche
  // ci-dessous dans la vue detaillee (showChartOnly) - la table de synthese
  // plus haut reste volontairement sortie-seule, ce graphique/tableau
  // croise couvre les 2 mouvements avec plusieurs annees comparables.
  const yearMonthRowsByArticle = new Map<number, YearMonthRow[]>();
  if (showChartOnly && pagedRows.length > 0) {
    const chartArticleIds = pagedRows
      .map((row) => row.article_id)
      .filter((id): id is number => id !== null);

    if (chartArticleIds.length > 0) {
      type MovementRow = { article_id: number | null; date_jour: string | null; qte_entree: number; qte_sortie: number };
      const movementRows = await fetchAllRowsParallel<MovementRow>(
        () =>
          supabaseServer
            .from("lots_stock_matiere_premiere")
            .select("id", { count: "exact", head: true })
            .in("article_id", chartArticleIds),
        (from, to) =>
          supabaseServer
            .from("lots_stock_matiere_premiere")
            .select("article_id, date_jour, qte_entree, qte_sortie")
            .in("article_id", chartArticleIds)
            .order("id", { ascending: true })
            .range(from, to)
      );

      const byArticleYearMonth = new Map<number, Map<string, { entree: number; sortie: number }>>();
      for (const row of movementRows) {
        if (!row.article_id || !row.date_jour) continue;
        const [yearStr, monthStr] = row.date_jour.split("-");
        const key = `${yearStr}-${monthStr}`;
        const byYearMonth = byArticleYearMonth.get(row.article_id) ?? new Map();
        const current = byYearMonth.get(key) ?? { entree: 0, sortie: 0 };
        current.entree += Number(row.qte_entree ?? 0);
        current.sortie += Number(row.qte_sortie ?? 0);
        byYearMonth.set(key, current);
        byArticleYearMonth.set(row.article_id, byYearMonth);
      }

      for (const [articleId, byYearMonth] of byArticleYearMonth.entries()) {
        const list: YearMonthRow[] = [...byYearMonth.entries()].map(([key, totals]) => {
          const [year, month] = key.split("-");
          return { year: Number(year), month: Number(month), entree: totals.entree, sortie: totals.sortie };
        });
        yearMonthRowsByArticle.set(articleId, list);
      }
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <PersistPageFilters />
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Entree/Sortie MP par mois
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Cette page montre l&apos;entree et la sortie de matiere premiere par mois, avec
                filtre article et graphique.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/rapport" />
              <RefreshButton />
              <Link
                href="/stock/matiere-premiere/stock-actuel"
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
                list="stats-articles-mp-list"
                name="article_q"
                defaultValue={articleQ}
                placeholder="Filtrer par article..."
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                autoComplete="off"
              />
              <datalist id="stats-articles-mp-list">
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
              href="/stock/matiere-premiere/rapport/mouvements"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm">
              Articles visibles :
              <span className="ml-2 font-bold text-amber-900">{pagedRows.length}</span>
            </div>
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm">
              Sortie visible :
              <span className="ml-2 font-bold text-red-900">{totalSortiVisible}</span>
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
              if (row.article_id === null) return null;
              const yearMonthRows = yearMonthRowsByArticle.get(row.article_id) ?? [];

              return (
                <article
                  key={`${row.article_id}-${row.nom_article}`}
                  className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Statistique article MP
                      </p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                        {row.nom_article}
                      </h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {row.categorie || "-"} | {row.gamme || "-"}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm">
                        Total sorti (12 derniers mois) :
                        <span className="ml-2 font-bold text-red-900">{row.total_sorti}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    {yearMonthRows.length === 0 ? (
                      <p className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                        Aucun mouvement enregistre pour cet article.
                      </p>
                    ) : (
                      <StatistiqueChart rows={yearMonthRows} />
                    )}
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
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Categorie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Gamme</th>
                    {monthColumns.map((monthKey) => (
                      <th key={monthKey} className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-center font-semibold">
                        {formatMonthLabel(monthKey)}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-center font-semibold">Total sorti</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={`${row.article_id}-${row.nom_article}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-4 py-3 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.gamme || "-"}</td>
                      {monthColumns.map((monthKey) => (
                        <td key={monthKey} className="px-4 py-3 text-center text-slate-700">
                          {Number(row.by_month[monthKey] ?? 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-bold text-amber-900">
                        {row.total_sorti}
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
                  href={`/stock/matiere-premiere/rapport/mouvements?page=${Math.max(1, currentPage - 1)}&article_q=${encodeURIComponent(articleQ)}`}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    currentPage === 1
                      ? "pointer-events-none bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  Precedent
                </Link>
                <Link
                  href={`/stock/matiere-premiere/rapport/mouvements?page=${Math.min(totalPages, currentPage + 1)}&article_q=${encodeURIComponent(articleQ)}`}
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
