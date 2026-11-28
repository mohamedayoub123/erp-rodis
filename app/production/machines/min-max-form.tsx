"use client";

import { useActionState, useState } from "react";
import { updateMachineMinMaxAction } from "./actions";

const texte = (valeur: number | null) => (valeur === null || valeur === undefined ? "" : String(valeur));

// Min et Max (kg de vrac d'un batch) d'une machine de Fabrication, utilise dans la liste des equipements et sur la
// page d'une machine. Les champs sont controles : un enregistrement refuse garde ce qui est ecrit.
export function MachineMinMaxForm({
  machineId,
  machineNom,
  min,
  max,
}: {
  machineId: number;
  machineNom: string;
  min: number | null;
  max: number | null;
}) {
  const [etat, action, enCours] = useActionState(updateMachineMinMaxAction, { ok: true, message: "" });
  const base = `${texte(min)}|${texte(max)}`;
  const [saisie, setSaisie] = useState({ base, min: texte(min), max: texte(max) });
  // Les valeurs enregistrees ont change (ici ou depuis une machine identique) : les champs les reprennent
  if (saisie.base !== base) setSaisie({ base, min: texte(min), max: texte(max) });
  const modifie = saisie.min !== texte(min) || saisie.max !== texte(max);

  const champ = (nom: "min" | "max", libelle: string) => (
    <label className="flex items-center gap-1 text-xs font-semibold text-slate-500">
      {libelle}
      <input
        type="text"
        inputMode="decimal"
        name={nom === "min" ? "capacite_min" : "capacite_max"}
        value={saisie[nom]}
        onChange={(event) => {
          const valeur = event.target.value;
          setSaisie((courant) => ({ ...courant, [nom]: valeur }));
        }}
        placeholder="kg"
        aria-label={`${libelle} en kg de ${machineNom}`}
        className="w-20 rounded border border-slate-200 px-1.5 py-1 text-sm font-normal text-slate-700 focus:border-sky-400 focus:outline-none"
      />
    </label>
  );

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="id" value={machineId} />
      <div className="flex items-center gap-2">
        {champ("min", "Min")}
        {champ("max", "Max")}
        <button
          type="submit"
          disabled={enCours}
          className={`rounded px-2 py-1 text-xs font-semibold disabled:opacity-60 ${
            modifie ? "bg-sky-700 text-white hover:bg-sky-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {enCours ? "..." : "OK"}
        </button>
      </div>
      {etat.message && !(etat.ok && modifie) ? (
        <p className={`text-xs font-semibold ${etat.ok ? "text-emerald-700" : "text-red-700"}`}>{etat.message}</p>
      ) : null}
    </form>
  );
}
