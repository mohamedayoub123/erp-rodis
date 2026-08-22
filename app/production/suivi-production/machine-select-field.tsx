"use client";

import { useState } from "react";

// Limite le choix aux vraies machines (Fabrication/Conditionnement/
// Embalage) deja enregistrees dans /production/machines, au lieu d'un
// texte libre ou n'importe quoi pouvait etre tape - affiche en dessous le
// type de produit associe a la machine choisie, pour verification visuelle
// immediate, sans jamais faire partie de la valeur soumise (juste le nom
// de la machine).
export function MachineSelectField({
  name,
  defaultValue,
  machines,
  onMachineChange,
}: {
  name: string;
  defaultValue: string;
  machines: { nom: string; typeProduit: string[] }[];
  // Optionnel : previent un parent (ex: le "Type" du formulaire Fabrication)
  // du type de produit de la machine choisie, pour un remplissage
  // automatique - jamais appele au premier rendu (uniquement sur un vrai
  // changement de machine), pour ne jamais ecraser un Type deja enregistre
  // en rouvrant une fiche existante.
  onMachineChange?: (typeProduit: string[]) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const selected = machines.find((m) => m.nom === value);

  return (
    <div className="grid gap-1">
      <select
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          const machine = machines.find((m) => m.nom === event.target.value);
          onMachineChange?.(machine?.typeProduit ?? []);
        }}
        required
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
      >
        <option value="" disabled>
          Choisir une machine...
        </option>
        {machines.map((m) => (
          <option key={m.nom} value={m.nom}>
            {m.nom}
          </option>
        ))}
      </select>
      {selected ? (
        <span className="text-xs text-slate-500">Type : {selected.typeProduit.join(", ") || "-"}</span>
      ) : null}
    </div>
  );
}
