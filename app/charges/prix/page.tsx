import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { deletePrixCarburantAction, savePrixCarburantAction } from "./actions";

// Prix au litre du gaz/essence/gasoil, saisis par mois - sert a calculer
// automatiquement le cout carburant sur la page Charges Usine a partir de
// la consommation en litres saisie la-bas (meme mois).
const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

const PRIX_FIELDS = [
  { key: "prix_gaz", label: "Prix Gaz (par litre)" },
  { key: "prix_essence", label: "Prix Essence (par litre)" },
  { key: "prix_gasoil", label: "Prix Gasoil (par litre)" },
] as const;

type FieldKey = (typeof PRIX_FIELDS)[number]["key"];

type PrixRow = { id: number; annee: number; mois: number; utilisateur: string | null } & Record<
  FieldKey,
  number | null
>;

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
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Prix Carburant</h1>
              <p className="mt-2 text-sm text-slate-600">
                Prix au litre saisi chaque mois - sert a calculer automatiquement le cout gaz/essence/gasoil
                sur la page Charges Usine a partir des litres consommes.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/charges" label="Retour Charges Usine" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canEdit ? (
          <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-amber-700 marker:content-none">
              + Saisir un mois (ou corriger un mois deja saisi)
            </summary>
            <form action={savePrixCarburantAction} className="grid gap-4 border-t border-slate-100 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Annee
                  <select
                    name="annee"
                    defaultValue={currentYear}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Mois
                  <select
                    name="mois"
                    defaultValue={new Date().getMonth() + 1}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                  >
                    {MOIS_NOMS.map((nom, index) => (
                      <option key={nom} value={index + 1}>
                        {nom}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PRIX_FIELDS.map((field) => (
                  <label key={field.key} className="grid gap-1 text-xs font-semibold text-slate-500">
                    {field.label}
                    <input
                      type="number"
                      step="0.01"
                      name={field.key}
                      placeholder="0"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                ))}
              </div>

              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white"
                >
                  Enregistrer ce mois
                </SubmitButton>
              </div>
            </form>
          </details>
        ) : null}

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
