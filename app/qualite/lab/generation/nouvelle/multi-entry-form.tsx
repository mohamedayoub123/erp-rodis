"use client";

import { useId, useState, useTransition } from "react";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { createLabCodeGenerationAction } from "../actions";

type Row = {
  key: string;
  articleId: number | null;
  produit: string;
  nbCode: string;
  type: "auto" | "manuel";
};

function emptyRow(key: string): Row {
  return { key, articleId: null, produit: "", nbCode: "1", type: "auto" };
}

const inputClass = "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none";

export function MultiArticleGenerationForm({
  articles,
}: {
  articles: { id: number; label: string }[];
}) {
  const idPrefix = useId();
  const [nextKey, setNextKey] = useState(1);
  const [rows, setRows] = useState<Row[]>([emptyRow(`${idPrefix}-0`)]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(`${idPrefix}-${nextKey}`)]);
    setNextKey((value) => value + 1);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const invalidRow = rows.find((row) => !row.articleId || !Number(row.nbCode) || Number(row.nbCode) <= 0);
    if (invalidRow) {
      setErrorMessage("Chaque ligne doit avoir un article choisi dans la liste et un nombre de code valide.");
      return;
    }

    const formData = new FormData();
    formData.set(
      "lignes",
      JSON.stringify(
        rows.map((row) => ({
          article_id: row.articleId,
          nb_code: row.nbCode,
          type: row.type,
        }))
      )
    );

    startTransition(async () => {
      try {
        await createLabCodeGenerationAction(formData);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-4">
        {rows.map((row, index) => (
          <div
            key={row.key}
            className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
          >
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Article
              <ProduitPickerField
                articles={articles}
                defaultValue={row.produit}
                defaultArticleId={row.articleId}
                hiddenName={`_article_id_${index}`}
                textName={`_produit_${index}`}
                onSelect={(articleId, label) => updateRow(row.key, { articleId, produit: label || "" })}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Nombre de code
              <input
                type="number"
                step="1"
                min="1"
                value={row.nbCode}
                onChange={(event) => updateRow(row.key, { nbCode: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Type
              <select
                value={row.type}
                onChange={(event) => updateRow(row.key, { type: event.target.value as "auto" | "manuel" })}
                className={inputClass}
              >
                <option value="auto">Auto</option>
                <option value="manuel">Manuel</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              disabled={rows.length <= 1}
              className="rounded-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-40"
            >
              Retirer
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="justify-self-start rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700"
      >
        + Ajouter un article
      </button>

      {errorMessage ? <p className="text-sm font-semibold text-red-600">{errorMessage}</p> : null}

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
        >
          {isPending ? "Enregistrement..." : "Save"}
        </button>
      </div>
    </form>
  );
}
