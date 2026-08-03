"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { saveRavitailleurLignesAction } from "./actions";
import type { LigneRow } from "@/lib/zone-chaine-list";

type ExistingAssignment = {
  position: string;
  ravitailleur: string | null;
};

function RavitailleurInput({
  defaultValue,
  onChange,
}: {
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <input
      type="text"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onChange(event.target.value);
      }}
      placeholder="Nom..."
      className="w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
    />
  );
}

export function RavitailleurTable({
  zoneGroups,
  existing,
}: {
  zoneGroups: LigneRow[][];
  existing: ExistingAssignment[];
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const existingByPosition = new Map(existing.map((row) => [row.position, row.ravitailleur || ""]));
  const rowsRef = useRef<Record<string, { zone: string; chaine: string; ravitailleur: string }>>({});

  zoneGroups.forEach((group, groupIndex) => {
    group.forEach((row, rowIndex) => {
      const position = `${groupIndex}-${rowIndex}`;
      if (!rowsRef.current[position]) {
        rowsRef.current[position] = {
          zone: row.zone,
          chaine: row.chaine,
          ravitailleur: existingByPosition.get(position) || "",
        };
      }
    });
  });

  function updateRow(position: string, value: string) {
    rowsRef.current[position] = { ...rowsRef.current[position], ravitailleur: value };
  }

  function handleSave() {
    setMessage("");
    setErrorMessage("");

    const payload = Object.entries(rowsRef.current).map(([position, row]) => ({
      position,
      zone: row.zone,
      chaine: row.chaine,
      ravitailleur: row.ravitailleur,
    }));

    const formData = new FormData();
    formData.set("payload", JSON.stringify(payload));

    startTransition(async () => {
      try {
        await saveRavitailleurLignesAction(formData);
        setMessage("Enregistre.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
      }
    });
  }

  return (
    <div>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Zone</th>
            <th className="px-4 py-3 font-semibold">Chaine</th>
            <th className="px-4 py-3 font-semibold">Ravitailleur</th>
          </tr>
        </thead>
        <tbody>
          {zoneGroups.map((group, groupIndex) => (
            <Fragment key={`group-${groupIndex}`}>
              {groupIndex > 0 ? (
                <tr key={`divider-${groupIndex}`}>
                  <td colSpan={3} className="bg-slate-300 px-4 py-2" />
                </tr>
              ) : null}
              {group.map((row, rowIndex) => {
                const position = `${groupIndex}-${rowIndex}`;
                return (
                  <tr key={position} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.zone}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.chaine}</td>
                    <td className="px-4 py-3">
                      <RavitailleurInput
                        defaultValue={existingByPosition.get(position) || ""}
                        onChange={(value) => updateRow(position, value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
          {errorMessage ? <p className="text-sm font-semibold text-red-700">{errorMessage}</p> : null}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-60"
        >
          {isPending ? "Enregistrement..." : "Save"}
        </button>
      </div>
    </div>
  );
}
