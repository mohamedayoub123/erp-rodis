"use client";

import { useState } from "react";

// Calculette a double sens (demande explicite) : soit je choisis en combien
// de jours je veux tout finir et ca me dit combien de lots faire par jour,
// soit je choisis combien de lots je peux faire par jour et ca me dit en
// combien de jours c'est fini - toujours base sur le total PF (pas sur un
// perimetre categorie/gamme), les 2 champs restent toujours coherents entre
// eux (modifier l'un recalcule l'autre).
export function DureeCalculator({ totalLots }: { totalLots: number }) {
  const [jours, setJours] = useState("");
  const [parJour, setParJour] = useState("");

  function handleJoursChange(value: string) {
    setJours(value);
    const n = Number(value);
    if (value.trim() && Number.isFinite(n) && n > 0) {
      setParJour(String(Math.ceil(totalLots / n)));
    } else {
      setParJour("");
    }
  }

  function handleParJourChange(value: string) {
    setParJour(value);
    const n = Number(value);
    if (value.trim() && Number.isFinite(n) && n > 0) {
      setJours(String(Math.ceil(totalLots / n)));
    } else {
      setJours("");
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <h2 className="text-lg font-bold text-slate-900">Sur combien de temps etaler l&apos;inventaire ?</h2>
      <p className="mt-1 text-sm text-slate-600">
        Base sur les {totalLots} lot(s) au total en stock actuellement (tout le PF). Remplis l&apos;un des 2 champs,
        l&apos;autre se calcule tout seul.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Nombre de jours pour tout finir
          <input
            type="number"
            min={1}
            value={jours}
            onChange={(event) => handleJoursChange(event.target.value)}
            placeholder="ex: 30"
            className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <span className="pb-2 text-sm font-semibold text-slate-400">ou</span>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Lots comptes par jour
          <input
            type="number"
            min={1}
            value={parJour}
            onChange={(event) => handleParJourChange(event.target.value)}
            placeholder="ex: 50"
            className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      {jours && parJour ? (
        <p className="mt-4 text-sm font-semibold text-sky-800">
          A {parJour} lot(s) par jour, tout le PF ({totalLots} lots) est compte en {jours} jour(s).
        </p>
      ) : null}
    </section>
  );
}
