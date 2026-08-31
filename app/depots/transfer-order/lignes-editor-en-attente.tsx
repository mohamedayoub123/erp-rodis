"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { TransferArticlePicker } from "./article-picker";
import { SubmitButton } from "@/app/_components/submit-button";
import type { ArticleType } from "./stock-lots";

// Meme motif que CloseEditingWhenSaved (lignes-editor.tsx) : referme le mode
// Modifier seulement une fois l'aller-retour serveur reellement termine.
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
  disponible: number;
};

// Edition des lignes d'un Transfer Order encore "en_attente" (avant
// approbation) - aucun lot n'est encore reserve a ce stade, donc juste
// article + quantite demandee (pas de picker de lot, contrairement a
// TransferOrderLignesEditor qui gere l'etape APRES approbation). Cadenas par
// defaut, meme convention que le reste de la page : rien n'est modifiable
// tant qu'on n'a pas clique "Modifier".
export function TransferOrderLignesEditorEnAttente({
  transferOrderId,
  lignes,
  articlesMp,
  articlesPf,
  depotSourceId,
  updateAction,
  canEditLignes,
}: {
  transferOrderId: number;
  lignes: LigneRow[];
  articlesMp: { id: number; label: string }[];
  articlesPf: { id: number; label: string }[];
  depotSourceId: number;
  updateAction: (formData: FormData) => void | Promise<void>;
  canEditLignes: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [supprimees, setSupprimees] = useState<Set<number>>(new Set());
  const [newRowKeys, setNewRowKeys] = useState<number[]>([]);
  const [nextKey, setNextKey] = useState(1);

  function toggleSupprimer(ligneId: number) {
    setSupprimees((prev) => {
      const next = new Set(prev);
      if (next.has(ligneId)) next.delete(ligneId);
      else next.add(ligneId);
      return next;
    });
  }

  function resetEditState() {
    setSupprimees(new Set());
    setNewRowKeys([]);
  }

  if (!isEditing) {
    return (
      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {canEditLignes ? (
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <p className="text-sm text-slate-500">
              Verrouille - clique &quot;Modifier&quot; pour changer l&apos;article, la quantite,
              ajouter ou retirer un article.
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
                <th className="px-6 py-4 font-semibold">Qt</th>
                <th className="px-6 py-4 font-semibold">Stock</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <tr key={ligne.id} className="border-t border-slate-100">
                  <td className="px-6 py-4 font-medium text-slate-900">{ligne.nom}</td>
                  <td className="px-6 py-4 text-slate-600">{ligne.quantite_demandee.toLocaleString("fr-FR")}</td>
                  <td className="px-6 py-4 text-slate-600">{ligne.disponible.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <form action={updateAction} className="grid gap-4 p-6">
        <CloseEditingWhenSaved
          onSaved={() => {
            resetEditState();
            setIsEditing(false);
          }}
        />
        <input type="hidden" name="transfer_order_id" value={transferOrderId} />

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-amber-700">
            Mode modification - change l&apos;article, la quantite, ou coche &quot;Supprimer&quot;.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                resetEditState();
                setIsEditing(false);
              }}
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

        <div className="grid gap-2">
          {lignes.map((ligne) => {
            const estSupprimee = supprimees.has(ligne.id);
            return (
              <div
                key={ligne.id}
                className={`flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 ${estSupprimee ? "opacity-40" : ""}`}
              >
                <input type="hidden" name="existing_ligne_id" value={ligne.id} />
                <div className="flex-1">
                  <TransferArticlePicker
                    articlesMp={articlesMp}
                    articlesPf={articlesPf}
                    depotSourceId={depotSourceId}
                    defaultType={ligne.article_type}
                    defaultArticleId={ligne.article_id}
                    defaultLabel={ligne.nom}
                  />
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  name="quantite_demandee"
                  defaultValue={ligne.quantite_demandee}
                  disabled={estSupprimee}
                  className="w-28 shrink-0 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none disabled:bg-slate-50"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-red-700">
                  <input
                    type="checkbox"
                    name="supprimer_ligne_id"
                    value={ligne.id}
                    checked={estSupprimee}
                    onChange={() => toggleSupprimer(ligne.id)}
                  />
                  Supprimer
                </label>
              </div>
            );
          })}

          {newRowKeys.map((key) => (
            <div key={key} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <input type="hidden" name="existing_ligne_id" value="0" />
              <div className="flex-1">
                <TransferArticlePicker articlesMp={articlesMp} articlesPf={articlesPf} depotSourceId={depotSourceId} />
              </div>
              <input
                type="number"
                step="0.001"
                min="0"
                name="quantite_demandee"
                placeholder="Quantite"
                className="w-28 shrink-0 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setNewRowKeys(newRowKeys.filter((k) => k !== key))}
                className="shrink-0 rounded-full border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
              >
                Retirer
              </button>
            </div>
          ))}
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              setNewRowKeys([...newRowKeys, nextKey]);
              setNextKey(nextKey + 1);
            }}
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            + Ajouter un article
          </button>
        </div>
      </form>
    </section>
  );
}
