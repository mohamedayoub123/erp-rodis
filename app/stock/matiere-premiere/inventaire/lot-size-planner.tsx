"use client";

import { useState } from "react";

const TAILLE_LOT_MAX = 200;

// Champ "Nombre de lots a la fois" du formulaire de demarrage, couple a un
// second champ "Nombre de jours pour tout finir" (demande explicite, meme
// fonctionnement que cote PF) : remplir l'un recalcule l'autre a partir du
// total de lots en stock. Le champ soumis au formulaire (name="taille_lot")
// reste celui de gauche, que sa valeur vienne d'une saisie directe ou d'un
// calcul via le nombre de jours.
export function LotSizePlanner({ totalLots }: { totalLots: number }) {
  const [tailleLot, setTailleLot] = useState("20");
  const [jours, setJours] = useState("");
  const [clampNotice, setClampNotice] = useState(false);

  function handleTailleLotChange(value: string) {
    setTailleLot(value);
    setClampNotice(false);
    const n = Number(value);
    setJours(value.trim() && Number.isFinite(n) && n > 0 ? String(Math.ceil(totalLots / n)) : "");
  }

  function handleJoursChange(value: string) {
    setJours(value);
    const n = Number(value);
    if (value.trim() && Number.isFinite(n) && n > 0) {
      const parJour = Math.ceil(totalLots / n);
      setTailleLot(String(Math.min(parJour, TAILLE_LOT_MAX)));
      setClampNotice(parJour > TAILLE_LOT_MAX);
    } else {
      setClampNotice(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Nombre de lots a la fois
          <input
            type="number"
            name="taille_lot"
            min={1}
            max={TAILLE_LOT_MAX}
            value={tailleLot}
            onChange={(event) => handleTailleLotChange(event.target.value)}
            required
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <span className="pb-2 text-sm font-semibold text-slate-400">ou choisis</span>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Nombre de jours pour tout finir ({totalLots} lots au total)
          <input
            type="number"
            min={1}
            value={jours}
            onChange={(event) => handleJoursChange(event.target.value)}
            placeholder="ex: 90"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      {clampNotice ? (
        <p className="mt-2 text-xs font-semibold text-amber-700">
          Limite a {TAILLE_LOT_MAX} lots a la fois par lot de travail - ramene automatiquement a {TAILLE_LOT_MAX}.
        </p>
      ) : null}
    </div>
  );
}
