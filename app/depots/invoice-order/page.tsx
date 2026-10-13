import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "@/lib/format-date";
import { deleteInvoiceOrderAction } from "./actions";

type InvoiceOrderRow = {
  id: number;
  transfer_order_id: number;
  statut: string;
  date_jour: string;
  created_at: string;
  numero: number | null;
  remarque: string | null;
  cree_par: string | null;
};
type TransferOrderRow = {
  id: number;
  depot_source_id: number;
  depot_destination_id: number;
  numero: number | null;
  date_jour: string;
};
type DepotRow = { id: number; nom: string };

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

// Code TI1.2026, TI2.2026... fige a la creation (colonne numero) - stable,
// une suppression ne decale plus les numeros des autres.
function computeCodes(rows: InvoiceOrderRow[]): Map<number, string> {
  const codeById = new Map<number, string>();
  for (const row of rows) {
    codeById.set(row.id, `TI.${row.date_jour.slice(0, 4)}.${row.numero ?? row.id}`);
  }
  return codeById;
}

// Meme convention de code que transfer-order/page.tsx (TO.annee.numero) : sert a afficher le TO d'origine de chaque
// Transfer Invoice et au filtre "Numero TO".
function computeToCodes(rows: TransferOrderRow[]): Map<number, string> {
  const codeById = new Map<number, string>();
  for (const row of rows) {
    codeById.set(row.id, `TO.${row.date_jour.slice(0, 4)}.${row.numero ?? row.id}`);
  }
  return codeById;
}

// Nombre de Transfer Invoice affiches d'emblee (le reste avec "Voir tout"), comme la liste des Transfer Orders : la liste
// complete (~1 900 lignes) pesait plusieurs Mo a chaque ouverture / filtre.
const LIMITE_LIGNES = 150;

type SearchParams = Promise<{
  depotSource?: string;
  depotDestination?: string;
  numeroTo?: string;
  numeroTi?: string;
  remarque?: string;
  tout?: string;
}>;

