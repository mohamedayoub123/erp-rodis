"use client";

import { useState } from "react";
import { createMachineAction } from "./actions";
import { SubmitButton } from "@/app/_components/submit-button";
import { TYPE_PRODUIT_OPTIONS } from "./type-produit-options";

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
const NOUVELLE_ZONE = "__nouvelle_zone__";
const TYPE_OPTIONS = ["Fabrication", "Conditionnement", "Emballage"];

export function AddMachineForm() {
  const [zone, setZone] = useState("");
  const [zoneLibre, setZoneLibre] = useState(false);

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
        {zoneLibre ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              name="zone"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              autoFocus
              placeholder="Nom de la nouvelle zone"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setZoneLibre(false);
                setZone("");
              }}
              className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              Annuler
            </button>
          </div>
        ) : (
          <select
            name="zone"
            value={zone}
            onChange={(event) => {
              if (event.target.value === NOUVELLE_ZONE) {
                setZoneLibre(true);
                setZone("");
              } else {
                setZone(event.target.value);
              }
            }}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          >
            <option value="">-</option>
            {ZONE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={NOUVELLE_ZONE}>+ Nouvelle zone</option>
          </select>
        )}
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Type
        <select
          name="type"
          defaultValue=""
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
      <div className="grid gap-1 text-xs font-semibold text-slate-500">
        Type(s) de produit
        <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 px-4 py-3">
          {TYPE_PRODUIT_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-1.5 text-sm font-normal text-slate-700">
              <input type="checkbox" name="type_produit" value={option} />
              {option}
            </label>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <SubmitButton pendingLabel="Ajout..." className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white">
          Ajouter
        </SubmitButton>
      </div>
    </form>
  );
}
