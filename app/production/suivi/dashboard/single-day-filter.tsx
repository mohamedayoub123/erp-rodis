"use client";

import { useState } from "react";
import { MOIS_OPTIONS, ANNEE_OPTIONS } from "@/app/_components/date-jma-input";

const fieldClass =
  "rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none";

function todayParts() {
  const now = new Date();
  return { month: String(now.getMonth() + 1).padStart(2, "0"), year: String(now.getFullYear()) };
}

function splitIso(value: string) {
  const [year = "", month = "", day = ""] = (value || "").slice(0, 10).split("-");
  return { year, month, day };
}

// Mois/annee pre-remplis avec aujourd'hui (cas quasi-toujours voulu sur ce
// dashboard, qui suit la production en cours) - il suffit alors d'ecrire le
// jour. Un champ date natif complet (jour+mois+annee) exigeait de remplir
// les 3 avant de renvoyer une valeur exploitable, donc taper juste le jour
// ne filtrait jamais rien.
export function SingleDayFilter({ defaultValue }: { defaultValue: string }) {
  const initial = defaultValue ? splitIso(defaultValue) : { day: "", ...todayParts() };
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);

  function applyIfComplete(nextDay: string, nextMonth: string, nextYear: string, form: HTMLFormElement | null) {
    if (!form || !nextDay || !nextMonth || !nextYear) return;
    const value = `${nextYear.padStart(4, "0")}-${nextMonth.padStart(2, "0")}-${nextDay.padStart(2, "0")}`;
    const debut = form.querySelector<HTMLInputElement>('input[name="date_debut"]');
    const fin = form.querySelector<HTMLInputElement>('input[name="date_fin"]');
    if (debut) debut.value = value;
    if (fin) fin.value = value;
    form.requestSubmit();
  }

  return (
    <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
      Jour precis
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          max="31"
          placeholder="JJ"
          value={day}
          onChange={(event) => {
            const next = event.target.value;
            setDay(next);
            applyIfComplete(next, month, year, event.currentTarget.closest("form"));
          }}
          className={`w-16 ${fieldClass}`}
        />
        <select
          value={month}
          onChange={(event) => {
            const next = event.target.value;
            setMonth(next);
            applyIfComplete(day, next, year, event.currentTarget.closest("form"));
          }}
          className={fieldClass}
        >
          {MOIS_OPTIONS.map((mois) => (
            <option key={mois.value} value={mois.value}>
              {mois.label}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(event) => {
            const next = event.target.value;
            setYear(next);
            applyIfComplete(day, month, next, event.currentTarget.closest("form"));
          }}
          className={`w-24 ${fieldClass}`}
        >
          {ANNEE_OPTIONS.map((anneeValue) => (
            <option key={anneeValue} value={anneeValue}>
              {anneeValue}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
