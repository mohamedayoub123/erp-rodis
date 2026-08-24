import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { createCommandeAction } from "./actions";
import { CommandeLinesForm } from "./commande-lines-form";

type CommandeRow = { id: number; numero: number | null; date_jour: string; client: string; depot_source_id: number };

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }
  return { rows, error: null };
}

export default async function FacturationCommandeListPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "facturationCommande");

  const [{ rows: depots }, { rows: articlesPfRows }, { data: commandesData }, { data: blData }] = await Promise.all([
    fetchAll<{ id: number; nom: string }>("depots", "id, nom"),
    fetchAll<{ id: number; nom_article: string }>("articles", "id, nom_article"),
    supabaseServer
      .from("facturation_commandes")
      .select("id, numero, date_jour, client, depot_source_id")
      .order("id", { ascending: false }),
    supabaseServer.from("bons_livraison").select("commande_id, id"),
  ]);

  const depotNomById = new Map(depots.map((d) => [d.id, d.nom]));
  const articlesPf = articlesPfRows
    .map((a) => ({ id: a.id, label: a.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const commandes = (commandesData ?? []) as CommandeRow[];
  const blIdByCommandeId = new Map(
    ((blData ?? []) as { commande_id: number; id: number }[]).map((row) => [row.commande_id, row.id])
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Commande</h1>
              <p className="mt-2 text-sm text-slate-600">
                Saisie independante de Commandes - le stock n&apos;est verifie qu&apos;au FIFO, sorti qu&apos;a la
                Livraison.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/facturation" label="Retour Facturation" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canWrite ? (
          <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-sky-700 marker:content-none">
              + Nouvelle commande
            </summary>
            <form action={createCommandeAction} className="grid gap-4 border-t border-slate-100 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Client
                  <input
                    type="text"
                    name="client"
                    required
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Depot source
                  <select
                    name="depot_source_id"
                    required
                    defaultValue=""
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  >
                    <option value="">Choisir...</option>
                    {depots.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <CommandeLinesForm articlesPf={articlesPf} />

              <div>
                <button
                  type="submit"
                  className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
                >
                  Creer la commande
                </button>
              </div>
            </form>
          </details>
        ) : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {commandes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucune commande pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Commande</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Client</th>
                    <th className="px-6 py-4 font-semibold">Depot source</th>
                    <th className="px-6 py-4 font-semibold">BL</th>
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((commande) => {
                    const blId = blIdByCommandeId.get(commande.id);
                    return (
                      <tr key={commande.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          <Link href={`/facturation/commande/${commande.id}`} className="text-sky-700 underline">
                            {`CMD.${commande.date_jour.slice(0, 4)}.${commande.numero ?? commande.id}`}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(commande.date_jour)}</td>
                        <td className="px-6 py-4 text-slate-600">{commande.client}</td>
                        <td className="px-6 py-4 text-slate-600">{depotNomById.get(commande.depot_source_id) ?? "-"}</td>
                        <td className="px-6 py-4">
                          {blId ? (
                            <Link href={`/facturation/bl/${blId}`} className="font-semibold text-sky-700 underline">
                              Voir
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">Pas encore</span>
                          )}
                        </td>
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
