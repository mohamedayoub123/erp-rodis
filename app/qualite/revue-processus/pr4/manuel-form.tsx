"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/app/_components/submit-button";
import { savePr4ManuelAction } from "./actions";
import { MANUEL_FIELDS, MOIS_NOMS, type ManuelRow } from "./fields";

const GROUPS = [
  "1/2 - Production",
  "3 - Capacite",
  "5/6 - Test Labo",
  "7 - Balance matiere",
  "8 - Taux d'arret",
  "10 - Dechets",
  "13 - Cout",
] as const;

function defaultValueFor(existing: ManuelRow | null, key: (typeof MANUEL_FIELDS)[number]["key"]) {
  const value = existing?.[key];
  return value === null || value === undefined ? "" : String(value);
}

export function Pr4ManuelForm({
  rows,
  yearOptions,
  currentYear,
}: {
  rows: ManuelRow[];
  yearOptions: number[];
  currentYear: number;
}) {
  const [annee, setAnnee] = useState(currentYear);
  const [mois, setMois] = useState(new Date().getMonth() + 1);

  const rowByKey = useMemo(() => {
    const map = new Map<string, ManuelRow>();
    for (const row of rows) map.set(`${row.annee}-${row.mois}`, row);
    return map;
  }, [rows]);

  const existing = rowByKey.get(`${annee}-${mois}`) ?? null;

  return (
    <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-violet-700 marker:content-none">
        + Saisir un mois ancien (repli utilise uniquement si le calcul automatique ne trouve rien pour ce mois)
      </summary>
      {/* key={annee-mois} force le remount des champs non controles ci-dessous
          des que le mois selectionne change, meme motif que Charges Usine. */}
      <form key={`${annee}-${mois}`} action={savePr4ManuelAction} className="grid gap-4 border-t border-slate-100 p-5">
        {existing ? (
          <p className="rounded-2xl bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-700">
            {MOIS_NOMS[mois - 1]} {annee} est deja enregistre manuellement - les valeurs ci-dessous sont
            pre-remplies, modifiez puis enregistrez pour corriger.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Annee
            <select
              name="annee"
              defaultValue={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Mois
            <select
              name="mois"
              defaultValue={mois}
              onChange={(e) => setMois(Number(e.target.value))}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            >
              {MOIS_NOMS.map((nom, index) => (
                <option key={nom} value={index + 1}>
                  {nom}
                </option>
              ))}
            </select>
          </label>
        </div>

        {GROUPS.map((group) => (
          <div key={group}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{group}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MANUEL_FIELDS.filter((field) => field.group === group).map((field) => (
                <label key={field.key} className="grid gap-1 text-xs font-semibold text-slate-500">
                  {field.label}
                  <input
                    type="number"
                    step="0.01"
                    name={field.key}
                    placeholder="0"
                    defaultValue={defaultValueFor(existing, field.key)}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div>
          <SubmitButton
            pendingLabel="Enregistrement..."
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white"
          >
            {existing ? "Corriger ce mois" : "Enregistrer ce mois"}
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
