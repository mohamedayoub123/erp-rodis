"use client";

import { useMemo, useState } from "react";
import { addMachineProduitAction } from "../actions";

type ArticleOption = { id: number; label: string };

export function AddProduitForm({
  machineId,
  articles,
}: {
  machineId: number;
  articles: ArticleOption[];
}) {
  const [value, setValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<ArticleOption | null>(null);

  const filtered = useMemo(() => {
    const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return articles.slice(0, 50);

    return articles.filter((article) => {
      const label = article.label.toLowerCase();
      return words.every((word) => label.includes(word));
    });
  }, [value, articles]);

  return (
    <form
      action={addMachineProduitAction}
      className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-[1fr_auto_auto]"
    >
      <input type="hidden" name="machine_id" value={machineId} />
      <input type="hidden" name="article_id" value={selected?.id ?? ""} />

      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setShowDropdown(true);
            setSelected(null);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder="Ecris puis choisis un produit..."
          autoComplete="off"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />
        {showDropdown && filtered.length > 0 ? (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-[18rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
            {filtered.map((article) => (
              <button
                key={article.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setValue(article.label);
                  setSelected(article);
                  setShowDropdown(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
              >
                {article.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <input
        type="number"
        name="temps_minutes"
        placeholder="Temps (minutes)"
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
      />

      <button
        type="submit"
        disabled={!selected}
        className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        Ajouter
      </button>
    </form>
  );
}
