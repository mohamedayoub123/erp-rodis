"use client";

import { useId, useMemo, useState } from "react";
import { matchesArticleSearch } from "@/lib/article-search";

type SearchableOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  name: string;
  options: SearchableOption[];
  placeholder: string;
  required?: boolean;
  emptyLabel?: string;
};

export function SearchableSelect({
  name,
  options,
  placeholder,
  required = false,
  emptyLabel = "Ecris pour chercher puis choisis un resultat",
}: SearchableSelectProps) {
  const listId = useId();
  const [inputValue, setInputValue] = useState("");

  const selectedOption = useMemo(
    () => options.find((option) => option.label === inputValue) ?? null,
    [inputValue, options]
  );

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();

    if (!query) {
      return options.slice(0, 40);
    }

    return options
      .filter((option) => matchesArticleSearch(option.label, query))
      .slice(0, 40);
  }, [inputValue, options]);

  return (
    <div className="grid gap-2">
      <input
        type="hidden"
        name={name}
        value={selectedOption?.value ?? ""}
        required={required}
      />

      <input
        list={listId}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        placeholder={placeholder}
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none"
        autoComplete="off"
      />

      <datalist id={listId}>
        {filteredOptions.map((option) => (
          <option key={option.value} value={option.label} />
        ))}
      </datalist>

      <p className="text-xs text-slate-500">
        {selectedOption
          ? "Choix valide selectionne."
          : inputValue
            ? "Choisis une proposition de la liste pour valider."
            : emptyLabel}
      </p>
    </div>
  );
}
