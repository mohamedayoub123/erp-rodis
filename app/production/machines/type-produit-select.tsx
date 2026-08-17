"use client";

import { useRef } from "react";
import { updateMachineAction } from "./actions";
import { TYPE_PRODUIT_OPTIONS } from "./type-produit-options";

// Selection auto-enregistree (pas de bouton Save separe) - la machine
// (nom/zone/type) est deja connue, seul le type de produit change ici.
export function MachineTypeProduitSelect({
  machine,
}: {
  machine: { id: number; nom: string; zone: string | null; type: string | null; type_produit: string | null };
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateMachineAction}>
      <input type="hidden" name="id" value={machine.id} />
      <input type="hidden" name="nom" value={machine.nom} />
      <input type="hidden" name="zone" value={machine.zone ?? ""} />
      <input type="hidden" name="type" value={machine.type ?? ""} />
      <select
        name="type_produit"
        defaultValue={machine.type_produit ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
      >
        <option value="">-</option>
        {TYPE_PRODUIT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </form>
  );
}
