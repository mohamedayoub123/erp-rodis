import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { CartonMensuelLineChart } from "./carton-mensuel-line-chart";
import { calculerCartonMensuel } from "./calcul";

// Rapport Carton mensuel : par mois (date programme), total carton commande
// vs total carton reellement fabrique, et le % de programmes (codes)
// termines ce mois-la - vue d'ensemble/tendance, contrairement a Rapport
// Carton qui liste chaque code individuellement.
const EXPORT_COLUMNS = [
  { label: "Mois", key: "moisLabel" },
  { label: "Carton commande", key: "totalCommande" },
  { label: "Carton fabrique", key: "totalFabrique" },
  { label: "Ecart (fabrique - commande)", key: "ecart" },
  { label: "Codes termines", key: "nbTermines" },
  { label: "Codes total", key: "nbTotal" },
  { label: "% programme fait", key: "pctLabel" },
];

export default async function RapportCartonMensuelPage() {
  noStore();

  const monthRows = await calculerCartonMensuel();

  // Ordre chronologique croissant pour le graphe (le tableau, lui, reste du
  // plus recent au plus ancien pour la lecture).
  const monthRowsAscending = [...monthRows].sort((a, b) => a.mois.localeCompare(b.mois));
  const chartSeries = [
    {
      key: "commande",
      label: "Carton commande",
      color: "#d97706",
      values: monthRowsAscending.map((row) => row.totalCommande),
    },
    {
      key: "fabrique",
      label: "Carton fabrique",
      color: "#0284c7",
      values: monthRowsAscending.map((row) => row.totalFabrique),
    },
  ];

  const exportRows = monthRows.map((row) => ({
    moisLabel: row.moisLabel,
    totalCommande: Math.round(row.totalCommande),
    totalFabrique: Math.round(row.totalFabrique),
    ecart: Math.round(row.ecart),
    nbTermines: row.nbTermines,
    nbTotal: row.nbTotal,
    pctLabel: `${Math.round(row.pct)}%`,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Rapport Carton Mensuel
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Par mois : total carton commande vs total carton reellement fabrique, et le % de codes
                termines ce mois-la.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <ExportExcelButton
                rows={exportRows}
                columns={EXPORT_COLUMNS}
                filename={`rapport-carton-mensuel-${new Date().toISOString().slice(0, 10)}.xlsx`}
              />
              <RefreshButton />
            </div>
          </div>
        </section>

        {monthRows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucun programme pour le moment.
          </div>
        ) : (
          <>
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <CartonMensuelLineChart
              months={monthRowsAscending.map((row) => row.moisLabel)}
              series={chartSeries}
            />
          </section>

          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Mois</th>
                    <th className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800">
                      Carton commande
                    </th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                      Carton fabrique
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Ecart</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Codes termines / total
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      % programme fait
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((row) => (
                    <tr key={row.mois} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.moisLabel}</td>
                      <td className="bg-amber-50/30 px-4 py-3 text-slate-600">
                        {Math.round(row.totalCommande)}
                      </td>
                      <td className="bg-sky-50/30 px-4 py-3 text-slate-600">
                        {Math.round(row.totalFabrique)}
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          row.ecart < 0 ? "text-red-700" : row.ecart > 0 ? "text-emerald-700" : "text-slate-500"
                        }`}
                      >
                        {Math.round(row.ecart)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.nbTermines} / {row.nbTotal}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, Math.round(row.pct))}%` }}
                            />
                          </div>
                          <span className="font-semibold text-slate-700">{Math.round(row.pct)}%</span>
                        </div>
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
