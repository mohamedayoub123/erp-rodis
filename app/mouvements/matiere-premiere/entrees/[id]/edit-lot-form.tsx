"use client";

import { useState, useTransition } from "react";
import { updateLotFromEntreeMpDetailAction } from "@/app/mouvements/matiere-premiere/actions";

// Meme formulaire qu'avant, mais soumis via startTransition + try/catch
// (comme CodeCell) au lieu d'un <form action={...}> natif - une erreur
// (ex: validation, solde negatif) affichait sinon la page d'erreur generique
// de Next.js au lieu d'un message clair (bug reel signale).
export function EditEntreeMpLotForm({
  lotId,
  quantite,
  numeroLot,
  dateReception,
  dateFabrication,
  dateExpiration,
  fournisseur,
  emplacement,
  nDossErp,
  nDoss4d,
  note,
}: {
  lotId: number;
  quantite: number;
  numeroLot: string;
  dateReception: string;
  dateFabrication: string;
  dateExpiration: string;
  fournisseur: string;
  emplacement: string;
  nDossErp: string;
  nDoss4d: string;
  note: string;
}) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        await updateLotFromEntreeMpDetailAction(formData);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 grid w-64 gap-2">
      <input type="hidden" name="lot_id" value={lotId} />
      <label className="grid gap-1 text-xs text-slate-500">
        Quantite
        <input
          type="number"
          step="0.01"
          min="0"
          name="quantite"
          defaultValue={quantite}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
          required
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Lot
        <input
          type="text"
          name="numero_lot"
          defaultValue={numeroLot}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Reception
        <input
          type="date"
          name="date_reception"
          defaultValue={dateReception}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Fabrication
        <input
          type="date"
          name="date_fabrication"
          defaultValue={dateFabrication}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Expiration
        <input
          type="date"
          name="date_expiration"
          defaultValue={dateExpiration}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Fournisseur
        <input
          type="text"
          name="fournisseur"
          defaultValue={fournisseur}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Emplacement
        <input
          type="text"
          name="emplacement"
          defaultValue={emplacement}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Doss. ERP
        <input
          type="text"
          name="n_doss_erp"
          defaultValue={nDossErp}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Doss. 4D
        <input
          type="text"
          name="n_doss_4d"
          defaultValue={nDoss4d}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Note
        <input
          type="text"
          name="note"
          defaultValue={note}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      {errorMessage ? <p className="text-xs font-semibold text-red-600">{errorMessage}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
