import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteFormationRowAction } from "./actions";
import { FormationForm } from "./formation-form";
import { MOIS_FIELD_KEYS, MOIS_NOMS, type FormationRow } from "./fields";

// PR4 > Formation : reprend le fichier Excel "GFPC-ENR-015 Plan de
// formation cosmetique.xlsx" (1 sheet par annee) - categorie/formation en
// ligne, mois en colonne, "x" + detail de date par mois planifie. Import
// historique 2024-2026 fait une fois via script, cette page sert ensuite a
// consulter et corriger/ajouter des lignes.
async function fetchFormationRows(): Promise<FormationRow[]> {
  const { data, error } = await supabaseServer
    .from("pr4_formation_plan")
    .select(
      "id, annee, categorie, formation, ordre, est_bilan, m1_planifie, m1_date, m2_planifie, m2_date, m3_planifie, m3_date, m4_planifie, m4_date, m5_planifie, m5_date, m6_planifie, m6_date, m7_planifie, m7_date, m8_planifie, m8_date, m9_planifie, m9_date, m10_planifie, m10_date, m11_planifie, m11_date, m12_planifie, m12_date"
    )
    .order("annee", { ascending: false })
    .order("est_bilan", { ascending: true })
    .order("ordre", { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as FormationRow[];
}

function MonthCell({ planifie, date }: { planifie: boolean; date: string | null }) {
  if (!planifie) return <td className="border border-slate-200 px-3 py-2 text-center text-slate-300">-</td>;
  return (
    <td className="border border-slate-200 bg-emerald-50/60 px-3 py-2 text-center">
      <span className="font-semibold text-emerald-700">✓</span>
      {date ? <div className="mt-0.5 text-[10px] text-emerald-700/70">{date}</div> : null}
    </td>
  );
}

type SearchParams = Promise<{ annee?: string }>;

export default async function FormationPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "qualiteRevueProcessus");
  const canDelete = await canDeletePageUser(currentUser, "qualiteRevueProcessus");

  const allRows = await fetchFormationRows();
  const currentYear = new Date().getFullYear();
  const yearOptions = [...new Set(allRows.map((row) => row.annee))].sort((a, b) => b - a);
  if (!yearOptions.includes(currentYear)) yearOptions.unshift(currentYear);

  const selectedYear = Number(params.annee) || yearOptions[0] || currentYear;
  const rowsForYear = allRows.filter((row) => row.annee === selectedYear);
  const trainingRows = rowsForYear.filter((row) => !row.est_bilan);
  const bilanRows = rowsForYear.filter((row) => row.est_bilan);

  const formYearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 4 + i);

  const exportRows = rowsForYear.map((row) => {
    const base: Record<string, string | number | null> = {
      categorie: row.categorie ?? "",
      formation: row.formation,
    };
    for (const { planifieKey, dateKey, label } of MOIS_FIELD_KEYS) {
      base[planifieKey] = row[planifieKey] ? "x" : "";
      base[`${dateKey}_label`] = (row[dateKey] as string | null) ?? "";
      void label;
    }
    return base;
  });
  const exportColumns = [
    { label: "Categorie", key: "categorie" },
    { label: "Formation", key: "formation" },
    ...MOIS_FIELD_KEYS.flatMap(({ planifieKey, dateKey, label }) => [
      { label: `${label} - planifie`, key: planifieKey as string },
      { label: `${label} - date`, key: `${dateKey}_label` },
    ]),
  ];

  // showCategorie precalcule (pas de mutation pendant le rendu) : la
  // categorie ne s'affiche que sur la premiere ligne d'un groupe, comme les
  // cellules fusionnees dans l'Excel source.
  const trainingRowsDisplay = trainingRows.map((row, index) => ({
    row,
    showCategorie: index === 0 || row.categorie !== trainingRows[index - 1].categorie,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Formation</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite/revue-processus/pr4" label="Retour PR4" />
              <ExportExcelButton
                rows={exportRows}
                columns={exportColumns}
                filename={`pr4-formation-${selectedYear}.xlsx`}
              />
              <RefreshButton />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {yearOptions.map((year) => (
              <Link
                key={year}
                href={`/qualite/revue-processus/pr4/formation?annee=${year}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  year === selectedYear ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {year}
              </Link>
            ))}
          </div>
        </section>

        {canEdit ? <FormationForm rows={allRows} yearOptions={formYearOptions} currentYear={selectedYear} /> : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Plan de formation {selectedYear}</h2>
          </div>

          {trainingRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Aucune formation pour {selectedYear}.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-20 bg-slate-100 text-slate-950">
                  <tr>
                    <th className="sticky left-0 z-30 w-[180px] min-w-[180px] max-w-[180px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      Categorie
                    </th>
                    <th className="sticky left-[180px] z-30 w-[260px] min-w-[260px] max-w-[260px] border border-slate-200 bg-slate-100 px-3 py-2 font-semibold">
                      Formation
                    </th>
                    {MOIS_NOMS.map((mois) => (
                      <th key={mois} className="border border-slate-200 px-3 py-2 text-center font-semibold">
                        {mois}
                      </th>
                    ))}
                    {canDelete ? (
                      <th className="border border-slate-200 px-3 py-2 text-center font-semibold">Action</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {trainingRowsDisplay.map(({ row, showCategorie }) => {
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="sticky left-0 z-10 w-[180px] min-w-[180px] max-w-[180px] border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                          {showCategorie ? row.categorie || "-" : ""}
                        </td>
                        <td className="sticky left-[180px] z-10 w-[260px] min-w-[260px] max-w-[260px] border border-slate-200 bg-white px-3 py-2 text-slate-900">
                          {row.formation}
                        </td>
                        {MOIS_FIELD_KEYS.map(({ planifieKey, dateKey }) => (
                          <MonthCell key={planifieKey} planifie={Boolean(row[planifieKey])} date={row[dateKey] as string | null} />
                        ))}
                        {canDelete ? (
                          <td className="border border-slate-200 px-3 py-2 text-center">
                            <form action={deleteFormationRowAction}>
                              <input type="hidden" name="id" value={row.id} />
                              <DeleteIconButton label={`Supprimer ${row.formation}`} />
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {bilanRows.length > 0 ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Bilan {selectedYear}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <tbody>
                  {bilanRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="w-[440px] min-w-[440px] max-w-[440px] border border-slate-200 bg-violet-50 px-3 py-2 font-semibold text-violet-800">
                        {row.formation}
                      </td>
                      {MOIS_FIELD_KEYS.map(({ planifieKey, dateKey }) => (
                        <MonthCell key={planifieKey} planifie={Boolean(row[planifieKey])} date={row[dateKey] as string | null} />
                      ))}
                      {canDelete ? (
                        <td className="border border-slate-200 px-3 py-2 text-center">
                          <form action={deleteFormationRowAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <DeleteIconButton label={`Supprimer ${row.formation}`} />
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
