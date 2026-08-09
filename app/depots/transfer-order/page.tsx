import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "@/lib/format-date";
import { createTransferOrderAction, deleteTransferOrderAction } from "./actions";
import { TransferOrderLinesForm } from "./transfer-order-lines-form";

type DepotRow = { id: number; nom: string };
type TransferOrderRow = {
  id: number;
  depot_source_id: number;
  depot_destination_id: number;
  statut: string;
  date_jour: string;
  created_at: string;
  famille_produit: string | null;
  type_mp: string | null;
  numero: number | null;
};

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

// Code TO1.2026, TO2.2026... fige a la creation (colonne numero) - stable
// pour toujours, une suppression ne decale plus les numeros des autres.
function computeCodes(rows: TransferOrderRow[]): Map<number, string> {
  const codeById = new Map<number, string>();
  for (const row of rows) {
    codeById.set(row.id, `TO${row.numero ?? row.id}.${row.date_jour.slice(0, 4)}`);
  }
  return codeById;
}

const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  approuve: "Approuve",
  poste: "Poste",
};

export default async function TransferOrderListPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "depots");
  const canDelete = await canDeletePageUser(currentUser, "depots");

  const [{ rows: depots }, { rows: transferOrders, error }, { rows: articlesMpRows }, { rows: articlesPfRows }] =
    await Promise.all([
      fetchAll<DepotRow>("depots", "id, nom"),
      fetchAll<TransferOrderRow>(
        "transfer_orders",
        "id, depot_source_id, depot_destination_id, statut, date_jour, created_at, famille_produit, type_mp, numero"
      ),
      fetchAll<{ id: number; nom_article: string }>("articles_matiere_premiere", "id, nom_article"),
      fetchAll<{ id: number; nom_article: string }>("articles", "id, nom_article"),
    ]);

  const depotNomById = new Map(depots.map((d) => [d.id, d.nom]));
  const codeById = computeCodes(transferOrders);
  const sortedTransferOrders = [...transferOrders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const articlesMp = articlesMpRows
    .map((a) => ({ id: a.id, label: a.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const articlesPf = articlesPfRows
    .map((a) => ({ id: a.id, label: a.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Entrepot
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Transfer Order</h1>
              <p className="mt-2 text-sm text-slate-600">
                Demande de transfert entre 2 depots. Approuve pour choisir automatiquement les lots
                (date d&apos;expiration la plus proche en premier), puis poste vers un Transfer Invoice.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/depots" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canEdit ? (
          <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-sky-700 marker:content-none">
              + Nouveau Transfer Order
            </summary>
            <form action={createTransferOrderAction} className="grid gap-4 border-t border-slate-100 px-5 py-4">
              <label className="grid max-w-xs gap-1 text-xs font-semibold text-slate-500">
                Date
                <input
                  type="date"
                  name="date_jour"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </label>

              <TransferOrderLinesForm depots={depots} articlesMp={articlesMp} articlesPf={articlesPf} />

              <div>
                <button
                  type="submit"
                  className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                >
                  Creer le Transfer Order
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
          ) : sortedTransferOrders.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun Transfer Order pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">Famille</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">De</th>
                    <th className="px-6 py-4 font-semibold">Vers</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    {canDelete ? <th className="px-6 py-4 font-semibold"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {sortedTransferOrders.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <Link href={`/depots/transfer-order/${row.id}`} className="text-sky-700 underline">
                          {codeById.get(row.id)}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.famille_produit ?? "-"}</td>
                      <td className="px-6 py-4">
                        {row.type_mp ? (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              row.type_mp === "MP" ? "bg-violet-50 text-violet-700" : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {row.type_mp}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(row.date_jour)}</td>
                      <td className="px-6 py-4 text-slate-600">{depotNomById.get(row.depot_source_id) ?? "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{depotNomById.get(row.depot_destination_id) ?? "-"}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {STATUT_LABELS[row.statut] ?? row.statut}
                        </span>
                      </td>
                      {canDelete ? (
                        <td className="px-6 py-4">
                          <form action={deleteTransferOrderAction}>
                            <input type="hidden" name="transfer_order_id" value={row.id} />
                            <DeleteIconButton label={`Supprimer ${codeById.get(row.id)}`} />
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
