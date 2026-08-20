import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { deleteChargesUsineAction } from "./actions";
import { ChargesUsineForm } from "./charges-form";
import { CARTON_MANUEL_FIELD, MOIS_NOMS, NUMERIC_FIELDS, type ChargeRow, type FieldKey } from "./fields";

// Champs de consommation carburant (litres) qui ont un cout calcule via le
// prix du litre saisi sur /charges/prix pour le meme mois - gasoil
// plastique/cosmetique partagent le meme prix (un seul carburant physique).
// Electricite (kWh) suit le meme principe depuis l'ajout de Prix Electricite.
const COST_FIELDS = [
  { key: "gaz", priceKey: "prix_gaz", label: "Cout Gaz" },
  { key: "essence", priceKey: "prix_essence", label: "Cout Essence" },
  { key: "gasoil_plastique", priceKey: "prix_gasoil", label: "Cout Gasoil Plastique" },
  { key: "gasoil_cosmetique", priceKey: "prix_gasoil", label: "Cout Gasoil Cosmetique" },
  { key: "electricite_plastique", priceKey: "prix_kwh", label: "Cout Electricite Plastique" },
  { key: "electricite_cosmetique", priceKey: "prix_kwh", label: "Cout Electricite Cosmetique" },
] as const satisfies readonly { key: FieldKey; priceKey: PrixFieldKey; label: string }[];

const PRIX_FIELD_KEYS = ["prix_gaz", "prix_essence", "prix_gasoil", "prix_kwh"] as const;
type PrixFieldKey = (typeof PRIX_FIELD_KEYS)[number];

type PrixRow = { annee: number; mois: number } & Record<PrixFieldKey, number | null>;

function formatNombre(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

async function fetchAllCharges(): Promise<{ rows: ChargeRow[]; error: { message: string } | null }> {
  const { data, error } = await supabaseServer
    .from("charges_usine")
    .select(
      `id, annee, mois, utilisateur, ${CARTON_MANUEL_FIELD.key}, ${NUMERIC_FIELDS.map((f) => f.key).join(", ")}`
    )
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  if (error) return { rows: [], error };
  return { rows: (data ?? []) as unknown as ChargeRow[], error: null };
}

async function fetchAllPrixCarburant(): Promise<{ rows: PrixRow[]; error: { message: string } | null }> {
  const { data, error } = await supabaseServer
    .from("prix_carburant")
    .select(`annee, mois, ${PRIX_FIELD_KEYS.join(", ")}`);

  if (error) return { rows: [], error };
  return { rows: (data ?? []) as unknown as PrixRow[], error: null };
}

export default async function ChargesPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "chargesHub");
  const canDelete = await canDeletePageUser(currentUser, "chargesHub");

  const { rows, error } = await fetchAllCharges();
  const { rows: prixRows } = await fetchAllPrixCarburant();
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  const prixByKey = new Map<string, PrixRow>();
  for (const prix of prixRows) {
    prixByKey.set(`${prix.annee}-${prix.mois}`, prix);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Charges Usine</h1>
              <p className="mt-2 text-sm text-slate-600">
                Consommations et depenses saisies une fois par mois (electricite, gaz, gasoil, essence,
                salaires, autres).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/charges/graphe"
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
              >
                Graphe cout carton
              </Link>
              <Link
                href="/charges/prix"
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
              >
                Tarifs
              </Link>
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canEdit ? <ChargesUsineForm rows={rows} yearOptions={yearOptions} currentYear={currentYear} /> : null}

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
                    {NUMERIC_FIELDS.map((field) => (
                      <th key={field.key} className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                        {field.label}
                      </th>
                    ))}
                    {COST_FIELDS.map((field) => (
                      <th
                        key={field.key}
                        className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800"
                      >
                        {field.label}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Total</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Saisi par</th>
                    {canDelete ? (
                      <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Action</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const prix = prixByKey.get(`${row.annee}-${row.mois}`);
                    const fuelCostByKey = new Map<FieldKey, number | null>();
                    for (const field of COST_FIELDS) {
                      const litres = row[field.key];
                      const prixLitre = prix?.[field.priceKey] ?? null;
                      fuelCostByKey.set(
                        field.key,
                        litres !== null && prixLitre !== null ? litres * prixLitre : null
                      );
                    }
                    const nonFuelTotal = NUMERIC_FIELDS.filter(
                      (field) => !COST_FIELDS.some((c) => c.key === field.key)
                    ).reduce((sum, field) => sum + Number(row[field.key] ?? 0), 0);
                    const fuelCostTotal = COST_FIELDS.reduce(
                      (sum, field) => sum + Number(fuelCostByKey.get(field.key) ?? 0),
                      0
                    );
                    const total = nonFuelTotal + fuelCostTotal;
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {MOIS_NOMS[row.mois - 1]} {row.annee}
                        </td>
                        {NUMERIC_FIELDS.map((field) => (
                          <td key={field.key} className="px-4 py-3 text-slate-600">
                            {formatNombre(row[field.key])}
                          </td>
                        ))}
                        {COST_FIELDS.map((field) => (
                          <td key={field.key} className="px-4 py-3 text-amber-700">
                            {formatNombre(fuelCostByKey.get(field.key) ?? null)}
                          </td>
                        ))}
                        <td className="px-4 py-3 font-semibold text-amber-700">{formatNombre(total)}</td>
                        <td className="px-4 py-3 text-slate-600">{row.utilisateur || "-"}</td>
                        {canDelete ? (
                          <td className="px-4 py-3">
                            <form action={deleteChargesUsineAction}>
                              <input type="hidden" name="id" value={row.id} />
                              <DeleteIconButton label={`Supprimer ${MOIS_NOMS[row.mois - 1]} ${row.annee}`} />
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
      </div>
    </main>
  );
}
