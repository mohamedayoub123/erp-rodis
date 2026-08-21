"use client";

import { useState } from "react";
import { SubmitButton } from "@/app/_components/submit-button";
import { updateDepotLotStockAction } from "../actions";

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Corrige le stock d'un lot precis directement depuis la fiche Depot -
// jamais en dessous de ce qui est deja reserve sur ce meme lot (min=reserve,
// re-verifie cote serveur de toute facon). Reste en texte simple tant qu'on
// n'a pas clique "Modifier", comme MachineNomCell.
export function LotStockCell({
  depotId,
  articleType,
  articleId,
  numeroLot,
  solde,
  reserve,
  canEdit,
}: {
  depotId: number;
  articleType: "MP" | "PF";
  articleId: number;
  numeroLot: string;
  solde: number;
  reserve: number;
  canEdit: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!canEdit) return <>{formatNumber(solde)}</>;

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        {formatNumber(solde)}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <form
      action={updateDepotLotStockAction}
      className="flex items-center gap-1"
      onSubmit={() => setIsEditing(false)}
    >
      <input type="hidden" name="depot_id" value={depotId} />
      <input type="hidden" name="article_type" value={articleType} />
      <input type="hidden" name="article_id" value={articleId} />
      <input type="hidden" name="numero_lot" value={numeroLot} />
      <input
        type="number"
        step="0.001"
        min={reserve}
        name="nouvelle_quantite"
        defaultValue={solde}
        autoFocus
        title={reserve > 1e-6 ? `Ne peut pas descendre sous ${formatNumber(reserve)} (deja reserve)` : undefined}
        className="w-24 rounded border border-slate-200 px-1.5 py-1 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
      />
      {articleType === "MP" ? (
        <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500" title="Genere une ecriture Perte sur stock si la quantite diminue">
          <input type="checkbox" name="est_perte" value="1" />
          Perte
        </label>
      ) : null}
      <SubmitButton
        pendingLabel="..."
        className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
      >
        OK
      </SubmitButton>
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        className="rounded px-2 py-0.5 text-xs font-semibold text-slate-400 hover:text-slate-600"
      >
        Annuler
      </button>
    </form>
  );
}
