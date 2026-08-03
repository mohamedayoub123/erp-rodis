"use client";

import { useEffect, useState, useTransition } from "react";
import { updateArticleCodesAction } from "./actions";

export function CodeCell({
  articleId,
  field,
  initialValue,
  placeholder,
}: {
  articleId: number;
  field: "code_auto" | "code_manu";
  initialValue: string;
  placeholder: string;
}) {
  const [savedValue, setSavedValue] = useState(initialValue);
  const [inputValue, setInputValue] = useState("");

  // useState(initialValue) ne lit la prop qu'au tout premier rendu - sans
  // ca, quand le serveur renvoie une valeur fraiche (apres Save dans
  // Programme par ligne + Refresh), la case n'affichait jamais la mise a
  // jour tant que la page n'etait pas rechargee completement (F5).
  useEffect(() => {
    setSavedValue(initialValue);
  }, [initialValue]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setErrorMessage("");

    const formData = new FormData();
    formData.set("article_id", String(articleId));
    formData.set(field, trimmed);

    startTransition(async () => {
      try {
        await updateArticleCodesAction(formData);
        setSavedValue(trimmed);
        setInputValue("");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {savedValue || "-"}
        </span>
        <input
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder={placeholder}
          className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending ? "..." : "Enregistrer"}
        </button>
      </div>
      {errorMessage ? <p className="text-xs font-semibold text-red-600">{errorMessage}</p> : null}
    </div>
  );
}
