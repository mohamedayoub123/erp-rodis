"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { SubmitButton } from "@/app/_components/submit-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { LotSearchField } from "../transfer-order/lot-search-field";

type LigneRow = {
  id: number;
  nom: string;
  articleType: "MP" | "PF" | null;
  numero_lot: string | null;
  quantite: number;
  lotsDisponibles: { numeroLot: string; solde: number }[];
};

// Doit etre un enfant du <form> pour lire son etat via useFormStatus() -
// des que "Enregistrer" finit reellement son aller-retour serveur
// (transition pending true -> false, pas juste au clic), remet isDirty a
// false. Sans ca, isDirty restait bloque a true APRES un Enregistrer
// reussi (revalidatePath re-rend le Server Component avec les nouvelles
// donnees mais ne remonte pas ce composant client, donc son state ne se
// reinitialise jamais tout seul) - "Enregistrer" restait allume et
// "Approuver" restait eteint indefiniment meme apres une sauvegarde qui
// avait pourtant reussi.
function ResetDirtyWhenSaved({ onSaved }: { onSaved: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      onSaved();
    }
    wasPending.current = pending;
  }, [pending, onSaved]);

  return null;
}

// Empeche d'appuyer "Approuver" avec une quantite tout juste modifiee mais
// pas encore enregistree - avant, "Approuver" etait un formulaire tout a
// fait separe qui n'envoyait meme pas les quantites du tableau : cliquer
// dessus juste apres avoir change un chiffre validait silencieusement
// l'ANCIENNE quantite (celle deja en base), pas celle tapee a l'ecran.
// "Approuver" reste eteint tant qu'il y a une modification non enregistree ;
// "Enregistrer" ne s'allume que s'il y a quelque chose a enregistrer.
export function InvoiceOrderLignesEditor({
  invoiceOrderId,
  lignes,
  canEditLignes,
  canValidate,
  canDeleteLigneApprouvee,
  updateAction,
  validateAction,
  deleteLigneAction,
  deleteLigneApprouveeAction,
  depotSourceNom,
}: {
  invoiceOrderId: number;
  lignes: LigneRow[];
  canEditLignes: boolean;
  canValidate: boolean;
  canDeleteLigneApprouvee: boolean;
  updateAction: (formData: FormData) => void | Promise<void>;
  validateAction: (formData: FormData) => void | Promise<void>;
  deleteLigneAction: (formData: FormData) => void | Promise<void>;
  deleteLigneApprouveeAction: (formData: FormData) => void | Promise<void>;
  depotSourceNom: string;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const canDeleteAnyLigne = canEditLignes || canDeleteLigneApprouvee;
  const totalQuantite = lignes.reduce((sum, ligne) => sum + ligne.quantite, 0);

  return (
    <>
      {canValidate ? (
        <div className="flex flex-wrap items-center gap-3">
          <form action={validateAction}>
            <input type="hidden" name="invoice_order_id" value={invoiceOrderId} />
            <SubmitButton
              pendingLabel="Approbation..."
              disabled={isDirty}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              Approuver
            </SubmitButton>
          </form>
          {isDirty ? (
            <p className="text-xs font-semibold text-amber-700">
              Modification pas encore enregistree - clique &quot;Enregistrer&quot; avant de pouvoir
              approuver.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        {/* "Enregistrer" est un vrai bouton A L'INTERIEUR de ce formulaire
        (plus fiable que l'ancien attribut form="invoice-lignes-form" sur un
        bouton place ailleurs dans le DOM) - SubmitButton exige d'etre
        descendant du <form> qu'il soumet pour lire son etat via
        useFormStatus(). isDirty se reinitialise via ResetDirtyWhenSaved
        (pas au clic - seulement quand le formulaire a reellement fini son
        aller-retour serveur). */}
        <form action={updateAction} className="p-6">
          <ResetDirtyWhenSaved onSaved={() => setIsDirty(false)} />
          <input type="hidden" name="invoice_order_id" value={invoiceOrderId} />
          {canEditLignes ? (
            <div className="mb-4">
              <SubmitButton
                pendingLabel="Enregistrement..."
                disabled={!isDirty}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Enregistrer
              </SubmitButton>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Article</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Lot</th>
                  <th className="px-6 py-4 font-semibold">Disponible {depotSourceNom}</th>
                  <th className="px-6 py-4 font-semibold">Quantite</th>
                  {canDeleteAnyLigne ? <th className="px-6 py-4 font-semibold"></th> : null}
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr>
                    <td className="px-6 py-4 text-slate-400" colSpan={canDeleteAnyLigne ? 6 : 5}>
                      Aucune ligne - tout a deja ete livre ou efface.
                    </td>
                  </tr>
                ) : (
                  lignes.map((ligne) => (
                    <tr key={ligne.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{ligne.nom}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {ligne.articleType === "MP" ? "Matiere premiere" : "Produit fini"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {canEditLignes ? (
                          <LotSearchField
                            name="numero_lot"
                            defaultValue={ligne.numero_lot ?? ""}
                            lots={ligne.lotsDisponibles}
                            onChange={() => setIsDirty(true)}
                          />
                        ) : (
                          ligne.numero_lot || "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {(
                          ligne.lotsDisponibles.find((disp) => disp.numeroLot === (ligne.numero_lot ?? ""))?.solde ?? 0
                        ).toLocaleString("fr-FR")}
                      </td>
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
                              onChange={() => setIsDirty(true)}
                              className="w-32 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                            />
                          </>
                        ) : (
                          ligne.quantite.toLocaleString("fr-FR")
                        )}
                      </td>
                      {canDeleteAnyLigne ? (
                        <td className="px-6 py-4">
                          <DeleteIconButton
                            label={
                              canEditLignes
                                ? "Supprimer cette ligne"
                                : "Supprimer cette ligne (annule et restitue le stock deja livre)"
                            }
                            formAction={canEditLignes ? deleteLigneAction : deleteLigneApprouveeAction}
                            formNoValidate
                            name="delete_invoice_order_ligne_id"
                            value={ligne.id}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
                {lignes.length > 0 ? (
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-6 py-4 font-bold text-slate-900">Total</td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4 font-bold text-slate-900">{totalQuantite.toLocaleString("fr-FR")}</td>
                    {canDeleteAnyLigne ? <td className="px-6 py-4"></td> : null}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {canEditLignes ? (
            <p className="mt-3 px-1 text-xs text-slate-500">
              La quantite ne peut etre que diminuee (jamais augmentee). Mets 0 pour ne pas livrer une
              ligne - elle repart automatiquement sur le Transfer Order.
            </p>
          ) : null}
        </form>
      </section>
    </>
  );
}
