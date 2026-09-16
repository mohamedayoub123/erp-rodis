"use client";

import { useEffect, useState, useTransition } from "react";
import { updateArticleLabCodeAction } from "./actions";

export function LabCodeCell({
  articleId,
  field,
  initialValue,
  placeholder,
  canOverwriteWhenFilled,
}: {
  articleId: number;
  field: "lab_code_auto" | "lab_code_manu";
  initialValue: string;
  placeholder: string;
  // Deja rempli et cet utilisateur n'a pas le droit de le changer - montre
  // seulement la valeur (jamais un input qui echouerait de toute facon a
  // l'enregistrement, l'action re-verifie la meme regle cote serveur).
  canOverwriteWhenFilled: boolean;
}) {
  const [savedValue, setSavedValue] = useState(initialValue);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    setSavedValue(initialValue);
  }, [initialValue]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const locked = Boolean(savedValue) && !canOverwriteWhenFilled;

  function handleSave() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setErrorMessage("");

    const formData = new FormData();
    formData.set("article_id", String(articleId));
    formData.set("field", field);
    formData.set("value", trimmed);

    startTransition(async () => {
      try {
        await updateArticleLabCodeAction(formData);
        setSavedValue(trimmed);
        setInputValue("");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  if (locked) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {savedValue}
        </span>
        <span className="text-xs text-slate-400" title="Deja rempli - seul un utilisateur autorise peut le changer">
          🔒
        </span>
      </div>
    );
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
