"use client";

import { useState } from "react";

const NOUVELLE_VALEUR = "__nouvelle_valeur__";

// Menu deroulant avec une option "+ Nouveau ..." qui bascule vers un champ
// libre - le meme <input name="..."> porte la valeur choisie dans le menu
// OU tapee dans le champ libre, donc le formulaire parent n'a rien de plus
// a gerer. Extrait de app/production/machines/add-machine-form.tsx (2eme
// usage, voir app/production/heures-sup-manuel/) pour ne pas dupliquer cette
// logique non triviale.
export function SelectWithAddOption({
  name,
  options,
  addLabel,
  addPlaceholder,
  className,
}: {
  name: string;
  options: string[];
  addLabel: string;
  addPlaceholder: string;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [libre, setLibre] = useState(false);
  const inputClass = className ?? "rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none";

  if (libre) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
          placeholder={addPlaceholder}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => {
            setLibre(false);
            setValue("");
          }}
          className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <select
      name={name}
      value={value}
      onChange={(event) => {
        if (event.target.value === NOUVELLE_VALEUR) {
          setLibre(true);
          setValue("");
        } else {
          setValue(event.target.value);
        }
      }}
      className={inputClass}
    >
      <option value="">-</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      <option value={NOUVELLE_VALEUR}>{addLabel}</option>
    </select>
  );
}
