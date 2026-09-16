import { notFound } from "next/navigation";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteLotFromEntreeMpDetailAction } from "@/app/mouvements/matiere-premiere/actions";
import {
  buildEntreeMpRows,
  fetchWebMouvementMpSourceRows,
  formatMouvementMpDate,
  formatMouvementMpDateTime,
  mouvementMpSourceLabel,
} from "../../shared";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { EditEntreeMpLotForm } from "./edit-lot-form";

export default async function EntreeMpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const groupeId = Number(id);
  const currentStockUser = await getCurrentStockUser();
  const canEditStock = await canWritePageUser(currentStockUser, "mouvementsMatierePremiereEntreeDetail");
  const canDeleteStock = await canDeletePageUser(currentStockUser, "mouvementsMatierePremiereEntreeDetail");
  const sourceRows = await fetchWebMouvementMpSourceRows();
  const group = buildEntreeMpRows(sourceRows).find((entree) => entree.groupe_id === groupeId);

  if (!group) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{group.code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatMouvementMpDate(group.date_jour)} - {group.lignes.length} article(s) - quantite totale {group.quantite_totale}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/mouvements/matiere-premiere" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">Lot</th>
                  <th className="px-4 py-3 font-semibold">Quantite</th>
                  <th className="px-4 py-3 font-semibold">Unite</th>
                  <th className="px-4 py-3 font-semibold">Reception</th>
                  <th className="px-4 py-3 font-semibold">Fabrication</th>
                  <th className="px-4 py-3 font-semibold">Expiration</th>
                  <th className="px-4 py-3 font-semibold">Fournisseur</th>
                  <th className="px-4 py-3 font-semibold">Emplacement</th>
                  <th className="px-4 py-3 font-semibold">Doss. ERP</th>
                  <th className="px-4 py-3 font-semibold">Doss. 4D</th>
                  <th className="px-4 py-3 font-semibold">Note</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Saisi par</th>
                  <th className="px-4 py-3 font-semibold">Date de saisie</th>
                  {canEditStock || canDeleteStock ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {group.lignes.map((ligne) => (
                  <tr key={ligne.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">{ligne.article_label}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.numero_lot || "-"}</td>
                    <td className="px-4 py-3 text-slate-900">{ligne.quantite}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.unite || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMouvementMpDate(ligne.date_reception)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMouvementMpDate(ligne.date_fabrication)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMouvementMpDate(ligne.date_expiration)}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.fournisseur || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.emplacement || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.n_doss_erp || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.n_doss_4d || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.note || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{mouvementMpSourceLabel(ligne.source_import)}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.utilisateur || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatMouvementMpDateTime(ligne.created_at)}
                    </td>
                    {canEditStock || canDeleteStock ? (
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          {canEditStock ? (
                          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                              Modifier
                            </summary>
                            <EditEntreeMpLotForm
                              lotId={ligne.id}
                              quantite={ligne.quantite}
                              numeroLot={ligne.numero_lot || ""}
                              dateReception={ligne.date_reception || ""}
                              dateFabrication={ligne.date_fabrication || ""}
                              dateExpiration={ligne.date_expiration || ""}
                              fournisseur={ligne.fournisseur || ""}
                              emplacement={ligne.emplacement || ""}
                              nDossErp={ligne.n_doss_erp || ""}
                              nDoss4d={ligne.n_doss_4d || ""}
                              note={ligne.note || ""}
                            />
                          </details>
                          ) : null}

                          {canDeleteStock ? (
                          <form action={deleteLotFromEntreeMpDetailAction}>
                            <input type="hidden" name="lot_id" value={ligne.id} />
                            <DeleteIconButton label="Supprimer ligne" />
                          </form>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
