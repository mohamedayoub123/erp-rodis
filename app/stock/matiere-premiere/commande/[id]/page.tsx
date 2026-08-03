import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { formatDate } from "@/lib/format-date";
import { decodeDossierId } from "../dossier-id";
import {
  createReceptionMpAction,
  deleteBcLigneFromDossierAction,
  deleteImportEvenementAction,
} from "../actions";
import { statutBcBadgeClass, type StatutBc } from "../../bc/constants";

type ImportRow = {
  id: number;
  bc_ligne_id: number;
  quantite_importee: number;
  numero_lot: string | null;
  date_fabrication: string | null;
  date_expiration: string | null;
  date_import: string | null;
  lot_stock_id: number | null;
};

type BcLigneRow = {
  id: number;
  code: string;
  article_label: string | null;
  statut: string | null;
};

async function fetchImportsForDossier(nDoss4d: string | null, nDossErp: string | null) {
  let query = supabaseServer
    .from("bons_commande_mp_imports")
    .select("id, bc_ligne_id, quantite_importee, numero_lot, date_fabrication, date_expiration, date_import, lot_stock_id")
    .order("date_import", { ascending: false });

  query = nDoss4d ? query.eq("n_doss_4d_import", nDoss4d) : query.is("n_doss_4d_import", null);
  query = nDossErp ? query.eq("n_doss_erp_import", nDossErp) : query.is("n_doss_erp_import", null);

  const { data, error } = await query;

  return { rows: (data ?? []) as ImportRow[], error };
}

async function fetchBcLignes(ligneIds: number[]) {
  if (ligneIds.length === 0) return [] as BcLigneRow[];

  const { data } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id, code, article_label, statut")
    .in("id", ligneIds);

  return (data ?? []) as BcLigneRow[];
}

