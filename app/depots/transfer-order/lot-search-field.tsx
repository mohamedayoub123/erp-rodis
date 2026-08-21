"use client";

import { useMemo, useState } from "react";

// Meme motif que SearchableFilterInput (app/_components/searchable-filter-input.tsx)
// mais pour choisir un NUMERO DE LOT : contrairement a un article, la
// quantite disponible doit rester visible dans le menu pour aider au choix,
// sans jamais faire partie de la valeur tapee/soumise (juste le numero de
// lot lui-meme, texte libre repris tel quel a la frappe).
export function LotSearchField({
  name,
  defaultValue,
  lots,
  onChange,
  disabled,
}: {
  name: string;
  defaultValue: string;
  lots: { numeroLot: string; solde: number }[];
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return lots.slice(0, 50);
    return lots.filter((lot) => lot.numeroLot.toLowerCase().includes(query));
  }, [value, lots]);

  function selectLot(numeroLot: string) {
    setValue(numeroLot);
    setShowDropdown(false);
    onChange?.(numeroLot);
  }

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
          setShowDropdown(true);
          onChange?.(event.target.value);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="Ecrire ou choisir un lot..."
        className="w-56 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
      />
      {!disabled && showDropdown && filtered.length > 0 ? (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[16rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {filtered.map((lot) => (
            <button
              key={lot.numeroLot}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectLot(lot.numeroLot)}
              className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
            >
              {lot.numeroLot || "(sans numero)"} - disponible : {lot.solde.toLocaleString("fr-FR")}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
