import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { formatDate } from "../../production/suivi/data";
import { matchesArticleSearch } from "@/lib/article-search";
import { RavitailleurArticlesFilterForm } from "./filter-form";

const QT_EMBALLER_COLUMNS = [1, 2, 3, 4, 5, 6, 7];

type DispatcherRow = {
  id: number;
  produit: string | null;
  code: string | null;
  qt_carton: number | null;
};

async function fetchAllDispatcherRows(): Promise<DispatcherRow[]> {
  const rows: DispatcherRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .select("id, produit, code, qt_carton")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as DispatcherRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function formatCell(value: number | null) {
  if (value === null) return "";
  return Math.round(value).toLocaleString("fr-FR");
}

type SearchParams = Promise<{ article?: string; code?: string }>;

export default async function RavitailleurArticlesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const codeFilter = (params.code || "").trim();

  const allRows = await fetchAllDispatcherRows();

  const articleFilterLower = articleFilter.toLowerCase();
  const codeFilterLower = codeFilter.toLowerCase();

  const filteredRows = allRows.filter((row) => {
    if (articleFilterLower && !matchesArticleSearch(row.produit || "", articleFilterLower)) return false;
    if (codeFilterLower && !String(row.code || "").toLowerCase().includes(codeFilterLower)) return false;
    return true;
  });

  // Vue "par article" : classee par produit (au lieu de par zone comme les
  // tableaux Ravitailleur existants) pour retrouver rapidement le code et la
  // quantite carton d'un article donne, toutes zones confondues.
  const rows = [...filteredRows].sort((a, b) => {
    const produitCompare = (a.produit || "").localeCompare(b.produit || "", "fr", { sensitivity: "base" });
    if (produitCompare !== 0) return produitCompare;
    return (a.code || "").localeCompare(b.code || "", "fr", { numeric: true });
  });

  const articleOptions = [...new Set(allRows.map((row) => row.produit).filter((v): v is string => !!v))].map(
    (label, id) => ({ id, label })
  );
  const codeOptions = [...new Set(allRows.map((row) => row.code).filter((v): v is string => !!v))].map(
    (label, id) => ({ id, label })
  );

  // Une seule date pour toute la feuille (au lieu d'une date par ligne) -
  // ce tableau sert de feuille de suivi d'emballage imprimee pour une
  // journee donnee, pas d'un historique par date de production.
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Ravitailleur par article
              </h1>
              <p className="mt-2 text-sm font-semibold text-slate-600">Date : {formatDate(todayIso)}</p>
            </div>

            <div className="no-print flex items-center gap-3">
              <BackButton href="/ravitailleur-par-ligne" />
              <RefreshButton />
              <SimplePrintButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="no-print">
            <RavitailleurArticlesFilterForm
              defaultArticle={articleFilter}
              defaultCode={codeFilter}
              articleOptions={articleOptions}
              codeOptions={codeOptions}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-200 px-3 py-2 text-left font-bold text-slate-900">
                    ARTICLE
                  </th>
                  <th className="border border-slate-300 bg-slate-200 px-3 py-2 text-center font-bold text-slate-900">
                    CODE
                  </th>
                  <th className="border border-slate-300 bg-slate-200 px-3 py-2 text-center font-bold text-slate-900">
                    QT CARTON
                  </th>
                  {QT_EMBALLER_COLUMNS.map((n) => (
                    <th
                      key={n}
                      className="border border-slate-300 bg-slate-200 px-3 py-2 text-center font-bold text-slate-900"
                    >
                      QT EMBALLER {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + QT_EMBALLER_COLUMNS.length}
                      className="border border-slate-300 bg-white px-3 py-6 text-center text-slate-500"
                    >
                      Aucun resultat.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="border border-slate-300 bg-white px-3 py-3 font-medium text-slate-900">
                        {row.produit || "-"}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3 text-center">{row.code || "-"}</td>
                      <td className="border border-slate-300 bg-white px-3 py-3 text-center">
                        {formatCell(row.qt_carton)}
                      </td>
                      {QT_EMBALLER_COLUMNS.map((n) => (
                        <td key={n} className="border border-slate-300 bg-white px-3 py-3" />
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
