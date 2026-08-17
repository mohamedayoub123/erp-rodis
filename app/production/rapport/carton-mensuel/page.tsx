import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { CartonMensuelLineChart } from "./carton-mensuel-line-chart";
import {
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllProgrammeLignes,
  groupCartonEntriesByLigne,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../suivi/data";

// Rapport Carton mensuel : par mois (date programme), total carton commande
// vs total carton reellement fabrique, et le % de programmes (codes)
// termines ce mois-la - vue d'ensemble/tendance, contrairement a Rapport
// Carton qui liste chaque code individuellement.
type Statut = "Termine" | "Termine Manuel" | "En cours" | "Pas commence";

const EXPORT_COLUMNS = [
  { label: "Mois", key: "moisLabel" },
  { label: "Carton commande", key: "totalCommande" },
  { label: "Carton fabrique", key: "totalFabrique" },
  { label: "Ecart (fabrique - commande)", key: "ecart" },
  { label: "Codes termines", key: "nbTermines" },
  { label: "Codes total", key: "nbTotal" },
  { label: "% programme fait", key: "pctLabel" },
];

const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function moisLabel(key: string) {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  return `${MOIS_NOMS[index] ?? month} ${year}`;
}

export default async function RapportCartonMensuelPage() {
  noStore();

  const [{ rows: lignes }, cartonEntries] = await Promise.all([
    fetchAllProgrammeLignes(),
    fetchAllCartonEntries(),
  ]);

  const codeTermineRows = await fetchAllCodeTermineRows(lignes.map((ligne) => ligne.id));
  const terminatedCodes = new Set(
    codeTermineRows.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`)
  );

  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);

  function ligneOwnCodes(ligne: ProgrammeLigneRow): string[] {
    return splitLigneIntoDisplayRows(ligne, "qt_vrac", 0).map((split) => split.displayCode);
  }

  const lignesWithLot = lignes.filter((ligne) => ligne.numero_lot);

  const allRows = lignesWithLot.flatMap((ligne) => {
    const codes = ligneOwnCodes(ligne);
    const cartonEntriesForLigne = (cartonByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];

    const cartonSplits = splitLigneIntoDisplayRows(ligne, "qt_carton", 0);
    const cartonDemandeByCode = new Map(
      cartonSplits.map((split) => [split.displayCode, split.displayQuantite ?? ligne.qt_carton ?? 0])
    );

    const cartonFabriqueByCode = computeProduitParCode(
      cartonEntriesForLigne,
      codes,
      (code) => cartonDemandeByCode.get(code) ?? 0
    );

    return codes.map((code) => {
      const cartonDemande = cartonDemandeByCode.get(code) ?? 0;
      const cartonFabrique = cartonFabriqueByCode.get(code) ?? 0;

      const cartonManuel = Boolean(
        ligne.programme_termine || ligne.carton_termine || terminatedCodes.has(`${ligne.id}::${code}::carton`)
      );
      const cartonNaturel = cartonDemande <= 0 || cartonFabrique >= cartonDemande;
      const hasStarted = cartonFabrique > 0;
      const statut: Statut =
        cartonManuel || cartonNaturel
          ? cartonNaturel
            ? "Termine"
            : "Termine Manuel"
          : hasStarted
            ? "En cours"
            : "Pas commence";

      return {
        mois: (ligne.date_jour || "").slice(0, 7),
        cartonDemande,
        cartonFabrique,
        statut,
      };
    });
  });

  // Codes sans rien a comparer (jamais rien commande ni fabrique) - meme
  // garde-fou que Rapport Carton, sinon un code 0/0 fausse a la fois le
  // total et le % de programme fait.
  const rows = allRows.filter((row) => !(row.cartonDemande <= 0 && row.cartonFabrique <= 0) && row.mois);

  const byMonth = new Map<
    string,
    { totalCommande: number; totalFabrique: number; nbTotal: number; nbTermines: number }
  >();

  for (const row of rows) {
    const current = byMonth.get(row.mois) ?? {
      totalCommande: 0,
      totalFabrique: 0,
      nbTotal: 0,
      nbTermines: 0,
    };
    current.totalCommande += row.cartonDemande;
    current.totalFabrique += row.cartonFabrique;
    current.nbTotal += 1;
    if (row.statut === "Termine" || row.statut === "Termine Manuel") current.nbTermines += 1;
    byMonth.set(row.mois, current);
  }

  const monthRows = [...byMonth.entries()]
    .map(([mois, stats]) => ({
      mois,
      moisLabel: moisLabel(mois),
      totalCommande: stats.totalCommande,
      totalFabrique: stats.totalFabrique,
      ecart: stats.totalFabrique - stats.totalCommande,
      nbTotal: stats.nbTotal,
      nbTermines: stats.nbTermines,
      pct: stats.nbTotal > 0 ? (stats.nbTermines / stats.nbTotal) * 100 : 0,
    }))
    .sort((a, b) => b.mois.localeCompare(a.mois));

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
