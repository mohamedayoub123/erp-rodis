import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "@/lib/format-date";
import { type ArticleType } from "../../transfer-order/stock-lots";
import {
  deleteInvoiceOrderAction,
  deleteInvoiceOrderLigneAction,
  updateInvoiceOrderLignesAction,
  validateInvoiceOrderAction,
} from "../actions";

type InvoiceOrderRow = { id: number; transfer_order_id: number; statut: string; date_jour: string; created_at: string };
type TransferOrderRow = { id: number; depot_source_id: number; depot_destination_id: number };
type LigneRow = { id: number; article_type: ArticleType; article_id: number };
type InvoiceLigneRow = { id: number; transfer_order_ligne_id: number; numero_lot: string | null; quantite: number };

async function fetchNomArticle(articleType: ArticleType, articleId: number): Promise<string> {
  const table = articleType === "MP" ? "articles_matiere_premiere" : "articles";
  const { data } = await supabaseServer.from(table).select("nom_article").eq("id", articleId).maybeSingle();
  return (data as { nom_article: string } | null)?.nom_article ?? `#${articleId}`;
}

export default async function InvoiceOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const invoiceOrderId = Number(id);
  if (!invoiceOrderId) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "depots");
  const canDelete = await canDeletePageUser(currentUser, "depots");

  const { data: invoiceOrderData } = await supabaseServer
    .from("invoice_orders")
    .select("id, transfer_order_id, statut, date_jour, created_at")
    .eq("id", invoiceOrderId)
    .maybeSingle();

  const invoiceOrder = invoiceOrderData as InvoiceOrderRow | null;
  if (!invoiceOrder) {
    notFound();
  }

  const [{ data: transferOrderData }, { data: depotsData }] = await Promise.all([
    supabaseServer
      .from("transfer_orders")
      .select("id, depot_source_id, depot_destination_id")
      .eq("id", invoiceOrder.transfer_order_id)
      .maybeSingle(),
    supabaseServer.from("depots").select("id, nom"),
  ]);

  const transferOrder = transferOrderData as TransferOrderRow | null;
  const depots = (depotsData as { id: number; nom: string }[] | null) ?? [];
  const depotNomById = new Map(depots.map((d) => [d.id, d.nom]));

  const { data: lignesData } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, article_type, article_id")
    .eq("transfer_order_id", invoiceOrder.transfer_order_id)
    .order("id", { ascending: true });
  const lignes = (lignesData ?? []) as LigneRow[];
  const ligneById = new Map(lignes.map((ligne) => [ligne.id, ligne]));

  const { data: invoiceLignesData } = await supabaseServer
    .from("invoice_order_lignes")
    .select("id, transfer_order_ligne_id, numero_lot, quantite")
    .eq("invoice_order_id", invoiceOrderId)
    .order("id", { ascending: true });
  const invoiceLignes = (invoiceLignesData ?? []) as InvoiceLigneRow[];

  const canEditLignes = canEdit && invoiceOrder.statut === "draft";

  const invoiceLignesEnrichies = await Promise.all(
    invoiceLignes.map(async (invoiceLigne) => {
      const ligne = ligneById.get(invoiceLigne.transfer_order_ligne_id);
      const nom = ligne ? await fetchNomArticle(ligne.article_type, ligne.article_id) : `#${invoiceLigne.transfer_order_ligne_id}`;
      return { ...invoiceLigne, nom, articleType: ligne?.article_type ?? null };
    })
  );

  const { data: allSameYearData } = await supabaseServer
    .from("invoice_orders")
    .select("id, created_at")
    .gte("date_jour", `${invoiceOrder.date_jour.slice(0, 4)}-01-01`)
    .lte("date_jour", `${invoiceOrder.date_jour.slice(0, 4)}-12-31`)
    .order("created_at", { ascending: true });
  const rank = ((allSameYearData ?? []) as { id: number }[]).findIndex((row) => row.id === invoiceOrderId);
  const code = `TI${rank + 1}.${invoiceOrder.date_jour.slice(0, 4)}`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Transfer Invoice
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(invoiceOrder.date_jour)}
                {transferOrder ? (
                  <>
                    {" - "}
                    {depotNomById.get(transferOrder.depot_source_id) ?? "-"}
                    {" -> "}
                    {depotNomById.get(transferOrder.depot_destination_id) ?? "-"}
                  </>
                ) : null}{" "}
                - <span className="font-semibold">{invoiceOrder.statut === "valide" ? "Approuve" : "En attente"}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/depots/invoice-order" label="Retour" />
              <RefreshButton />
              <Link
                href={`/depots/transfer-order/${invoiceOrder.transfer_order_id}`}
                className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              >
                Voir le Transfer Order
              </Link>
              {canEditLignes ? (
                <button
                  type="submit"
                  form="invoice-lignes-form"
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Enregistrer
                </button>
              ) : null}
              {canEdit && invoiceOrder.statut === "draft" ? (
                <form action={validateInvoiceOrderAction}>
                  <input type="hidden" name="invoice_order_id" value={invoiceOrderId} />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Approuver
                  </button>
                </form>
              ) : null}
              {canDelete ? (
                <form action={deleteInvoiceOrderAction}>
                  <input type="hidden" name="invoice_order_id" value={invoiceOrderId} />
                  <DeleteIconButton label="Supprimer ce Transfer Invoice" />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <form id="invoice-lignes-form" action={updateInvoiceOrderLignesAction} className="p-6">
            <input type="hidden" name="invoice_order_id" value={invoiceOrderId} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Lot</th>
                    <th className="px-6 py-4 font-semibold">Quantite</th>
                    {canEditLignes ? <th className="px-6 py-4 font-semibold"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {invoiceLignesEnrichies.length === 0 ? (
                    <tr>
                      <td className="px-6 py-4 text-slate-400" colSpan={5}>
                        Aucune ligne - tout a deja ete livre ou efface.
                      </td>
                    </tr>
                  ) : (
                    invoiceLignesEnrichies.map((ligne) => (
                      <tr key={ligne.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-medium text-slate-900">{ligne.nom}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {ligne.articleType === "MP" ? "Matiere premiere" : "Produit fini"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{ligne.numero_lot || "-"}</td>
                        <td className="px-6 py-4">
                          {canEditLignes ? (
                            <>
                              <input type="hidden" name="invoice_order_ligne_id" value={ligne.id} />
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                max={ligne.quantite}
                                name="quantite"
                                defaultValue={ligne.quantite}
                                className="w-32 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                            </>
                          ) : (
                            ligne.quantite.toLocaleString("fr-FR")
                          )}
                        </td>
                        {canEditLignes ? (
                          <td className="px-6 py-4">
                            <DeleteIconButton
                              label="Supprimer cette ligne"
                              formAction={deleteInvoiceOrderLigneAction}
                              formNoValidate
                              name="delete_invoice_order_ligne_id"
                              value={ligne.id}
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {canEditLignes ? (
              <p className="mt-3 px-1 text-xs text-slate-500">
                La quantite ne peut etre que diminuee (jamais augmentee). Mets 0 pour ne pas livrer une ligne - elle
                repart automatiquement sur le Transfer Order.
              </p>
            ) : null}
          </form>
        </section>
      </div>
    </main>
  );
}
