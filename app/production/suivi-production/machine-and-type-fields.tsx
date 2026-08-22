"use client";

import { useState } from "react";
import { MachineSelectField } from "./machine-select-field";
import { TYPE_PRODUIT_OPTIONS } from "../machines/type-produit-options";

const inputClass =
  "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none";

// Regroupe Machine + Type ensemble (contrairement a MachineSelectField seul)
// pour que choisir une machine remplisse automatiquement son Type - utilise
// depuis une page Server Component qui ne peut pas partager du state entre
// 2 champs freres sans un composant client commun.
export function MachineAndTypeFields({
  machines,
  defaultMachine = "",
  defaultType = "",
}: {
  machines: { nom: string; typeProduit: string[] }[];
  defaultMachine?: string;
  defaultType?: string;
}) {
  const [typeFabrication, setTypeFabrication] = useState(defaultType);

  return (
    <>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Machine
        <MachineSelectField
          name="machine"
          defaultValue={defaultMachine}
          machines={machines}
          onMachineChange={(typeProduit) => setTypeFabrication(typeProduit[0] || "")}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">
        Type
        <select
          name="type_fabrication"
          value={typeFabrication}
          onChange={(event) => setTypeFabrication(event.target.value)}
          required
          className={inputClass}
        >
          <option value="">-</option>
          {TYPE_PRODUIT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
