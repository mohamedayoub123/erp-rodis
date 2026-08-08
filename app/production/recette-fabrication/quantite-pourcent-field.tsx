"use client";

import { useState } from "react";

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Paire Quantite/% reliee a un total fixe (quantite_recette_base) : changer
// l'un recalcule l'autre. Seule la quantite part au serveur (name donne par
// quantiteName), le % n'est qu'une aide de saisie cote client.
export function QuantitePourcentField({
  total,
  quantiteName,
  defaultQuantite,
}: {
  total: number;
  quantiteName: string;
  defaultQuantite?: number;
}) {
  const [quantite, setQuantite] = useState(
    defaultQuantite !== undefined && defaultQuantite !== null ? String(defaultQuantite) : ""
  );
  const [pourcent, setPourcent] = useState(
    total > 0 && defaultQuantite ? String(round((defaultQuantite / total) * 100, 2)) : ""
  );

  function handleQuantite(raw: string) {
    setQuantite(raw);
    const q = Number(raw);
    setPourcent(total > 0 && raw && !Number.isNaN(q) ? String(round((q / total) * 100, 2)) : "");
  }

  function handlePourcent(raw: string) {
    setPourcent(raw);
    const p = Number(raw);
    setQuantite(total > 0 && raw && !Number.isNaN(p) ? String(round((p / 100) * total, 3)) : "");
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        step="0.001"
        min="0"
        name={quantiteName}
        value={quantite}
        onChange={(event) => handleQuantite(event.target.value)}
        placeholder="Quantite"
        required
        className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
      />
      <input
        type="number"
        step="0.01"
        min="0"
        max="100"
        value={pourcent}
        onChange={(event) => handlePourcent(event.target.value)}
        placeholder="%"
        disabled={total <= 0}
        title={total <= 0 ? "Renseigne d'abord la quantite totale du lot" : undefined}
        className="w-20 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
      />
    </div>
  );
}
