"use client";

import { useState, useTransition } from "react";
import { saveProgrammeDispatchByGroupAction } from "./actions";

export function DispatchSaveButton({ numeroProgramme }: { numeroProgramme: number }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function handleSave() {
    setMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.set("numero_programme", String(numeroProgramme));

    startTransition(async () => {
      try {
        const result = await saveProgrammeDispatchByGroupAction(formData);
        setMessage(`Enregistre sous le code ${result.code}.`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <div className="no-print flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-900">Enregistrer ce programme</p>
        <p className="text-xs text-slate-500">
          Confirme les lignes de ce programme et fige un code PD dans l&apos;historique.
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
