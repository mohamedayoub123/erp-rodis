"use client";

import { useState, useTransition } from "react";
import { updateLotStockAction } from "./actions";
import { DateJmaFormField } from "@/app/_components/date-jma-input";

// Meme formulaire qu'avant, mais soumis via startTransition + try/catch
// (comme CodeCell) au lieu d'un <form action={...}> natif - une erreur
// (ex: validation) affichait sinon la page d'erreur generique de Next.js au
// lieu d'un message clair, en plein milieu d'un tableau ou perdre la ligne
// ouverte est genant (bug reel signale).
export function EditLotForm({
  lotId,
  numeroLot,
  dateFabrication,
  qteEntree,
  qteSortie,
  chambre,
  codePays,
  note,
}: {
  lotId: number;
  numeroLot: string;
  dateFabrication: string | null;
  qteEntree: number | null;
  qteSortie: number | null;
  chambre: string;
  codePays: string;
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
        await updateLotStockAction(formData);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
      <input type="hidden" name="lot_id" value={lotId} />
      <input
        type="text"
        name="numero_lot"
        defaultValue={numeroLot}
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        required
      />
      <DateJmaFormField name="date_fabrication" defaultValue={dateFabrication} required />
      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="number"
          step="0.01"
          min="0"
          name="qte_entree"
          defaultValue={qteEntree ?? 0}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          required
        />
        <input
          type="number"
          step="0.01"
          min="0"
          name="qte_sortie"
          defaultValue={qteSortie ?? 0}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="text"
          name="chambre"
          defaultValue={chambre}
          placeholder="Chambre"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />
        <input
          type="text"
          name="code_pays"
          defaultValue={codePays}
          placeholder="Code pays"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />
      </div>
      <textarea
        name="note"
        defaultValue={note}
        rows={3}
        placeholder="Note"
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />
      {errorMessage ? <p className="text-xs font-semibold text-red-600">{errorMessage}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
