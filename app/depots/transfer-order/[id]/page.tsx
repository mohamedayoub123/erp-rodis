import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { RemarqueField } from "@/app/_components/remarque-field";
import { formatDate } from "@/lib/format-date";
import { fetchLotsInDepot, type ArticleType } from "../stock-lots";
import {
  approveTransferOrderAction,
  copyTransferOrderAction,
  deleteTransferOrderAction,
  postToInvoiceOrderAction,
  updateAllLigneLotsAction,
  updateTransferOrderRemarqueAction,
} from "../actions";
import { TransferOrderLignesEditor } from "../lignes-editor";

async function fetchAllArticles<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
    if (error) return rows;
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

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
  remarque: string | null;
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

  const [
    { data: transferOrderData },
    { data: lignesData },
    { data: depotsData },
    { data: invoiceOrdersData },
    articlesMpRows,
    articlesPfRows,
  ] = await Promise.all([
    supabaseServer
      .from("transfer_orders")
      .select(
        "id, depot_source_id, depot_destination_id, statut, date_jour, created_at, famille_produit, type_mp, numero, remarque"
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
    fetchAllArticles<{ id: number; nom_article: string }>("articles_matiere_premiere", "id, nom_article"),
    fetchAllArticles<{ id: number; nom_article: string }>("articles", "id, nom_article"),
  ]);

  const articlesMp = articlesMpRows
    .map((a) => ({ id: a.id, label: a.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const articlesPf = articlesPfRows
    .map((a) => ({ id: a.id, label: a.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

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
      const [nom, lotsDisponiblesBruts] = await Promise.all([
        fetchNomArticle(ligne.article_type, ligne.article_id),
        fetchLotsInDepot(ligne.article_type, ligne.article_id, transferOrder.depot_source_id, transferOrder.id),
      ]);
      // Les lots deja choisis sur cette ligne (transfer_order_ligne_lots)
      // doivent TOUJOURS rester des options du menu, meme si
      // fetchLotsInDepot ne les retrouve plus (solde net tombe a 0/negatif
      // une fois toutes les reservations recalculees, ou lot au solde reel
      // tres bas) - sinon le menu de recherche perd silencieusement le lot
      // deja assigne (bug reel signale : lot deja pris par "Flacon"
      // invisible a la recherche, disparait a l'ouverture de Modifier).
      const dejaChoisis = lotsByLigneId.get(ligne.id) ?? [];
      const lotsDisponibles = [...lotsDisponiblesBruts];
      for (const choisi of dejaChoisis) {
        const cle = choisi.numero_lot ?? "";
        if (!lotsDisponibles.some((l) => l.numeroLot === cle)) {
          lotsDisponibles.push({
            numeroLot: cle,
            solde: 0,
            dateTri: null,
            prixUnitaireFcfa: null,
            nDossErp: null,
            nDoss4d: null,
          });
        }
      }
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
              {canDelete ? (
                <form action={deleteTransferOrderAction}>
                  <input type="hidden" name="transfer_order_id" value={transferOrderId} />
                  <DeleteIconButton label="Supprimer ce Transfer Order" />
                </form>
              ) : null}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <RemarqueField
              action={updateTransferOrderRemarqueAction}
              hiddenName="transfer_order_id"
              hiddenValue={transferOrderId}
              remarque={transferOrder.remarque}
              canEdit={canEdit}
            />
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
          <TransferOrderLignesEditor
            transferOrderId={transferOrderId}
            lignes={lignesEnrichies.map((ligne) => ({
              id: ligne.id,
              nom: ligne.nom,
              article_type: ligne.article_type,
              article_id: ligne.article_id,
              quantite_demandee: ligne.quantite_demandee,
              lotsDisponibles: ligne.lotsDisponibles,
            }))}
            lotsByLigneId={Object.fromEntries(
              lignesEnrichies.map((ligne) => [ligne.id, lotsByLigneId.get(ligne.id) ?? []])
            )}
            articlesMp={articlesMp}
            articlesPf={articlesPf}
            updateAction={updateAllLigneLotsAction}
            canEditLignes={canEditLots}
            depotSourceNom={depotNomById.get(transferOrder.depot_source_id) ?? "au depot source"}
          />
        )}
      </div>
    </main>
  );
}
