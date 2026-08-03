import { notFound } from "next/navigation";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteLotFromSortieDetailAction } from "@/app/mouvements/actions";
import {
  buildSortieRows,
  fetchWebMouvementSourceRows,
  formatMouvementDate,
  parseSortieMeta,
} from "../../shared";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";

export default async function SortieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const groupeId = Number(id);
  const currentStockUser = await getCurrentStockUser();
  const canEditStock = await canWritePageUser(currentStockUser, "mouvementsSortieDetail");
  const sourceRows = await fetchWebMouvementSourceRows();
  const group = buildSortieRows(sourceRows).find((sortie) => sortie.groupe_id === groupeId);

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
                {formatMouvementDate(group.date_jour)} - {group.lignes.length} article(s) - quantite totale {group.quantite_totale}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/mouvements/produit-fini" />
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
                  <th className="px-4 py-3 font-semibold">Livre pour</th>
                  <th className="px-4 py-3 font-semibold">BL</th>
                  <th className="px-4 py-3 font-semibold">Preparateur</th>
                  <th className="px-4 py-3 font-semibold">Saisi par</th>
                  {canEditStock ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {group.lignes.map((ligne) => {
                  const meta = parseSortieMeta(ligne.note);
                  return (
                    <tr key={ligne.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 font-medium text-slate-900">{ligne.article_label}</td>
                      <td className="px-4 py-3 text-slate-600">{ligne.numero_lot || "-"}</td>
                      <td className="px-4 py-3 text-slate-900">{ligne.quantite}</td>
                      <td className="px-4 py-3 text-slate-600">{meta.livre_pour || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{meta.numero_bl || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{meta.preparateur || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{ligne.utilisateur || "-"}</td>
                      {canEditStock ? (
                        <td className="px-4 py-3">
                          <form action={deleteLotFromSortieDetailAction}>
                            <input type="hidden" name="lot_id" value={ligne.id} />
                            <DeleteIconButton label="Supprimer ligne" />
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