export default async function ImportMpDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const { nDoss4d, nDossErp } = decodeDossierId(id);
  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "commandeMp");

  const { rows, error } = await fetchImportsForDossier(nDoss4d, nDossErp);

  if (!error && rows.length === 0) {
    notFound();
  }

  const bcLignes = await fetchBcLignes([...new Set(rows.map((row) => row.bc_ligne_id))]);
  const ligneById = new Map(bcLignes.map((ligne) => [ligne.id, ligne]));

  // "Receptionnee" ne compte que les evenements issus d'une vraie Reception
  // (lot_stock_id renseigne, stock reellement credite) - un simple "Creer
  // import" depuis le BC (avant la Reception) ne compte pas comme recu.
  // "A receptionner" = ce qui est deja arrive dans ce dossier (tous les
  // evenements d'import, y compris les simples "Creer import") moins ce qui
  // a deja ete reellement receptionne - PAS la quantite commandee au total,
  // qui peut concerner d'autres dossiers pas encore arrives du tout.
  const quantiteImporteeParLigne = new Map<number, number>();
  const quantiteReceptionneeParLigne = new Map<number, number>();
  for (const row of rows) {
    const importeeCurrent = quantiteImporteeParLigne.get(row.bc_ligne_id) ?? 0;
    quantiteImporteeParLigne.set(row.bc_ligne_id, importeeCurrent + Number(row.quantite_importee ?? 0));

    if (row.lot_stock_id === null) continue;
    const current = quantiteReceptionneeParLigne.get(row.bc_ligne_id) ?? 0;
    quantiteReceptionneeParLigne.set(row.bc_ligne_id, current + Number(row.quantite_importee ?? 0));
  }

  // L'historique n'affiche que les vraies Receptions (lot_stock_id
  // renseigne) - un simple "Creer import" (sans lot, sans passer par le
  // bouton Reception) ne doit pas y apparaitre.
  const receptionRows = rows.filter((row) => row.lot_stock_id !== null);
  const quantiteReceptionneeTotale = receptionRows.reduce(
    (sum, row) => sum + Number(row.quantite_importee ?? 0),
    0
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {nDoss4d || "Sans dossier 4D"}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Doss. ERP : {nDossErp || "-"} - {receptionRows.length} reception(s) - {quantiteReceptionneeTotale} au
                total
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/commande" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error.message}
            </p>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-lg font-bold text-slate-900">Lignes de ce dossier</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">BC</th>
                      <th className="px-4 py-3 font-semibold">Article</th>
                      <th className="px-4 py-3 font-semibold">Qte receptionnee</th>
                      <th className="px-4 py-3 font-semibold">Qte a receptionner</th>
                      <th className="px-4 py-3 font-semibold">Statut</th>
                      {canEdit ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {bcLignes.map((ligne) => {
                      const statut = (ligne.statut === "Receptionne" ? "Receptionne" : "Stand") as StatutBc;
                      const quantiteReceptionnee = quantiteReceptionneeParLigne.get(ligne.id) ?? 0;
                      const dejaReceptionne = ligne.statut === "Receptionne";
                      const quantiteImportee = quantiteImporteeParLigne.get(ligne.id) ?? 0;
                      const quantiteAReceptionner = Math.max(0, quantiteImportee - quantiteReceptionnee);

                      return (
                        <tr key={ligne.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3 font-semibold text-sky-700">{ligne.code}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {ligne.article_label || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{quantiteReceptionnee}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{quantiteAReceptionner}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${statutBcBadgeClass(
                                statut
                              )}`}
                            >
                              {dejaReceptionne ? "Receptionne" : "En attente"}
                            </span>
                          </td>
                          {canEdit ? (
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                {dejaReceptionne ? null : (
                                  <details className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                                    <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                                      Reception
                                    </summary>
                                    <form
                                      action={createReceptionMpAction}
                                      className="mt-2 grid w-64 gap-2"
                                    >
                                      <input type="hidden" name="bc_ligne_id" value={ligne.id} />
                                      <input type="hidden" name="n_doss_4d_import" value={nDoss4d ?? ""} />
                                      <input type="hidden" name="n_doss_erp_import" value={nDossErp ?? ""} />
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Numero de lot
                                        <input
                                          type="text"
                                          name="numero_lot"
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Fournisseur
                                        <input
                                          type="text"
                                          name="fournisseur"
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Date de fabrication
                                        <DateJmaFormField name="date_fabrication" />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Date d&apos;expiration
                                        <DateJmaFormField name="date_expiration" />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Quantite receptionnee
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          name="quantite_importee"
                                          defaultValue={quantiteAReceptionner > 0 ? quantiteAReceptionner : undefined}
                                          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                          required
                                        />
                                      </label>
                                      <button
                                        type="submit"
                                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                      >
                                        Enregistrer
                                      </button>
                                    </form>
                                  </details>
                                )}
                                <form action={deleteBcLigneFromDossierAction}>
                                  <input type="hidden" name="bc_id" value={ligne.id} />
                                  <DeleteIconButton label="Supprimer ligne" />
                                </form>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-lg font-bold text-slate-900">Historique des receptions</h2>
              </div>
              {receptionRows.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">
                  Aucune reception pour le moment - utilise le bouton Reception ci-dessus.
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">BC</th>
                      <th className="px-4 py-3 font-semibold">Article</th>
                      <th className="px-4 py-3 font-semibold">Qte importee</th>
                      <th className="px-4 py-3 font-semibold">Lot</th>
                      <th className="px-4 py-3 font-semibold">Date fabrication</th>
                      <th className="px-4 py-3 font-semibold">Date expiration</th>
                      <th className="px-4 py-3 font-semibold">Date reception</th>
                      {canEdit ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {receptionRows.map((row) => {
                      const ligne = ligneById.get(row.bc_ligne_id);

                      return (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-sky-700">
                            {ligne?.code || "-"}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {ligne?.article_label || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-900">{row.quantite_importee}</td>
                          <td className="px-4 py-3 text-slate-600">{row.numero_lot || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(row.date_fabrication)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(row.date_expiration)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(row.date_import)}</td>
                          {canEdit ? (
                            <td className="px-4 py-3">
                              <form action={deleteImportEvenementAction}>
                                <input type="hidden" name="import_id" value={row.id} />
                                <DeleteIconButton label="Supprimer cet import" />
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
