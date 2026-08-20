import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { deletePrixCarburantAction } from "./actions";
import { PrixCarburantForm } from "./prix-form";
import { MOIS_NOMS, PRIX_FIELDS } from "./fields";
import type { PrixRow } from "./fields";

function formatNombre(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

async function fetchAllPrixCarburant(): Promise<{ rows: PrixRow[]; error: { message: string } | null }> {
  const { data, error } = await supabaseServer
    .from("prix_carburant")
    .select(`id, annee, mois, utilisateur, ${PRIX_FIELDS.map((f) => f.key).join(", ")}`)
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  if (error) return { rows: [], error };
  return { rows: (data ?? []) as unknown as PrixRow[], error: null };
}

export default async function PrixCarburantPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "chargesHub");
  const canDelete = await canDeletePageUser(currentUser, "chargesHub");

  const { rows, error } = await fetchAllPrixCarburant();
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Tarifs</h1>
              <p className="mt-2 text-sm text-slate-600">
                Prix/tarifs saisis chaque mois (gaz, essence, gasoil, electricite, main d&apos;oeuvre) - servent
                a calculer automatiquement les couts sur la page Charges Usine a partir des quantites consommees.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/charges" label="Retour Charges Usine" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canEdit ? <PrixCarburantForm rows={rows} yearOptions={yearOptions} currentYear={currentYear} /> : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun mois saisi pour le moment.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Mois</th>
                    {PRIX_FIELDS.map((field) => (
                      <th key={field.key} className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                        {field.label}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Saisi par</th>
                    {canDelete ? (
                      <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Action</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {MOIS_NOMS[row.mois - 1]} {row.annee}
                      </td>
                      {PRIX_FIELDS.map((field) => (
                        <td key={field.key} className="px-4 py-3 text-slate-600">
                          {formatNombre(row[field.key])}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-slate-600">{row.utilisateur || "-"}</td>
                      {canDelete ? (
                        <td className="px-4 py-3">
                          <form action={deletePrixCarburantAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <DeleteIconButton label={`Supprimer ${MOIS_NOMS[row.mois - 1]} ${row.annee}`} />
                          </form>
                        </td>
                      ) : null}
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
