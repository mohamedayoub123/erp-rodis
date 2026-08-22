"use client";

import { useMemo, useState } from "react";

const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MOIS_NOMS[(month || 1) - 1]} ${year}`;
}

// Replie dans un <details> + filtre texte en direct - une liste plate de
// cases a cocher devient illisible/prend toute la page des que l'historique
// couvre plusieurs annees (potentiellement des dizaines de mois).
export function MonthPicker({ availableMonths, selectedMonths }: { availableMonths: string[]; selectedMonths: string[] }) {
  const [filtre, setFiltre] = useState("");

  const moisVisibles = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    if (!q) return availableMonths;
    return availableMonths.filter((m) => monthLabel(m).toLowerCase().includes(q));
  }, [availableMonths, filtre]);

  return (
    <details open={selectedMonths.length > 0}>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
        Ou choisis un ou plusieurs mois precis (remplace Du/Au)
        {selectedMonths.length > 0 ? ` - ${selectedMonths.length} selectionne${selectedMonths.length > 1 ? "s" : ""}` : ""}
      </summary>
      <div className="mt-3 space-y-3">
        <input
          type="text"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder="Ecris un mois pour filtrer la liste (ex: aout)..."
          className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-normal text-slate-900 outline-none"
        />
        <div className="flex max-h-48 flex-wrap gap-3 overflow-y-auto">
          {moisVisibles.map((month) => (
            <label
              key={month}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                name="months"
                value={month}
                defaultChecked={selectedMonths.includes(month)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {monthLabel(month)}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
