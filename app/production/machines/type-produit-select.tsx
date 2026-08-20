"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateMachineAction } from "./actions";

// Petit indicateur "Enregistre" affiche juste apres la fin d'une
// soumission (transition pending true -> false) - doit etre un enfant du
// <form> pour lire son etat via useFormStatus().
function SavedIndicator() {
  const { pending } = useFormStatus();
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setJustSaved(true);
      const timeout = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(timeout);
    }
    wasPending.current = pending;
  }, [pending]);

  if (pending) return <span className="text-xs text-slate-400">Enregistrement...</span>;
  if (justSaved) return <span className="text-xs font-semibold text-emerald-600">✓ Enregistre</span>;
  return null;
}

// Plusieurs types possibles par machine (checkboxes dans un <details>,
// auto-enregistre a chaque coche/decoche - pas de bouton Save separe). Le
// reste de la machine (nom/zone/type) est deja connu, seul le(s) type(s)
// de produit changent ici.
export function MachineTypeProduitSelect({
  machine,
  typeProduitOptions,
}: {
  machine: {
    id: number;
    nom: string;
    zone: string | null;
    type: string | null;
    type_produit: string[] | null;
    consommation_electrique_kw: number | null;
  };
  typeProduitOptions: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const selected = machine.type_produit ?? [];

  return (
    <form ref={formRef} action={updateMachineAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={machine.id} />
      <input type="hidden" name="nom" value={machine.nom} />
      <input type="hidden" name="zone" value={machine.zone ?? ""} />
      <input type="hidden" name="type" value={machine.type ?? ""} />
      <input type="hidden" name="consommation_electrique_kw" value={machine.consommation_electrique_kw ?? ""} />
      <details className="relative">
        <summary className="min-w-[8rem] cursor-pointer list-none rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 marker:content-none">
          {selected.length > 0 ? selected.join(", ") : "-"}
        </summary>
        <div className="absolute left-0 top-full z-20 mt-1 grid w-48 gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {typeProduitOptions.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="type_produit"
                value={option}
                defaultChecked={selected.includes(option)}
                onChange={() => formRef.current?.requestSubmit()}
              />
              {option}
            </label>
          ))}
        </div>
      </details>
      <SavedIndicator />
    </form>
  );
}
