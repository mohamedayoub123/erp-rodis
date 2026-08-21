import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canVoirPrixUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { DeviseTauxFormField } from "@/app/_components/devise-taux-input";
import { formatDate } from "@/lib/format-date";
import { decodeDossierId } from "../dossier-id";
import {
  createReceptionMpAction,
  deleteBcLigneFromDossierAction,
  deleteImportEvenementAction,
} from "../actions";
import { statutBcBadgeClass, type StatutBc } from "../../bc/constants";
import { convertirEnFcfa } from "@/lib/prix-devise";

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
  prix_unitaire: number | null;
  devise: string | null;
  taux_change: number | null;
};

function formatPrix(prix: number | null, devise: string | null) {
  if (prix == null) return "-";
  return `${prix.toLocaleString("fr-FR")}${devise && devise !== "FCFA" ? ` ${devise}` : ""}`;
}

function formatFcfa(prix: number | null) {
  if (prix == null) return "-";
  return `${prix.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`;
}

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
    .select("id, code, article_label, statut, prix_unitaire, devise, taux_change")
    .in("id", ligneIds);

  return (data ?? []) as BcLigneRow[];
}

type LotPriceInfo = { prix_unitaire: number | null; devise: string | null; taux_change: number | null };

// Le prix REEL d'une reception vit sur la ligne de stock qu'elle a creee
// (lots_stock_matiere_premiere.prix_unitaire), pas sur l'evenement d'import
// lui-meme - petite requete a part pour l'afficher dans "Historique des
// receptions" sans dupliquer le prix a 2 endroits.
async function fetchLotPrices(lotIds: number[]) {
  if (lotIds.length === 0) return new Map<number, LotPriceInfo>();

  const { data } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("id, prix_unitaire, devise, taux_change")
    .in("id", lotIds);

  return new Map(
    ((data ?? []) as (LotPriceInfo & { id: number })[]).map((row) => [
      row.id,
      { prix_unitaire: row.prix_unitaire, devise: row.devise, taux_change: row.taux_change },
    ])
  );
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
  const canDelete = await canDeletePageUser(currentUser, "commandeMp");
  const canVoirPrix = await canVoirPrixUser(currentUser);

  const { rows, error } = await fetchImportsForDossier(nDoss4d, nDossErp);

  if (!error && rows.length === 0) {
    notFound();
  }

  const bcLignes = await fetchBcLignes([...new Set(rows.map((row) => row.bc_ligne_id))]);
  const ligneById = new Map(bcLignes.map((ligne) => [ligne.id, ligne]));
  const lotIds = rows.map((row) => row.lot_stock_id).filter((lotId): lotId is number => lotId !== null);
  const lotDataById = await fetchLotPrices(lotIds);

  // "Importee" = uniquement les evenements "Creer import" encore ouverts
  // (lot_stock_id null) - chaque ligne "Creer import" declare un lot arrive
  // au dossier INDEPENDANT des autres (ex: 3 lots distincts 7140/10320/24120
  // sous le meme dossier). Receptionner un de ces lots met a jour SA PROPRE
  // ligne (quantite reduite ou lot_stock_id renseigne si receptionne en
  // entier - voir createReceptionMpAction) - il ne faut donc PAS soustraire
  // en plus le total receptionne des AUTRES lots du dossier, sinon un lot
  // encore intact et jamais touche (ex: 24120) se retrouve affiche comme
  // partiellement receptionne juste parce qu'un autre lot du meme dossier
  // l'a ete (bug confirme : 24120 affichait "6660 a receptionner" au lieu
  // de 24120, a cause des receptions separees de 10320 et 7140).
  // "A receptionner" = uniquement ce qui reste ENCORE ouvert (lot_stock_id
  // null) - PAS la quantite commandee au total, qui peut concerner d'autres
  // dossiers pas encore arrives du tout.
  const quantiteImporteeParLigne = new Map<number, number>();
  for (const row of rows) {
    if (row.lot_stock_id !== null) continue;
    const importeeCurrent = quantiteImporteeParLigne.get(row.bc_ligne_id) ?? 0;
    quantiteImporteeParLigne.set(row.bc_ligne_id, importeeCurrent + Number(row.quantite_importee ?? 0));
  }

  // L'historique n'affiche que les vraies Receptions (lot_stock_id
  // renseigne) - un simple "Creer import" (sans lot, sans passer par le
  // bouton Reception) ne doit pas y apparaitre.
  const receptionRows = rows.filter((row) => row.lot_stock_id !== null);
  const quantiteReceptionneeTotale = receptionRows.reduce(
    (sum, row) => sum + Number(row.quantite_importee ?? 0),
    0
  );

  // Prix total = prix unitaire (converti en FCFA si devise etrangere) x
  // quantite - une ligne sans prix connu ne compte pas dans le total
  // general (jamais un montant devine), plutot que de le faire echouer
  // silencieusement a 0.
  const prixTotalParLigne = new Map<number, number | null>();
  for (const ligne of bcLignes) {
    const quantite = quantiteImporteeParLigne.get(ligne.id) ?? 0;
    const prixFcfa = convertirEnFcfa(ligne.prix_unitaire, ligne.devise, ligne.taux_change);
    prixTotalParLigne.set(ligne.id, prixFcfa !== null ? prixFcfa * quantite : null);
  }
  const totalGeneralLignes = [...prixTotalParLigne.values()].reduce(
    (sum: number | null, v) => (v === null ? sum : (sum ?? 0) + v),
    null
  );

  const prixTotalParReception = new Map<number, number | null>();
  for (const row of receptionRows) {
    const lotData = row.lot_stock_id !== null ? lotDataById.get(row.lot_stock_id) : null;
    const prixFcfa = lotData ? convertirEnFcfa(lotData.prix_unitaire, lotData.devise, lotData.taux_change) : null;
    prixTotalParReception.set(row.id, prixFcfa !== null ? prixFcfa * Number(row.quantite_importee ?? 0) : null);
  }
  const totalGeneralReceptions = [...prixTotalParReception.values()].reduce(
    (sum: number | null, v) => (v === null ? sum : (sum ?? 0) + v),
    null
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
                      {canVoirPrix ? <th className="px-4 py-3 font-semibold">Prix unitaire</th> : null}
                      <th className="px-4 py-3 font-semibold">Qte a receptionner</th>
                      {canVoirPrix ? <th className="px-4 py-3 font-semibold">Prix total</th> : null}
                      <th className="px-4 py-3 font-semibold">Statut</th>
                      {canEdit || canDelete ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {bcLignes.map((ligne) => {
                      const quantiteAReceptionner = quantiteImporteeParLigne.get(ligne.id) ?? 0;
                      // ligne.statut vient de bons_commande_matiere_premiere - une seule
                      // valeur par ligne BC, pas par dossier. Un article qui arrive en
                      // plusieurs dossiers (chacun avec sa propre reception, voir
                      // bc/actions.ts) passe ce statut a "Receptionne" des le premier
                      // dossier receptionne - ne pas s'en servir pour bloquer le bouton
                      // Reception des autres dossiers, sinon leur part n'est plus jamais
                      // receptionnable. "dejaReceptionne" doit refleter CE dossier
                      // uniquement, via quantiteAReceptionner qui est deja calcule a
                      // partir des seuls evenements de ce dossier.
                      const dejaReceptionne = quantiteAReceptionner <= 0;
                      const statut = (dejaReceptionne ? "Receptionne" : "Stand") as StatutBc;

                      return (
                        <tr key={ligne.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3 font-semibold text-sky-700">
                            <Link href={`/stock/matiere-premiere/bc/${ligne.code}`} className="hover:underline">
                              {ligne.code}
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {ligne.article_label || "-"}
                          </td>
                          {canVoirPrix ? (
                            <td className="px-4 py-3 text-slate-600">
                              {formatPrix(ligne.prix_unitaire, ligne.devise)}
                            </td>
                          ) : null}
                          <td className="px-4 py-3 font-semibold text-slate-900">{quantiteAReceptionner}</td>
                          {canVoirPrix ? (
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {formatFcfa(prixTotalParLigne.get(ligne.id) ?? null)}
                            </td>
                          ) : null}
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${statutBcBadgeClass(
                                statut
                              )}`}
                            >
                              {dejaReceptionne ? "Receptionne" : "En attente"}
                            </span>
                          </td>
                          {canEdit || canDelete ? (
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                {canEdit && !dejaReceptionne && (
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
                                        <DateJmaFormField name="date_fabrication" required />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Date d&apos;expiration
                                        <DateJmaFormField name="date_expiration" required />
                                      </label>
                                      <label className="grid gap-1 text-xs text-slate-500">
                                        Date de reception
                                        <DateJmaFormField name="date_reception" required />
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
                                      {canVoirPrix ? (
                                        <>
                                          <label className="grid gap-1 text-xs text-slate-500">
                                            Prix unitaire (reel)
                                            <input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              name="prix_unitaire"
                                              defaultValue={ligne.prix_unitaire ?? ""}
                                              className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                            />
                                          </label>
                                          <div className="text-xs text-slate-500">
                                            <DeviseTauxFormField
                                              deviseDefaultValue={ligne.devise}
                                              tauxDefaultValue={ligne.taux_change}
                                            />
                                          </div>
                                        </>
                                      ) : null}
                                      <SubmitButton
                                        pendingLabel="Enregistrement..."
                                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                      >
                                        Enregistrer
                                      </SubmitButton>
                                    </form>
                                  </details>
                                )}
                                {canDelete ? (
                                  <form action={deleteBcLigneFromDossierAction}>
                                    <input type="hidden" name="bc_id" value={ligne.id} />
                                    <input type="hidden" name="n_doss_4d" value={nDoss4d ?? ""} />
                                    <input type="hidden" name="n_doss_erp" value={nDossErp ?? ""} />
                                    <DeleteIconButton label="Retirer de ce dossier (garde la commande sur le BC)" />
                                  </form>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                  {canVoirPrix ? (
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900" colSpan={3}>
                          Total
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{formatFcfa(totalGeneralLignes)}</td>
                        <td colSpan={canEdit || canDelete ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  ) : null}
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
                      {canVoirPrix ? <th className="px-4 py-3 font-semibold">Prix unitaire</th> : null}
                      {canVoirPrix ? <th className="px-4 py-3 font-semibold">Prix total</th> : null}
                      <th className="px-4 py-3 font-semibold">Lot</th>
                      <th className="px-4 py-3 font-semibold">Date fabrication</th>
                      <th className="px-4 py-3 font-semibold">Date expiration</th>
                      <th className="px-4 py-3 font-semibold">Date reception</th>
                      {canDelete ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {receptionRows.map((row) => {
                      const ligne = ligneById.get(row.bc_ligne_id);
                      const lotData = row.lot_stock_id !== null ? lotDataById.get(row.lot_stock_id) : null;

                      return (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-sky-700">
                            {ligne?.code ? (
                              <Link href={`/stock/matiere-premiere/bc/${ligne.code}`} className="hover:underline">
                                {ligne.code}
                              </Link>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {ligne?.article_label || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-900">{row.quantite_importee}</td>
                          {canVoirPrix ? (
                            <td className="px-4 py-3 text-slate-600">
                              {formatPrix(lotData?.prix_unitaire ?? null, lotData?.devise ?? null)}
                            </td>
                          ) : null}
                          {canVoirPrix ? (
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {formatFcfa(prixTotalParReception.get(row.id) ?? null)}
                            </td>
                          ) : null}
                          <td className="px-4 py-3 text-slate-600">{row.numero_lot || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(row.date_fabrication)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(row.date_expiration)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(row.date_import)}</td>
                          {canDelete ? (
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
                  {canVoirPrix ? (
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900" colSpan={4}>
                          Total
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {formatFcfa(totalGeneralReceptions)}
                        </td>
                        <td colSpan={canDelete ? 5 : 4}></td>
                      </tr>
                    </tfoot>
                  ) : null}
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
