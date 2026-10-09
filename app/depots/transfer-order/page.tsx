import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate } from "@/lib/format-date";
import { lirePagesAvecLimite } from "@/lib/lecteur-valide";
import { lireArticlesMpPourFormulaires, type ArticleMpListe } from "@/lib/articles-mp-liste";
import { lireArticlesPfListe, type ArticlePfListe } from "@/lib/articles-pf-liste";
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
  numero: number | null;
  remarque: string | null;
  type_mp: string | null;
  cree_par: string | null;
};
type InvoiceOrderRow = { id: number; transfer_order_id: number; numero: number | null; date_jour: string };

// Pages de 1000 lignes lues 6 par 6 (au lieu d'une par une), dans un ordre stable.
async function lireTable<T>(table: string, colonnes: string): Promise<T[]> {
  return lirePagesAvecLimite<T>(
    () => supabaseServer.from(table).select("id", { count: "exact", head: true }),
    (debut, fin) =>
      supabaseServer.from(table).select(colonnes).order("id", { ascending: true }).range(debut, fin) as unknown as PromiseLike<{
        data: T[] | null;
        error: { message: string } | null;
      }>
  );
}

// Nombre de Transfer Orders affiches d'emblee (le reste avec "Voir tout") : la liste complete (~1 900 lignes)
// pesait plusieurs Mo a chaque ouverture / filtre.
const LIMITE_LIGNES = 150;

// Code TO1.2026, TO2.2026... fige a la creation (colonne numero) - stable
// pour toujours, une suppression ne decale plus les numeros des autres.
function computeCodes(rows: TransferOrderRow[]): Map<number, string> {
  const codeById = new Map<number, string>();
  for (const row of rows) {
    codeById.set(row.id, `TO.${row.date_jour.slice(0, 4)}.${row.numero ?? row.id}`);
  }
  return codeById;
}

// Meme convention de code que invoice-order/page.tsx (TI.annee.numero) - un
// Transfer Order peut avoir plusieurs Transfer Invoice au fil du temps
// (livraisons partielles, voir postToInvoiceOrderAction), tous regroupes
// ici pour que le filtre "Numero TI" les trouve tous.
function computeTiCodesByTransferOrderId(rows: InvoiceOrderRow[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const code = `TI.${row.date_jour.slice(0, 4)}.${row.numero ?? row.id}`;
    const list = map.get(row.transfer_order_id) ?? [];
    list.push(code);
    map.set(row.transfer_order_id, list);
  }
  return map;
}

const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  approuve: "Approuve",
  partiellement_fini: "Partiellement fini",
  poste: "Poste",
};

type SearchParams = Promise<{
  depotSource?: string;
  depotDestination?: string;
  numeroTo?: string;
  numeroTi?: string;
  remarque?: string;
  avertissement?: string;
  tout?: string;
}>;

