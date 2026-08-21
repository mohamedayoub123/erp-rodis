"use client";

import { useState } from "react";
import { createMachineAction } from "./actions";
import { SubmitButton } from "@/app/_components/submit-button";

const NOUVELLE_VALEUR = "__nouvelle_valeur__";

// Menu deroulant avec une option "+ Nouveau ..." qui bascule vers un champ
// libre - le meme <input name="..."> porte la valeur choisie dans le menu
// OU tapee dans le champ libre, donc le formulaire parent n'a rien de plus
// a gerer.
function SelectWithAddOption({
  name,
  options,
  addLabel,
  addPlaceholder,
}: {
  name: string;
  options: string[];
  addLabel: string;
  addPlaceholder: string;
}) {
  const [value, setValue] = useState("");
  const [libre, setLibre] = useState(false);

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
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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
      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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

export function AddMachineForm({
  existingZones,
  existingTypes,
  typeProduitOptions,
  energieOptions,
}: {
  existingZones: string[];
  existingTypes: string[];
  typeProduitOptions: string[];
  energieOptions: { id: number; label: string }[];
}) {
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
        <SelectWithAddOption
          name="zone"
          options={existingZones}
          addLabel="+ Nouvelle zone"
          addPlaceholder="Nom de la nouvelle zone"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Type
        <SelectWithAddOption
          name="type"
          options={existingTypes}
          addLabel="+ Nouveau type"
          addPlaceholder="Nom du nouveau type"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Consommation electrique (kW)
        <input
          type="number"
          step="0.01"
          name="consommation_electrique_kw"
          placeholder="0"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Machine Energie (si alimentee par une source partagee)
        <select
          name="energie_machine_id"
          defaultValue=""
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
        >
          <option value="">-</option>
          {energieOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-1 text-xs font-semibold text-slate-500">
        Type(s) de produit
        <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 px-4 py-3">
          {typeProduitOptions.map((option) => (
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
