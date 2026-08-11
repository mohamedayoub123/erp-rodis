"use client";

import { useId, useMemo } from "react";
import { formatDate } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";

export type CodeOption = {
  code: string;
  quantite: number;
  dateFabrication: string | null;
};

// Saisie libre + suggestions (au lieu d'un <select> a faire defiler) pour
// pouvoir taper une partie du code au milieu d'une longue liste - meme
// principe que SearchableSelect. Ne propose que les codes ayant reellement
// du stock disponible (deja filtre en amont, cote serveur) :
// stock_override_fifo_result rejette de toute facon un code inconnu ou a
// stock epuise, autant ne jamais pouvoir en choisir un ici.
export function FifoCodePicker({
  value,
  onChange,
  codes,
}: {
  value: string;
  onChange: (value: string) => void;
  codes: CodeOption[];
}) {
  const listId = useId();

  const selectedOption = useMemo(
    () => codes.find((option) => option.code.toUpperCase() === value.trim().toUpperCase()) ?? null,
    [codes, value]
  );

  const filteredOptions = useMemo(() => {
    const query = value.trim();
    if (!query) return codes;
    return codes.filter((option) => matchesArticleSearch(option.code, query));
  }, [value, codes]);

  return (
    <div className="grid gap-1">
      <input
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Taper le code..."
        autoComplete="off"
        className="w-full max-w-[160px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
      />
      <datalist id={listId}>
        {filteredOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {`${option.quantite} disponible`}
          </option>
        ))}
      </datalist>
      <span className="text-xs text-slate-500">
        {selectedOption
          ? `${selectedOption.quantite} dispo - Date fab. : ${formatDate(selectedOption.dateFabrication)}`
          : "Code inconnu ou stock epuise."}
      </span>
    </div>
  );
}