export default async function TransferOrderListPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const depotSourceFilter = params.depotSource || "";
  const depotDestinationFilter = params.depotDestination || "";
  const numeroToFilter = (params.numeroTo || "").trim().toLowerCase();
  const numeroTiFilter = (params.numeroTi || "").trim().toLowerCase();
  const remarqueFilter = (params.remarque || "").trim().toLowerCase();
  const avertissement = params.avertissement || "";
  const toutAfficher = params.tout === "1";

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "depots");
  const canDelete = await canDeletePageUser(currentUser, "depots");

  // Tout part en meme temps. Les articles ne servent qu'au formulaire "Nouveau Transfer Order" ; les Transfer
  // Invoice ne servent qu'au filtre "Numero TI".
  const [depots, resultatTransferOrders, invoiceOrders, articlesMpListe, articlesPfListe] = await Promise.all([
    lireTable<DepotRow>("depots", "id, nom"),
    lireTable<TransferOrderRow>(
      "transfer_orders",
      "id, depot_source_id, depot_destination_id, statut, date_jour, created_at, numero, remarque, type_mp, cree_par"
    ).then(
      (rows) => ({ rows, error: null as { message: string } | null }),
      (e: unknown) => ({
        rows: [] as TransferOrderRow[],
        error: { message: e instanceof Error ? e.message : "Lecture des Transfer Orders impossible." },
      })
    ),
    numeroTiFilter
      ? lireTable<InvoiceOrderRow>("invoice_orders", "id, transfer_order_id, numero, date_jour")
      : Promise.resolve([] as InvoiceOrderRow[]),
    canEdit ? lireArticlesMpPourFormulaires() : Promise.resolve([] as ArticleMpListe[]),
    canEdit ? lireArticlesPfListe() : Promise.resolve([] as ArticlePfListe[]),
  ]);
  const transferOrders = resultatTransferOrders.rows;
  const error = resultatTransferOrders.error;

  const depotNomById = new Map(depots.map((d) => [d.id, d.nom]));
  const codeById = computeCodes(transferOrders);
  const tiCodesById = computeTiCodesByTransferOrderId(invoiceOrders);
  const sortedTransferOrders = [...transferOrders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((row) => {
      if (depotSourceFilter && String(row.depot_source_id) !== depotSourceFilter) return false;
      if (depotDestinationFilter && String(row.depot_destination_id) !== depotDestinationFilter) return false;
      if (numeroToFilter && !(codeById.get(row.id) || "").toLowerCase().includes(numeroToFilter)) return false;
      if (numeroTiFilter) {
        const tiCodes = tiCodesById.get(row.id) ?? [];
        if (!tiCodes.some((code) => code.toLowerCase().includes(numeroTiFilter))) return false;
      }
      if (remarqueFilter && !(row.remarque || "").toLowerCase().includes(remarqueFilter)) return false;
      return true;
    });
  const hasActiveFilter = Boolean(
    depotSourceFilter || depotDestinationFilter || numeroToFilter || numeroTiFilter || remarqueFilter
  );

  const versOptions = (articles: { id: number; nom_article: string }[]) =>
    articles
      .map((a) => ({ id: a.id, label: a.nom_article }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const articlesMp = versOptions(articlesMpListe);
  const articlesPf = versOptions(articlesPfListe);

  const lignesAffichees = toutAfficher ? sortedTransferOrders : sortedTransferOrders.slice(0, LIMITE_LIGNES);
  const nbMasquees = sortedTransferOrders.length - lignesAffichees.length;
  const hrefVoirTout = (() => {
    const query = new URLSearchParams();
    if (params.depotSource) query.set("depotSource", params.depotSource);
    if (params.depotDestination) query.set("depotDestination", params.depotDestination);
    if (params.numeroTo) query.set("numeroTo", params.numeroTo);
    if (params.numeroTi) query.set("numeroTi", params.numeroTi);
    if (params.remarque) query.set("remarque", params.remarque);
    query.set("tout", "1");
    return `/depots/transfer-order?${query.toString()}`;
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
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Transfer Order</h1>
              <p className="mt-2 text-sm text-slate-600">
                Demande de transfert entre 2 depots. Approuve pour choisir automatiquement les lots
                (date d&apos;expiration la plus proche en premier), puis poste vers un Transfer Invoice.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/depots" label="Retour" />
              {canEdit ? (
                <Link
                  href="/depots/transfer-order/photo"
                  className="rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                >
                  Creer depuis une photo
                </Link>
              ) : null}
              <RefreshButton />
            </div>
          </div>
        </section>

        {avertissement ? (
          <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-800">
            {avertissement}
          </section>
        ) : null}

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

              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Remarque
                <textarea
                  name="remarque"
                  rows={2}
                  placeholder="Note optionnelle"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                />
              </label>

              <div>
                <SubmitButton
                  pendingLabel="Creation..."
                  className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                >
                  Creer le Transfer Order
                </SubmitButton>
              </div>
            </form>
          </details>
        ) : null}

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
                  href="/depots/transfer-order"
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
          ) : sortedTransferOrders.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun Transfer Order pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">De</th>
                    <th className="px-6 py-4 font-semibold">Vers</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Cree par</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Remarque</th>
                    {canDelete ? <th className="px-6 py-4 font-semibold"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lignesAffichees.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <Link href={`/depots/transfer-order/${row.id}`} className="text-sky-700 underline">
                          {codeById.get(row.id)}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(row.date_jour)}</td>
                      <td className="px-6 py-4 text-slate-600">{depotNomById.get(row.depot_source_id) ?? "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{depotNomById.get(row.depot_destination_id) ?? "-"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            row.type_mp === "MP"
                              ? "bg-violet-50 text-violet-700"
                              : row.type_mp === "Conditionnement"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.type_mp === "MP" ? "Matiere premiere" : row.type_mp === "Conditionnement" ? "Conditionnement" : "Manuel"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.cree_par ?? "-"}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {STATUT_LABELS[row.statut] ?? row.statut}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-6 py-4 text-slate-600" title={row.remarque ?? ""}>
                        {row.remarque || "-"}
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
          {nbMasquees > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 text-sm text-slate-600">
              <span>
                {lignesAffichees.length} Transfer Orders affiches sur {sortedTransferOrders.length} (les plus recents).
              </span>
              <Link
                href={hrefVoirTout}
                className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                Voir tout ({sortedTransferOrders.length})
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
