import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate } from "@/lib/format-date";
import { fetchLotsInDepot, type ArticleType } from "../stock-lots";
import {
  approveTransferOrderAction,
  copyTransferOrderAction,
  deleteTransferOrderAction,
  postToInvoiceOrderAction,
  updateAllLigneLotsAction,
} from "../actions";

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
type LigneRow = { id: number; article_type: ArticleType; article_id: number; quantite_demandee: number };
type LigneLotRow = { transfer_order_ligne_id: number; numero_lot: string | null; quantite: number };

const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  approuve: "Approuve",
  partiellement_fini: "Partiellement fini",
  poste: "Poste",
};

async function fetchNomArticle(articleType: ArticleType, articleId: number): Promise<string> {
  const table = articleType === "MP" ? "articles_matiere_premiere" : "articles";
  const { data } = await supabaseServer.from(table).select("nom_article").eq("id", articleId).maybeSingle();
  return (data as { nom_article: string } | null)?.nom_article ?? `#${articleId}`;
}

export default async function TransferOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const transferOrderId = Number(id);
  if (!transferOrderId) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "depots");
  const canDelete = await canDeletePageUser(currentUser, "depots");

  const [{ data: transferOrderData }, { data: lignesData }, { data: depotsData }, { data: invoiceOrdersData }] =
    await Promise.all([
      supabaseServer
        .from("transfer_orders")
        .select(
          "id, depot_source_id, depot_destination_id, statut, date_jour, created_at, famille_produit, type_mp, numero"
        )
        .eq("id", transferOrderId)
        .maybeSingle(),
      supabaseServer
        .from("transfer_order_lignes")
        .select("id, article_type, article_id, quantite_demandee")
        .eq("transfer_order_id", transferOrderId)
        .order("id", { ascending: true }),
      supabaseServer.from("depots").select("id, nom"),
      supabaseServer
        .from("invoice_orders")
        .select("id, statut, date_jour, created_at, numero")
        .eq("transfer_order_id", transferOrderId)
        .order("created_at", { ascending: true }),
    ]);

  const transferOrder = transferOrderData as TransferOrderRow | null;
  if (!transferOrder) {
    notFound();
  }

  const canEditLots =
    canEdit && (transferOrder.statut === "approuve" || transferOrder.statut === "partiellement_fini");
  const canPoster =
    canEdit && (transferOrder.statut === "approuve" || transferOrder.statut === "partiellement_fini");

  const lignes = (lignesData ?? []) as LigneRow[];
  const depots = (depotsData as { id: number; nom: string }[] | null) ?? [];
  const depotNomById = new Map(depots.map((d) => [d.id, d.nom]));
  const invoiceOrders = (invoiceOrdersData ?? []) as {
    id: number;
    statut: string;
    date_jour: string;
    created_at: string;
    numero: number | null;
  }[];

  // Code TI1.2026, TI2.2026... fige a la creation (colonne numero) - stable.
  const invoiceOrderCodeById = new Map<number, string>();
  for (const io of invoiceOrders) {
    invoiceOrderCodeById.set(io.id, `TI.${io.date_jour.slice(0, 4)}.${io.numero ?? io.id}`);
  }

  const { data: ligneLotsData } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .select("transfer_order_ligne_id, numero_lot, quantite")
    .in(
      "transfer_order_ligne_id",
      lignes.map((ligne) => ligne.id)
    );
  const ligneLots = (ligneLotsData ?? []) as LigneLotRow[];
  const lotsByLigneId = new Map<number, LigneLotRow[]>();
  for (const lot of ligneLots) {
    const list = lotsByLigneId.get(lot.transfer_order_ligne_id) ?? [];
    list.push(lot);
    lotsByLigneId.set(lot.transfer_order_ligne_id, list);
  }

  // TO1.2026, TO2.2026... fige a la creation (colonne numero) - stable.
  const code = `TO.${transferOrder.date_jour.slice(0, 4)}.${transferOrder.numero ?? transferOrder.id}`;

  const lignesEnrichies = await Promise.all(
    lignes.map(async (ligne) => {
      const [nom, lotsDisponibles] = await Promise.all([
        fetchNomArticle(ligne.article_type, ligne.article_id),
        fetchLotsInDepot(ligne.article_type, ligne.article_id, transferOrder.depot_source_id, transferOrder.id),
      ]);
      return { ...ligne, nom, lotsDisponibles };
    })
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Transfer Order
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(transferOrder.date_jour)} - {depotNomById.get(transferOrder.depot_source_id) ?? "-"}
                {" -> "}
                {depotNomById.get(transferOrder.depot_destination_id) ?? "-"} -{" "}
                <span className="font-semibold">{STATUT_LABELS[transferOrder.statut] ?? transferOrder.statut}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/depots/transfer-order" label="Retour" />
              <RefreshButton />
              {canEdit ? (
                <form action={copyTransferOrderAction}>
                  <input type="hidden" name="transfer_order_id" value={transferOrderId} />
                  <SubmitButton
                    pendingLabel="Copie..."
                    className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                  >
                    Copier ce Transfer Order
                  </SubmitButton>
                </form>
              ) : null}
              {canEdit && transferOrder.statut === "en_attente" ? (
                <form action={approveTransferOrderAction}>
                  <input type="hidden" name="transfer_order_id" value={transferOrderId} />
                  <SubmitButton
                    pendingLabel="Approbation..."
                    className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Approuver
                  </SubmitButton>
                </form>
              ) : null}
              {canPoster ? (
                <form action={postToInvoiceOrderAction}>
                  <input type="hidden" name="transfer_order_id" value={transferOrderId} />
                  <SubmitButton
                    pendingLabel="Publication..."
                    className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
                  >
                    Poster a Transfer Invoice
                  </SubmitButton>
                </form>
              ) : null}
              {invoiceOrders.map((io) => (
                <Link
                  key={io.id}
                  href={`/depots/invoice-order/${io.id}`}
                  className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  Voir {invoiceOrderCodeById.get(io.id) ?? `TI.${io.id}`}
                </Link>
              ))}
              {canEditLots ? (
                <button
                  type="submit"
                  form="lots-form"
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Enregistrer
                </button>
              ) : null}
              {canDelete ? (
                <form action={deleteTransferOrderAction}>
                  <input type="hidden" name="transfer_order_id" value={transferOrderId} />
                  <DeleteIconButton label="Supprimer ce Transfer Order" />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        {transferOrder.statut === "en_attente" ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Qt</th>
                    <th className="px-6 py-4 font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesEnrichies.map((ligne) => (
                    <tr key={ligne.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{ligne.nom}</td>
                      <td className="px-6 py-4 text-slate-600">{ligne.quantite_demandee.toLocaleString("fr-FR")}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {ligne.lotsDisponibles
                          .reduce((sum, lot) => sum + lot.solde, 0)
                          .toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form id="lots-form" action={updateAllLigneLotsAction} className="grid gap-4 p-6">
            <input type="hidden" name="transfer_order_id" value={transferOrderId} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Demande</th>
                    <th className="px-6 py-4 font-semibold">Numero de lot</th>
                    <th className="px-6 py-4 font-semibold">Disponible</th>
                    <th className="px-6 py-4 font-semibold">Quantite a transferer</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesEnrichies.flatMap((ligne) => {
                    const lotsChoisis = lotsByLigneId.get(ligne.id) ?? [];

                    if (ligne.lotsDisponibles.length === 0) {
                      return [
                        <tr key={`${ligne.id}-vide`} className="border-t border-slate-100">
                          <td className="px-6 py-4 font-medium text-slate-900">{ligne.nom}</td>
                          <td className="px-6 py-4 text-slate-600">
                            {ligne.quantite_demandee.toLocaleString("fr-FR")}
                          </td>
                          <td className="px-6 py-4 text-slate-400" colSpan={3}>
                            Aucun lot disponible dans le depot source.
                          </td>
                        </tr>,
                      ];
                    }

                    // Seuls les lots reellement choisis (FEFO a l'approbation, ou
                    // deja modifies) affichent une ligne - pas tous les lots
                    // disponibles de l'article. Le lot reste modifiable via la
                    // liste deroulante (les autres lots de cet article dans le
                    // depot source), pour ne jamais faire sortir un lot non
                    // voulu.
                    const rows = lotsChoisis.length > 0 ? lotsChoisis : [{ numero_lot: null, quantite: 0 }];

                    return rows.map((choisi, index) => {
                      const disponible =
                        ligne.lotsDisponibles.find((lot) => lot.numeroLot === (choisi.numero_lot || ""))?.solde ?? 0;
                      return (
                        <tr key={`${ligne.id}-${index}`} className="border-t border-slate-100">
                          <td className="px-6 py-4 font-medium text-slate-900">{index === 0 ? ligne.nom : ""}</td>
                          <td className="px-6 py-4 text-slate-600">
                            {index === 0 ? ligne.quantite_demandee.toLocaleString("fr-FR") : ""}
                          </td>
                          <td className="px-6 py-4">
                            <input type="hidden" name="ligne_id" value={ligne.id} />
                            <select
                              name="numero_lot"
                              defaultValue={choisi.numero_lot ?? ""}
                              disabled={!canEditLots}
                              className="w-56 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                            >
                              {ligne.lotsDisponibles.map((lot) => (
                                <option key={lot.numeroLot} value={lot.numeroLot}>
                                  {lot.numeroLot || "(sans numero)"} - disponible : {lot.solde.toLocaleString("fr-FR")}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{disponible.toLocaleString("fr-FR")}</td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              max={disponible}
                              name="quantite"
                              defaultValue={choisi.quantite ?? 0}
                              disabled={!canEditLots}
                              className="w-32 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                            />
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </form>
        </section>
        )}
      </div>
    </main>
  );
}