// Meme filtres que la liste des Transfer Orders : De, Vers, Numero TO, Numero TI, Remarque.
export default async function InvoiceOrderListPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const depotSourceFilter = params.depotSource || "";
  const depotDestinationFilter = params.depotDestination || "";
  const numeroToFilter = (params.numeroTo || "").trim().toLowerCase();
  const numeroTiFilter = (params.numeroTi || "").trim().toLowerCase();
  const remarqueFilter = (params.remarque || "").trim().toLowerCase();
  const toutAfficher = params.tout === "1";

  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "depots");

  const [{ rows: invoiceOrders, error }, { rows: transferOrders }, { rows: depots }] = await Promise.all([
    fetchAll<InvoiceOrderRow>(
      "invoice_orders",
      "id, transfer_order_id, statut, date_jour, created_at, numero, remarque, cree_par"
    ),
    fetchAll<TransferOrderRow>("transfer_orders", "id, depot_source_id, depot_destination_id, numero, date_jour"),
    fetchAll<DepotRow>("depots", "id, nom"),
  ]);

  const transferOrderById = new Map(transferOrders.map((t) => [t.id, t]));
  const depotNomById = new Map(depots.map((d) => [d.id, d.nom]));
  const codeById = computeCodes(invoiceOrders);
  const toCodeById = computeToCodes(transferOrders);
  const sorted = [...invoiceOrders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((row) => {
      const transferOrder = transferOrderById.get(row.transfer_order_id);
      if (depotSourceFilter && String(transferOrder?.depot_source_id ?? "") !== depotSourceFilter) return false;
      if (depotDestinationFilter && String(transferOrder?.depot_destination_id ?? "") !== depotDestinationFilter) return false;
      if (numeroToFilter && !(toCodeById.get(row.transfer_order_id) || "").toLowerCase().includes(numeroToFilter)) return false;
      if (numeroTiFilter && !(codeById.get(row.id) || "").toLowerCase().includes(numeroTiFilter)) return false;
      if (remarqueFilter && !(row.remarque || "").toLowerCase().includes(remarqueFilter)) return false;
      return true;
    });
  const hasActiveFilter = Boolean(
    depotSourceFilter || depotDestinationFilter || numeroToFilter || numeroTiFilter || remarqueFilter
  );

  const lignesAffichees = toutAfficher ? sorted : sorted.slice(0, LIMITE_LIGNES);
  const nbMasquees = sorted.length - lignesAffichees.length;
  const hrefVoirTout = (() => {
    const query = new URLSearchParams();
    if (params.depotSource) query.set("depotSource", params.depotSource);
    if (params.depotDestination) query.set("depotDestination", params.depotDestination);
    if (params.numeroTo) query.set("numeroTo", params.numeroTo);
    if (params.numeroTi) query.set("numeroTi", params.numeroTi);
    if (params.remarque) query.set("remarque", params.remarque);
    query.set("tout", "1");
    return `/depots/invoice-order?${query.toString()}`;
  })();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Entrepot
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Transfer Invoice</h1>
              <p className="mt-2 text-sm text-slate-600">
                Cree depuis un Transfer Order approuve - la validation deplace reellement le stock du
                depot source vers le depot destination.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/depots" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              De
              <select
                name="depotSource"
                defaultValue={depotSourceFilter}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              >
                <option value="">Tous</option>
                {depots.map((depot) => (
                  <option key={depot.id} value={depot.id}>
                    {depot.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Vers
              <select
                name="depotDestination"
                defaultValue={depotDestinationFilter}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              >
                <option value="">Tous</option>
                {depots.map((depot) => (
                  <option key={depot.id} value={depot.id}>
                    {depot.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Numero TO
              <input
                type="text"
                name="numeroTo"
                defaultValue={params.numeroTo || ""}
                placeholder="Ex: TO.2026.5"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Numero TI
              <input
                type="text"
                name="numeroTi"
                defaultValue={params.numeroTi || ""}
                placeholder="Ex: TI.2026.3"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Remarque
              <input
                type="text"
                name="remarque"
                defaultValue={params.remarque || ""}
                placeholder="Recherche libre"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <div className="flex items-end gap-3 sm:col-span-3 lg:col-span-5">
              <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                Filtrer
              </button>
              {hasActiveFilter ? (
                <Link
                  href="/depots/invoice-order"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasActiveFilter ? "Aucun Transfer Invoice pour ce filtre." : "Aucun Transfer Invoice pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">TO</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">De</th>
                    <th className="px-6 py-4 font-semibold">Vers</th>
                    <th className="px-6 py-4 font-semibold">Cree par</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Remarque</th>
                    {canDelete ? <th className="px-6 py-4 font-semibold"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lignesAffichees.map((row) => {
                    const transferOrder = transferOrderById.get(row.transfer_order_id);
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          <Link href={`/depots/invoice-order/${row.id}`} className="text-sky-700 underline">
                            {codeById.get(row.id)}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {transferOrder ? (
                            <Link href={`/depots/transfer-order/${transferOrder.id}`} className="text-sky-700 underline">
                              {toCodeById.get(transferOrder.id)}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(row.date_jour)}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {transferOrder ? depotNomById.get(transferOrder.depot_source_id) ?? "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {transferOrder ? depotNomById.get(transferOrder.depot_destination_id) ?? "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{row.cree_par ?? "-"}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              row.statut === "valide"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {row.statut === "valide" ? "Approuve" : "En attente"}
                          </span>
                        </td>
                        <td className="max-w-xs truncate px-6 py-4 text-slate-600" title={row.remarque ?? ""}>
                          {row.remarque || "-"}
                        </td>
                        {canDelete ? (
                          <td className="px-6 py-4">
                            <form action={deleteInvoiceOrderAction}>
                              <input type="hidden" name="invoice_order_id" value={row.id} />
                              <DeleteIconButton label={`Supprimer ${codeById.get(row.id)}`} />
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
          {nbMasquees > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 text-sm text-slate-600">
              <span>
                {lignesAffichees.length} Transfer Invoice affiches sur {sorted.length} (les plus recents).
              </span>
              <Link
                href={hrefVoirTout}
                className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                Voir tout ({sorted.length})
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
