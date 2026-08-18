"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/app/_components/submit-button";
import { saveFormationRowAction } from "./actions";
import { MOIS_FIELD_KEYS, type FormationRow } from "./fields";

export function FormationForm({
  rows,
  yearOptions,
  currentYear,
}: {
  rows: FormationRow[];
  yearOptions: number[];
  currentYear: number;
}) {
  const [annee, setAnnee] = useState(currentYear);
  const [selectedId, setSelectedId] = useState("new");

  const rowsForYear = useMemo(() => rows.filter((row) => row.annee === annee), [rows, annee]);
  const existing = selectedId === "new" ? null : rowsForYear.find((row) => String(row.id) === selectedId) ?? null;

  return (
    <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-violet-700 marker:content-none">
        + Ajouter / modifier une formation
      </summary>
      {/* key force le remount des champs non controles des que
          annee/selectedId change, meme motif que Charges Usine / PR4. */}
      <form
        key={`${annee}-${selectedId}`}
        action={saveFormationRowAction}
        className="grid gap-4 border-t border-slate-100 p-5"
      >
        {existing ? <input type="hidden" name="id" value={existing.id} /> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Annee
            <select
              name="annee"
              defaultValue={annee}
              onChange={(e) => {
                setAnnee(Number(e.target.value));
                setSelectedId("new");
              }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500 lg:col-span-3">
            Ligne existante
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            >
              <option value="new">+ Nouvelle formation</option>
              {rowsForYear.map((row) => (
                <option key={row.id} value={String(row.id)}>
                  {row.categorie ? `${row.categorie} - ` : ""}
                  {row.formation}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Categorie / equipe
            <input
              type="text"
              name="categorie"
              defaultValue={existing?.categorie ?? ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500 lg:col-span-2">
            Formation
            <input
              type="text"
              name="formation"
              required
              defaultValue={existing?.formation ?? ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Ordre
            <input
              type="number"
              name="ordre"
              defaultValue={existing?.ordre ?? 0}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <input type="checkbox" name="est_bilan" defaultChecked={existing?.est_bilan ?? false} className="h-4 w-4" />
          Ligne bilan (Formation realisee / ratee, affichee en bas de tableau)
        </label>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Mois planifies</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MOIS_FIELD_KEYS.map(({ planifieKey, dateKey, realiseKey, label }) => (
              <div key={planifieKey} className="rounded-2xl border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name={planifieKey}
                    defaultChecked={Boolean(existing?.[planifieKey])}
                    className="h-4 w-4"
                  />
                  {label}
                </label>
                <input
                  type="text"
                  name={dateKey}
                  placeholder="Date / detail"
                  defaultValue={(existing?.[dateKey] as string | null) ?? ""}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal text-slate-900 outline-none"
                />
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <input
                    type="checkbox"
                    name={realiseKey}
                    defaultChecked={Boolean(existing?.[realiseKey])}
                    className="h-4 w-4"
                  />
                  Realise
                </label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SubmitButton
            pendingLabel="Enregistrement..."
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white"
          >
            {existing ? "Corriger cette formation" : "Ajouter cette formation"}
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
