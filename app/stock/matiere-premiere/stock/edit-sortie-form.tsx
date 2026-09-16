"use client";

import { useState, useTransition } from "react";
import { updateLotFromSortieMpDetailAction } from "@/app/mouvements/matiere-premiere/actions";

// Meme formulaire qu'avant, mais soumis via startTransition + try/catch
// (comme CodeCell) au lieu d'un <form action={...}> natif - une erreur
// affichait sinon la page d'erreur generique de Next.js au lieu d'un
// message clair (bug reel signale).
export function EditStockMpSortieForm({
  lotId,
  quantite,
  dateSortie,
  client,
  note,
}: {
  lotId: number;
  quantite: number;
  dateSortie: string;
  client: string;
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
        await updateLotFromSortieMpDetailAction(formData);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 grid w-56 gap-2">
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
        Date sortie
        <input
          type="date"
          name="date_sortie"
          defaultValue={dateSortie}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
          required
        />
      </label>
      <label className="grid gap-1 text-xs text-slate-500">
        Client
        <input
          type="text"
          name="client"
          defaultValue={client}
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
