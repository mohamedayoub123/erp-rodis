import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { createMachineAction, deleteMachineAction } from "./actions";

const ZONE_OPTIONS = ["B1Z1", "B1Z2", "B4Z1", "B4Z2", "B4Z3", "D"];
const TYPE_OPTIONS = ["Fabrication", "Conditionnement", "Emballage"];

type MachineRow = {
  id: number;
  nom: string;
  zone: string | null;
  type: string | null;
  capacite: number | null;
  capacite_min: number | null;
  capacite_max: number | null;
};

async function fetchAllMachines(): Promise<{ rows: MachineRow[]; error: { message: string } | null }> {
  const { data, error } = await supabaseServer
    .from("machines")
    .select("id, nom, zone, type, capacite, capacite_min, capacite_max")
    .order("nom", { ascending: true });

  if (error) return { rows: [], error };
  return { rows: (data ?? []) as MachineRow[], error: null };
}

function formatNombre(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("fr-FR");
}

export default async function MachinesPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "machines");
  const canDelete = await canDeletePageUser(currentUser, "machines");

  const { rows, error } = await fetchAllMachines();

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
                Liste des machines de production, avec leur zone, leur type et leurs capacites.
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
            <form
              action={createMachineAction}
              className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Nom
                <input
                  type="text"
                  name="nom"
                  required
                  placeholder="Nom de la machine"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Zone
                <select
                  name="zone"
                  defaultValue=""
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                >
                  <option value="">-</option>
                  {ZONE_OPTIONS.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Type
                <select
                  name="type"
                  defaultValue=""
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                >
                  <option value="">-</option>
                  {TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Capacite
                <input
                  type="number"
                  name="capacite"
                  placeholder="Ex: 3000"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Min
                <input
                  type="number"
                  name="capacite_min"
                  placeholder="Ex: 500"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Max
                <input
                  type="number"
                  name="capacite_max"
                  placeholder="Ex: 3000"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white"
                >
                  Ajouter
                </button>
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
            <div className="px-6 py-8 text-sm text-slate-500">Aucune machine pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Nom</th>
                    <th className="px-6 py-4 font-semibold">Zone</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Capacite</th>
                    <th className="px-6 py-4 font-semibold">Min</th>
                    <th className="px-6 py-4 font-semibold">Max</th>
                    {canDelete ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((machine) => (
                    <tr key={machine.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">{machine.nom}</td>
                      <td className="px-6 py-4 text-slate-600">{machine.zone || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{machine.type || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNombre(machine.capacite)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNombre(machine.capacite_min)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNombre(machine.capacite_max)}</td>
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
