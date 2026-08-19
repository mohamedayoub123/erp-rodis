"use client";

import { useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/app/_components/submit-button";
import { updateMachineAction } from "./actions";

type Machine = { id: number; nom: string; zone: string | null; type: string | null; type_produit: string[] | null };

// Champs caches communs pour ne PAS ecraser les autres colonnes de la
// machine quand on enregistre juste le nom OU juste la zone -
// updateMachineAction remplace toujours les 4 champs (pas de patch
// partiel cote base), donc chaque petit formulaire doit renvoyer les
// valeurs actuelles de tout ce qu'il ne modifie pas lui-meme.
function HiddenMachineFields({ machine, excludeNom, excludeZone }: { machine: Machine; excludeNom?: boolean; excludeZone?: boolean }) {
  return (
    <>
      <input type="hidden" name="id" value={machine.id} />
      {excludeNom ? null : <input type="hidden" name="nom" value={machine.nom} />}
      {excludeZone ? null : <input type="hidden" name="zone" value={machine.zone ?? ""} />}
      <input type="hidden" name="type" value={machine.type ?? ""} />
      {(machine.type_produit ?? []).map((tp) => (
        <input key={tp} type="hidden" name="type_produit" value={tp} />
      ))}
    </>
  );
}

// Le nom sert aussi de lien vers la fiche machine - un clic sur "modifier"
// bascule vers un champ texte a part pour ne pas gener la navigation.
export function MachineNomCell({ machine, canEdit }: { machine: Machine; canEdit: boolean }) {
  const [isEditing, setIsEditing] = useState(false);

  if (!canEdit) {
    return (
      <Link href={`/production/machines/${machine.id}`} className="text-sky-700 underline">
        {machine.nom}
      </Link>
    );
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Link href={`/production/machines/${machine.id}`} className="text-sky-700 underline">
          {machine.nom}
        </Link>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <form action={updateMachineAction} className="flex items-center gap-1" onSubmit={() => setIsEditing(false)}>
      <HiddenMachineFields machine={machine} excludeNom />
      <input
        type="text"
        name="nom"
        defaultValue={machine.nom}
        autoFocus
        className="w-32 rounded border border-slate-200 px-1.5 py-1 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
      />
      <SubmitButton
        pendingLabel="..."
        className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
      >
        OK
      </SubmitButton>
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        className="rounded px-2 py-0.5 text-xs font-semibold text-slate-400 hover:text-slate-600"
      >
        Annuler
      </button>
    </form>
  );
}

export function MachineZoneCell({ machine, canEdit }: { machine: Machine; canEdit: boolean }) {
  if (!canEdit) return <>{machine.zone || "-"}</>;

  return (
    <form action={updateMachineAction} className="flex items-center gap-1">
      <HiddenMachineFields machine={machine} excludeZone />
      <input
        type="text"
        name="zone"
        defaultValue={machine.zone ?? ""}
        className="w-24 rounded border border-slate-200 px-1.5 py-1 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
      />
      <SubmitButton
        pendingLabel="..."
        className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
      >
        OK
      </SubmitButton>
    </form>
  );
}
