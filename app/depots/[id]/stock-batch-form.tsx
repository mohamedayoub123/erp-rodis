"use client";

import { useState } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { SubmitButton } from "@/app/_components/submit-button";
import { updateDepotStockBatchAction } from "../actions";

// Corrige plusieurs articles/lots d'un depot en une seule saisie ("+
// Ajouter une ligne", meme motif que Transfer Order) - demande explicite
// "changer tout le stock d'un coup" au lieu d'un "Modifier" par ligne du
// tableau. Chaque ligne renvoie ses champs sous les MEMES noms
// (article_type/article_id/numero_lot/nouvelle_quantite), lus par
// updateDepotStockBatchAction via getAll() index par index.
export function DepotStockBatchForm({
  depotId,
  articlesMp,
  articlesPf,
}: {
  depotId: number;
  articlesMp: { id: number; label: string }[];
  articlesPf: { id: number; label: string }[];
}) {
  const [rowKeys, setRowKeys] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);
  const [typeByKey, setTypeByKey] = useState<Record<number, "MP" | "PF">>({});
  const [perteByKey, setPerteByKey] = useState<Record<number, boolean>>({});

  return (
    <form action={updateDepotStockBatchAction} className="grid gap-4 border-t border-slate-100 px-5 py-4">
      <input type="hidden" name="depot_id" value={depotId} />

      <div className="grid gap-2">
        {rowKeys.map((key) => {
          const type = typeByKey[key] ?? "PF";
          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3"
            >
              <div className="flex gap-3 text-xs font-semibold text-slate-500">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`article_type_choix_${key}`}
                    checked={type === "PF"}
                    onChange={() => setTypeByKey((prev) => ({ ...prev, [key]: "PF" }))}
                  />
                  PF
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`article_type_choix_${key}`}
                    checked={type === "MP"}
                    onChange={() => setTypeByKey((prev) => ({ ...prev, [key]: "MP" }))}
                  />
                  MP
                </label>
              </div>
              <input type="hidden" name="article_type" value={type} />
              <div className="min-w-[16rem] flex-1">
                <ProduitPickerField
                  key={type}
                  articles={type === "MP" ? articlesMp : articlesPf}
                  hiddenName="article_id"
                  textName={`produit_${key}`}
                />
              </div>
              <input
                type="text"
                name="numero_lot"
                placeholder="Numero de lot"
                required
                className="w-40 shrink-0 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
              />
              <input
                type="number"
                step="0.001"
                min="0"
                name="nouvelle_quantite"
                placeholder="Nouvelle quantite"
                required
                className="w-36 shrink-0 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
              />
              {type === "MP" ? (
                <label
                  className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-500"
                  title="Genere une ecriture Perte sur stock si la quantite diminue"
                >
                  <input type="hidden" name="est_perte" value={perteByKey[key] ? "1" : "0"} />
                  <input
                    type="checkbox"
                    checked={Boolean(perteByKey[key])}
                    onChange={(e) => setPerteByKey((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  Perte
                </label>
              ) : (
                <input type="hidden" name="est_perte" value="0" />
              )}
              {rowKeys.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setRowKeys(rowKeys.filter((k) => k !== key))}
                  className="shrink-0 rounded-full border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                >
                  Retirer
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setRowKeys([...rowKeys, nextKey]);
            setNextKey(nextKey + 1);
          }}
          className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        >
          + Ajouter une ligne
        </button>
        <SubmitButton
          pendingLabel="Enregistrement..."
          className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
        >
          Enregistrer les corrections
        </SubmitButton>
      </div>
    </form>
  );
}
