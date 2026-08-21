"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/app/_components/submit-button";
import { updateMachineAction } from "./actions";

type Machine = {
  id: number;
  nom: string;
  zone: string | null;
  type: string | null;
  type_produit: string[] | null;
  consommation_electrique_kw: number | null;
  consommation_gaz_litres_heure: number | null;
  consommation_gasoil_litres_heure: number | null;
  energie_machine_ids: number[] | null;
};

// Champs caches communs pour ne PAS ecraser les autres colonnes de la
// machine quand on enregistre juste le nom OU juste la zone -
// updateMachineAction remplace toujours les 8 champs (pas de patch
// partiel cote base), donc chaque petit formulaire doit renvoyer les
// valeurs actuelles de tout ce qu'il ne modifie pas lui-meme.
function HiddenMachineFields({
  machine,
  excludeNom,
  excludeZone,
  excludeConso,
  excludeConsoGaz,
  excludeConsoGasoil,
  excludeEnergie,
}: {
  machine: Machine;
  excludeNom?: boolean;
  excludeZone?: boolean;
  excludeConso?: boolean;
  excludeConsoGaz?: boolean;
  excludeConsoGasoil?: boolean;
  excludeEnergie?: boolean;
}) {
  return (
    <>
      <input type="hidden" name="id" value={machine.id} />
      {excludeNom ? null : <input type="hidden" name="nom" value={machine.nom} />}
      {excludeZone ? null : <input type="hidden" name="zone" value={machine.zone ?? ""} />}
      <input type="hidden" name="type" value={machine.type ?? ""} />
      {excludeConso ? null : (
        <input type="hidden" name="consommation_electrique_kw" value={machine.consommation_electrique_kw ?? ""} />
      )}
      {excludeConsoGaz ? null : (
        <input
          type="hidden"
          name="consommation_gaz_litres_heure"
          value={machine.consommation_gaz_litres_heure ?? ""}
        />
      )}
      {excludeConsoGasoil ? null : (
        <input
          type="hidden"
          name="consommation_gasoil_litres_heure"
          value={machine.consommation_gasoil_litres_heure ?? ""}
        />
      )}
      {excludeEnergie
        ? null
        : (machine.energie_machine_ids ?? []).map((id) => (
            <input key={id} type="hidden" name="energie_machine_ids" value={id} />
          ))}
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

// Quelle(s) machine(s) Energie (groupe electrogene...) alimentent cette
// machine - une machine peut en dependre de plusieurs a la fois (ex: un
// groupe electrogene general + un compresseur d'air dedie), d'ou des
// checkboxes plutot qu'un choix unique. N'a de sens que pour une machine
// qui n'est PAS elle-meme de type "Energie" (pas de chaine energie->energie).
// Le cout de chaque machine Energie citee ici se divise ensuite entre
// toutes les machines qui la citent, actives un jour donne (voir
// lib/cout-production-reel.ts).
export function MachineEnergieCell({
  machine,
  canEdit,
  energieOptions,
}: {
  machine: Machine;
  canEdit: boolean;
  energieOptions: { id: number; label: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const selectedIds = machine.energie_machine_ids ?? [];
  const selectedLabels = energieOptions.filter((option) => selectedIds.includes(option.id));

  if (machine.type === "Energie") return <span className="text-slate-400">-</span>;

  if (!canEdit) {
    return <>{selectedLabels.length > 0 ? selectedLabels.map((option) => option.label).join(", ") : "-"}</>;
  }

  return (
    <form ref={formRef} action={updateMachineAction}>
      <HiddenMachineFields machine={machine} excludeEnergie />
      <details className="relative">
        <summary className="min-w-[8rem] cursor-pointer list-none rounded border border-slate-200 px-2 py-1 text-sm text-slate-700 marker:content-none">
          {selectedLabels.length > 0 ? selectedLabels.map((option) => option.label).join(", ") : "-"}
        </summary>
        <div className="absolute left-0 top-full z-20 mt-1 grid w-56 gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {energieOptions.length === 0 ? (
            <p className="text-xs text-slate-400">Aucune machine Energie creee.</p>
          ) : (
            energieOptions.map((option) => (
              <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="energie_machine_ids"
                  value={option.id}
                  defaultChecked={selectedIds.includes(option.id)}
                  onChange={() => formRef.current?.requestSubmit()}
                />
                {option.label}
              </label>
            ))
          )}
        </div>
      </details>
    </form>
  );
}

export function MachineConsoCell({ machine, canEdit }: { machine: Machine; canEdit: boolean }) {
  if (!canEdit) return <>{machine.consommation_electrique_kw ?? "-"}</>;

  return (
    <form action={updateMachineAction} className="flex items-center gap-1">
      <HiddenMachineFields machine={machine} excludeConso />
      <input
        type="number"
        step="0.01"
        name="consommation_electrique_kw"
        defaultValue={machine.consommation_electrique_kw ?? ""}
        className="w-20 rounded border border-slate-200 px-1.5 py-1 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
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

// Certaines machines Energie ne consomment pas QUE de l'electricite -
// certaines tournent (aussi) au gaz ou au gasoil (voir
// lib/cout-production-reel.ts pour le calcul de cout qui les combine).
export function MachineConsoGazCell({ machine, canEdit }: { machine: Machine; canEdit: boolean }) {
  if (!canEdit) return <>{machine.consommation_gaz_litres_heure ?? "-"}</>;

  return (
    <form action={updateMachineAction} className="flex items-center gap-1">
      <HiddenMachineFields machine={machine} excludeConsoGaz />
      <input
        type="number"
        step="0.01"
        name="consommation_gaz_litres_heure"
        defaultValue={machine.consommation_gaz_litres_heure ?? ""}
        className="w-20 rounded border border-slate-200 px-1.5 py-1 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
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

export function MachineConsoGasoilCell({ machine, canEdit }: { machine: Machine; canEdit: boolean }) {
  if (!canEdit) return <>{machine.consommation_gasoil_litres_heure ?? "-"}</>;

  return (
    <form action={updateMachineAction} className="flex items-center gap-1">
      <HiddenMachineFields machine={machine} excludeConsoGasoil />
      <input
        type="number"
        step="0.01"
        name="consommation_gasoil_litres_heure"
        defaultValue={machine.consommation_gasoil_litres_heure ?? ""}
        className="w-20 rounded border border-slate-200 px-1.5 py-1 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
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
