"use client";

import { useState } from "react";
import { createMachineAction } from "./actions";

const ZONE_OPTIONS = [
  "B1Z1",
  "B1Z2",
  "B4Z1",
  "B4Z2",
  "B4Z3",
  "D",
  "Automatique",
  "Semi auto",
  "Manuel",
];
const TYPE_OPTIONS = ["Fabrication", "Conditionnement", "Emballage"];

export function AddMachineForm() {
  const [type, setType] = useState("");

  // Conditionnement se mesure en piece/min (cadence de la ligne) - les
  // autres types n'ont pas d'unite fixe, capacite reste un nombre libre.
  const capaciteLabel = type === "Conditionnement" ? "Capacite (piece/min)" : "Capacite";
  // Une machine de Fabrication n'a pas de min/max viable a saisir (c'est le
  // vrac produit qui varie, pas la machine elle-meme) - masque ces 2 champs
  // plutot que de les laisser inutilement remplis.
  const showMinMax = type !== "Fabrication";

  return (
    <form
      action={createMachineAction}
      className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Nom
        <input
          type="text"
          name="nom"
          required
          placeholder="Nom de la machine"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Zone
        <select
          name="zone"
          defaultValue=""
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        >
          <option value="">-</option>
          {ZONE_OPTIONS.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Type
        <select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        >
          <option value="">-</option>
          {TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        {capaciteLabel}
        <input
          type="number"
          name="capacite"
          placeholder="Ex: 3000"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />
      </label>
      {showMinMax ? (
        <>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Min
            <input
              type="number"
              name="capacite_min"
              placeholder="Ex: 500"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Max
            <input
              type="number"
              name="capacite_max"
              placeholder="Ex: 3000"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
          </label>
        </>
      ) : null}
      <div className="sm:col-span-2 lg:col-span-3">
        <button type="submit" className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white">
          Ajouter
        </button>
      </div>
    </form>
  );
}
