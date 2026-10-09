import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { CartonMensuelLineChart } from "../../production/rapport/carton-mensuel/carton-mensuel-line-chart";
import { calculerGrapheCharges } from "../graphe-donnees";

// Graphe cout par carton : reprend la logique du fichier Excel de suivi de
// paie de l'usine ("graphe 2026") - plusieurs courbes de cout par carton
// fabrique (journalier, cosmetique, energie, embauches, global) plus le nb
// carton fabrique (divise par 100 pour rester sur le meme axe, comme dans
// le fichier source) sur un seul graphe, un mois a la fois pour l'annee
// choisie. Formules calculees proprement a partir de Charges Usine + Prix
// Carburant + production reelle, pas une copie cellule a cellule du
// fichier (qui contient quelques petites incoherences de calcul).
function formatNombre(value: number | null, decimals = 0) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

const EXPORT_COLUMNS = [
  { label: "Mois", key: "moisLabel" },
  { label: "Nb carton fabrique", key: "nbCartonLabel" },
  { label: "Cout journalier total", key: "coutJournalierTotalLabel" },
  { label: "Cout journalier cosmetique", key: "coutJournalierCosmetiqueLabel" },
  { label: "Cout / carton - journalier total", key: "r1Label" },
  { label: "Cout / carton - journalier cosmetique", key: "r2Label" },
  { label: "Cout / carton - cosmetique + energie cosmetique", key: "r3Label" },
  { label: "Cout / carton - journalier + energie totale", key: "r4Label" },
  { label: "Cout / carton - journalier + embauches + energie totale", key: "r5Label" },
  { label: "Cout / carton - global (energie + salaires + depenses)", key: "r6Label" },
];

type SearchParams = Promise<{ annee?: string }>;

export default async function GrapheCoutCartonPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const annee = Number(params.annee) || currentYear;
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  const monthRows = await calculerGrapheCharges(annee);

  const chartSeries = [
    { key: "r1", label: "Cout / carton - journalier total", color: "#2a78d6", values: monthRows.map((r) => r.r1 ?? 0) },
    { key: "r2", label: "Cout / carton - journalier cosmetique", color: "#eb6834", values: monthRows.map((r) => r.r2 ?? 0) },
    { key: "r3", label: "Cout / carton - cosmetique + energie cosmetique", color: "#1baf7a", values: monthRows.map((r) => r.r3 ?? 0) },
    { key: "r4", label: "Cout / carton - journalier + energie totale", color: "#eda100", values: monthRows.map((r) => r.r4 ?? 0) },
    { key: "r5", label: "Cout / carton - journalier + embauches + energie totale", color: "#e87ba4", values: monthRows.map((r) => r.r5 ?? 0) },
    { key: "r6", label: "Cout / carton - global (energie + salaires + depenses)", color: "#008300", values: monthRows.map((r) => r.r6 ?? 0) },
    {
      key: "nbCarton",
      label: "Nb carton fabrique (divise par 100)",
      color: "#4a3aa7",
      values: monthRows.map((r) => r.nbCarton / 100),
      displayValues: monthRows.map((r) => r.nbCarton),
    },
  ];

  const exportRows = monthRows.map((row) => ({
    moisLabel: row.moisLabel,
    nbCartonLabel: Math.round(row.nbCarton),
    coutJournalierTotalLabel: Math.round(row.journalierTotal),
    coutJournalierCosmetiqueLabel: Math.round(row.journalierCosmetique),
    r1Label: formatNombre(row.r1, 1),
    r2Label: formatNombre(row.r2, 1),
    r3Label: formatNombre(row.r3, 1),
    r4Label: formatNombre(row.r4, 1),
    r5Label: formatNombre(row.r5, 1),
    r6Label: formatNombre(row.r6, 1),
  }));

  const hasAnyData = monthRows.some((row) => row.hasData || row.nbCarton > 0);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Graphe Cout par Carton</h1>
              <p className="mt-2 text-sm text-slate-600">
                Cout par carton fabrique (journalier, cosmetique, energie, embauches, global) compare au nb
                carton fabrique, mois par mois - calcule depuis Charges Usine, Tarifs et les cartons
                entres au Depot A (Entree Production).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/charges"
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
              >
                Charges Usine
              </Link>
              <BackButton href="/" label="Retour accueil" />
              <ExportExcelButton
                rows={exportRows}
                columns={EXPORT_COLUMNS}
                filename={`graphe-cout-carton-${annee}.xlsx`}
              />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="flex items-end gap-3">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Annee
              <select
                name="annee"
                defaultValue={annee}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Afficher
            </button>
          </form>
        </section>

        {!hasAnyData ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune donnee pour {annee} - saisissez au moins un mois dans Charges Usine.
          </div>
        ) : (
          <>
            <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <CartonMensuelLineChart months={monthRows.map((r) => r.moisLabel)} series={chartSeries} />
            </section>

            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="max-h-[75vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-950">
                    <tr>
                      <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Mois</th>
                      <th className="sticky top-0 z-10 bg-violet-50 px-4 py-3 font-semibold text-violet-800">
                        Nb carton fabrique
                      </th>
                      <th className="sticky top-0 z-10 bg-blue-50 px-4 py-3 font-semibold text-blue-800">
                        Cout / carton - journalier total
                      </th>
                      <th className="sticky top-0 z-10 bg-orange-50 px-4 py-3 font-semibold text-orange-800">
                        Cout / carton - journalier cosmetique
                      </th>
                      <th className="sticky top-0 z-10 bg-emerald-50 px-4 py-3 font-semibold text-emerald-800">
                        Cout / carton - cosmetique + energie cosmetique
                      </th>
                      <th className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800">
                        Cout / carton - journalier + energie totale
                      </th>
                      <th className="sticky top-0 z-10 bg-pink-50 px-4 py-3 font-semibold text-pink-800">
                        Cout / carton - + embauches + energie totale
                      </th>
                      <th className="sticky top-0 z-10 bg-green-50 px-4 py-3 font-semibold text-green-800">
                        Cout / carton - global
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map((row) => (
                      <tr key={row.mois} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {row.moisLabel} {annee}
                        </td>
                        <td className="bg-violet-50/30 px-4 py-3 text-slate-600">
                          {formatNombre(row.nbCarton)}
                          {row.nbCartonEstManuel ? (
                            <span className="ml-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                              manuel
                            </span>
                          ) : null}
                        </td>
                        <td className="bg-blue-50/30 px-4 py-3 text-slate-600">{formatNombre(row.r1, 1)}</td>
                        <td className="bg-orange-50/30 px-4 py-3 text-slate-600">{formatNombre(row.r2, 1)}</td>
                        <td className="bg-emerald-50/30 px-4 py-3 text-slate-600">{formatNombre(row.r3, 1)}</td>
                        <td className="bg-amber-50/30 px-4 py-3 text-slate-600">{formatNombre(row.r4, 1)}</td>
                        <td className="bg-pink-50/30 px-4 py-3 text-slate-600">{formatNombre(row.r5, 1)}</td>
                        <td className="bg-green-50/30 px-4 py-3 font-semibold text-green-800">
                          {formatNombre(row.r6, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
