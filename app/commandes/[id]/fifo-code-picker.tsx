"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";

export type CodeOption = {
  code: string;
  quantite: number;
  dateFabrication: string | null;
};

// Remplace la saisie libre du code (numero de lot) par un menu qui ne
// propose que les codes ayant reellement du stock (> 0) pour cet article -
// stock_override_fifo_result rejette de toute facon un code inconnu ou a
// stock epuise, autant ne jamais pouvoir en choisir un ici. La date de
// fabrication s'affiche en dessous des le choix du code (elle sera de
// toute facon recalculee cote serveur a partir du meme lot au Save).
export function FifoCodePicker({
  fieldName,
  defaultCode,
  codes,
}: {
  fieldName: string;
  defaultCode: string;
  codes: CodeOption[];
}) {
  const [selected, setSelected] = useState(defaultCode);

  const selectedOption = useMemo(
    () => codes.find((option) => option.code.toUpperCase() === selected.toUpperCase()),
    [codes, selected]
  );

  const defaultCodeKnown = codes.some(
    (option) => option.code.toUpperCase() === defaultCode.toUpperCase()
  );

  return (
    <div className="grid gap-1">
      <select
        name={fieldName}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="w-full max-w-[160px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
      >
        {!defaultCodeKnown && defaultCode ? (
          <option value={defaultCode}>{defaultCode} (stock epuise)</option>
        ) : null}
        {codes.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code} ({option.quantite})
          </option>
        ))}
      </select>
      <span className="text-xs text-slate-500">
        Date fab. : {selectedOption ? formatDate(selectedOption.dateFabrication) : "-"}
      </span>
    </div>
  );
}
