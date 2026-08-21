"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { SubmitButton } from "@/app/_components/submit-button";
import type { ArticleType } from "./stock-lots";

type LotChoisi = { numero_lot: string | null; quantite: number };

// Doit etre un enfant du <form> pour lire son etat via useFormStatus() - des
// que "Enregistrer" finit reellement son aller-retour serveur (transition
// pending true -> false, pas juste au clic), referme le mode Modifier :
// demande explicite, on ne reste pas en edition apres avoir sauvegarde, il
// faut recliquer "Modifier" pour continuer.
function CloseEditingWhenSaved({ onSaved }: { onSaved: () => void }) {
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

type LigneRow = {
  id: number;
  nom: string;
  article_type: ArticleType;
  article_id: number;
  quantite_demandee: number;
  lotsDisponibles: { numeroLot: string; solde: number }[];
};

// Cadenas par defaut (aucun champ modifiable tant qu'on n'a pas clique
// "Modifier") - avant, la quantite a transferer et le lot etaient TOUJOURS
// des champs de formulaire actifs sur cette page, meme sans intention de
// changer quoi que ce soit. Demande explicite : verrouille par defaut,
// deverrouille seulement via ce bouton, qui permet alors de tout changer
// (article, lot, quantite, ou supprimer la ligne entierement).
export function TransferOrderLignesEditor({
  transferOrderId,
  lignes,
  lotsByLigneId,
  articlesMp,
  articlesPf,
  updateAction,
  canEditLignes,
}: {
  transferOrderId: number;
  lignes: LigneRow[];
  lotsByLigneId: Record<number, LotChoisi[]>;
  articlesMp: { id: number; label: string }[];
  articlesPf: { id: number; label: string }[];
  updateAction: (formData: FormData) => void | Promise<void>;
  canEditLignes: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [supprimees, setSupprimees] = useState<Set<number>>(new Set());
  const [articleChoisi, setArticleChoisi] = useState<Record<number, { type: ArticleType; id: number | null }>>({});

  function toggleSupprimer(ligneId: number) {
    setSupprimees((prev) => {
      const next = new Set(prev);
      if (next.has(ligneId)) next.delete(ligneId);
      else next.add(ligneId);
      return next;
    });
  }

  if (!isEditing) {
    return (
      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {canEditLignes ? (
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <p className="text-sm text-slate-500">
              Verrouille - clique &quot;Modifier&quot; pour changer l&apos;article, le lot, la
              quantite, ou supprimer une ligne.
            </p>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Modifier
            </button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Article</th>
                <th className="px-6 py-4 font-semibold">Demande</th>
                <th className="px-6 py-4 font-semibold">Numero de lot</th>
                <th className="px-6 py-4 font-semibold">Disponible au depot source</th>
                <th className="px-6 py-4 font-semibold">Quantite a transferer</th>
              </tr>
            </thead>
            <tbody>
              {lignes.flatMap((ligne) => {
                const lots = lotsByLigneId[ligne.id] ?? [];
                const rows = lots.length > 0 ? lots : [{ numero_lot: null, quantite: 0 }];
                return rows.map((lot, index) => {
                  const disponible = ligne.lotsDisponibles.find(
                    (disp) => disp.numeroLot === (lot.numero_lot || "")
                  )?.solde;
                  return (
                    <tr key={`${ligne.id}-${index}`} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{index === 0 ? ligne.nom : ""}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {index === 0 ? ligne.quantite_demandee.toLocaleString("fr-FR") : ""}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{lot.numero_lot || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {disponible === undefined ? "-" : disponible.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{lot.quantite.toLocaleString("fr-FR")}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <form action={updateAction} className="grid gap-4 p-6">
        <CloseEditingWhenSaved onSaved={() => setIsEditing(false)} />
        <input type="hidden" name="transfer_order_id" value={transferOrderId} />

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-amber-700">
            Mode modification - change l&apos;article, le lot, la quantite, ou coche "Supprimer".
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              Annuler
            </button>
            <SubmitButton
              pendingLabel="Enregistrement..."
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Enregistrer
            </SubmitButton>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Article</th>
                <th className="px-6 py-4 font-semibold">Demande</th>
                <th className="px-6 py-4 font-semibold">Numero de lot</th>
                <th className="px-6 py-4 font-semibold">Disponible</th>
                <th className="px-6 py-4 font-semibold">Quantite a transferer</th>
                <th className="px-6 py-4 font-semibold">Supprimer</th>
              </tr>
            </thead>
            <tbody>
              {lignes.flatMap((ligne) => {
                const estSupprimee = supprimees.has(ligne.id);
                const choix = articleChoisi[ligne.id];
                const lots = lotsByLigneId[ligne.id] ?? [];
                const rows = lots.length > 0 ? lots : [{ numero_lot: null, quantite: 0 }];

                return rows.map((lot, index) => (
                  <tr
                    key={`${ligne.id}-${index}`}
                    className={`border-t border-slate-100 ${estSupprimee ? "opacity-40" : ""}`}
                  >
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {index === 0 ? (
                        <div className="flex min-w-[16rem] flex-col gap-1.5">
                          <div className="flex gap-3 text-xs font-semibold text-slate-500">
                            <label className="flex items-center gap-1.5">
                              <input
                                type="radio"
                                name={`article_type_choice_${ligne.id}`}
                                checked={(choix?.type ?? ligne.article_type) === "MP"}
                                disabled={estSupprimee}
                                onChange={() =>
                                  setArticleChoisi((prev) => ({
                                    ...prev,
                                    [ligne.id]: { type: "MP", id: null },
                                  }))
                                }
                              />
                              MP
                            </label>
                            <label className="flex items-center gap-1.5">
                              <input
                                type="radio"
                                name={`article_type_choice_${ligne.id}`}
                                checked={(choix?.type ?? ligne.article_type) === "PF"}
                                disabled={estSupprimee}
                                onChange={() =>
                                  setArticleChoisi((prev) => ({
                                    ...prev,
                                    [ligne.id]: { type: "PF", id: null },
                                  }))
                                }
                              />
                              PF
                            </label>
                          </div>
                          <input type="hidden" name="article_change_ligne_id" value={ligne.id} />
                          <input type="hidden" name="new_article_type" value={choix?.type ?? ligne.article_type} />
                          <ProduitPickerField
                            key={`${ligne.id}-${choix?.type ?? ligne.article_type}`}
                            articles={(choix?.type ?? ligne.article_type) === "MP" ? articlesMp : articlesPf}
                            defaultValue={choix ? "" : ligne.nom}
                            defaultArticleId={choix ? choix.id : ligne.article_id}
                            hiddenName="new_article_id"
                            textName={`produit_${ligne.id}`}
                            onSelect={(id) =>
                              setArticleChoisi((prev) => ({
                                ...prev,
                                [ligne.id]: { type: prev[ligne.id]?.type ?? ligne.article_type, id },
                              }))
                            }
                          />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {index === 0 ? ligne.quantite_demandee.toLocaleString("fr-FR") : ""}
                    </td>
                    <td className="px-6 py-4">
                      <input type="hidden" name="ligne_id" value={ligne.id} />
                      <select
                        name="numero_lot"
                        defaultValue={lot.numero_lot ?? ""}
                        disabled={estSupprimee}
                        className="w-56 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                      >
                        {ligne.lotsDisponibles.map((disp) => (
                          <option key={disp.numeroLot} value={disp.numeroLot}>
                            {disp.numeroLot || "(sans numero)"} - disponible : {disp.solde.toLocaleString("fr-FR")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {(
                        ligne.lotsDisponibles.find((disp) => disp.numeroLot === (lot.numero_lot || ""))?.solde ?? 0
                      ).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max={ligne.lotsDisponibles.find((disp) => disp.numeroLot === (lot.numero_lot || ""))?.solde}
                        name="quantite"
                        defaultValue={lot.quantite ?? 0}
                        disabled={estSupprimee}
                        className="w-32 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-6 py-4">
                      {index === 0 ? (
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                          <input
                            type="checkbox"
                            name="supprimer_ligne_id"
                            value={ligne.id}
                            checked={estSupprimee}
                            onChange={() => toggleSupprimer(ligne.id)}
                          />
                          Supprimer
                        </label>
                      ) : null}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </form>
    </section>
  );
}
