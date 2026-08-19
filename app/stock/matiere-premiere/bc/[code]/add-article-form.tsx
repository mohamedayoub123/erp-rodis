"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { matchesArticleSearch } from "@/lib/article-search";
import { addArticleToCommandeBcAction } from "../actions";

export function AddArticleForm({ code, articleOptions }: { code: string; articleOptions: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [articleInput, setArticleInput] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [quantite, setQuantite] = useState("");
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filteredArticles = useMemo(
    () => articleOptions.filter((option) => matchesArticleSearch(option, articleInput)),
    [articleInput, articleOptions]
  );

  function submit() {
    const qty = Number(quantite.replace(",", "."));

    if (!articleInput.trim() || !qty || qty <= 0) {
      setErrorMessage("Choisis un article et une quantite valide.");
      return;
    }

    setErrorMessage("");
    const formData = new FormData();
    formData.set("code", code);
    formData.set("article", articleInput.trim());
    formData.set("quantite", String(qty));
    formData.set("prix_unitaire", prixUnitaire.trim());

    startTransition(async () => {
      try {
        await addArticleToCommandeBcAction(formData);
        setArticleInput("");
        setQuantite("");
        setPrixUnitaire("");
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'ajout.");
      }
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
      <div className="relative">
        <input
          type="text"
          autoComplete="off"
          value={articleInput}
          onChange={(event) => {
            setArticleInput(event.target.value);
            setShowOptions(true);
          }}
          onFocus={() => setShowOptions(true)}
          onBlur={() => setTimeout(() => setShowOptions(false), 150)}
          placeholder="Ecrire un article..."
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />
        {showOptions && filteredArticles.length > 0 ? (
          <ul className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full min-w-[28rem] max-w-[90vw] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
            {filteredArticles.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setArticleInput(option);
                    setShowOptions(false);
                  }}
                  className="block w-full whitespace-normal px-4 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <input
        type="number"
        step="0.01"
        min="0"
        value={quantite}
        onChange={(event) => setQuantite(event.target.value)}
        placeholder="Quantite"
        className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />
      <input
        type="number"
        step="0.01"
        min="0"
        value={prixUnitaire}
        onChange={(event) => setPrixUnitaire(event.target.value)}
        placeholder="Prix unitaire"
        className="w-36 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Ajout..." : "Ajouter article"}
      </button>
      {errorMessage ? <p className="text-xs font-semibold text-red-700 sm:col-span-4">{errorMessage}</p> : null}
    </div>
  );
}
