import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { deleteMachineAction } from "./actions";
import { AddMachineForm } from "./add-machine-form";
import { MachineTypeProduitSelect } from "./type-produit-select";
import { MachineNomCell, MachineZoneCell } from "./machine-cells";

type MachineRow = {
  id: number;
  nom: string;
  zone: string | null;
  type: string | null;
  type_produit: string[] | null;
};

// Triee par zone d'abord (regroupe visuellement les machines d'une meme
// zone), puis par nom a l'interieur de chaque zone.
async function fetchAllMachines(): Promise<{ rows: MachineRow[]; error: { message: string } | null }> {
  const { data, error } = await supabaseServer
    .from("machines")
    .select("id, nom, zone, type, type_produit")
    .order("zone", { ascending: true, nullsFirst: false })
    .order("nom", { ascending: true });

  if (error) return { rows: [], error };
  return { rows: (data ?? []) as MachineRow[], error: null };
}

type SearchParams = Promise<{ zone?: string; nom?: string }>;

export default async function MachinesPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const params = await searchParams;
  const zoneFilter = (params.zone || "").trim();
  const nomFilter = (params.nom || "").trim().toLowerCase();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "machines");
  const canDelete = await canDeletePageUser(currentUser, "machines");

  const { rows: allRows, error } = await fetchAllMachines();

  const distinctZones = [...new Set(allRows.map((m) => m.zone).filter(Boolean))].sort((a, b) =>
    (a as string).localeCompare(b as string, "fr", { sensitivity: "base" })
  ) as string[];
  const machineOptions = allRows.map((m) => ({ id: m.id, label: m.nom }));

  const rows = allRows
    .filter((m) => !zoneFilter || m.zone === zoneFilter)
    .filter((m) => !nomFilter || m.nom.toLowerCase().includes(nomFilter));

  const hasFilters = Boolean(zoneFilter || nomFilter);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Machines</h1>
              <p className="mt-2 text-sm text-slate-600">
                Liste des machines de production. Ouvre une machine pour lui associer ses produits,
                avec la capacite, le min/max et le temps par produit.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canEdit ? (
          <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-sky-700 marker:content-none">
              + Ajouter machine
            </summary>
            <AddMachineForm />
          </details>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <select
              name="zone"
              defaultValue={zoneFilter}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Toutes les zones</option>
              {distinctZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <SearchableFilterInput
              name="nom"
              defaultValue={params.nom || ""}
              options={machineOptions}
              placeholder="Machine"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/machines"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucune machine pour le moment."}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Nom</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Zone</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Type</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Type de produit</th>
                    {canDelete ? <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((machine) => (
                    <tr key={machine.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <MachineNomCell machine={machine} canEdit={canEdit} />
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <MachineZoneCell machine={machine} canEdit={canEdit} />
                      </td>
                      <td className="px-6 py-4 text-slate-600">{machine.type || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {canEdit ? (
                          <MachineTypeProduitSelect machine={machine} />
                        ) : (
                          (machine.type_produit && machine.type_produit.length > 0
                            ? machine.type_produit.join(", ")
                            : "-")
                        )}
                      </td>
                      {canDelete ? (
                        <td className="px-6 py-4">
                          <form action={deleteMachineAction}>
                            <input type="hidden" name="id" value={machine.id} />
                            <DeleteIconButton label={`Supprimer ${machine.nom}`} />
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
