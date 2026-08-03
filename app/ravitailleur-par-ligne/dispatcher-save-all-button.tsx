"use client";

import { useState, useTransition } from "react";
import { saveAllZonesDispatcherSnapshotAction } from "./dispatcher-actions";

export function DispatcherSaveAllButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function handleSave() {
    setMessage("");
    setErrorMessage("");

    startTransition(async () => {
      try {
        const result = await saveAllZonesDispatcherSnapshotAction();
        setMessage(`Enregistre sous le code ${result.code}.`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <div className="no-print flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-900">Enregistrer le programme complet</p>
        <p className="text-xs text-slate-500">
          Enregistre les 6 zones ensemble sous un seul code PD.
        </p>
        {message ? <p className="mt-1 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {errorMessage ? <p className="mt-1 text-sm font-semibold text-red-700">{errorMessage}</p> : null}
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-60"
      >
        {isPending ? "Enregistrement..." : "Save"}
      </button>
    </div>
  );
}
