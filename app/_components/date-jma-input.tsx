"use client";

import { useState } from "react";

// Jour / Mois (nomme) / Annee separes - un champ date natif affiche
// l'ordre jour/mois selon la langue du navigateur, ce qui a deja cause une
// vraie erreur (10 aout saisi comme 8 octobre). Le mois en toutes lettres
// retire toute ambiguite.
export const MOIS_OPTIONS = [
  { value: "01", label: "Janvier" },
  { value: "02", label: "Fevrier" },
  { value: "03", label: "Mars" },
  { value: "04", label: "Avril" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Juin" },
  { value: "07", label: "Juillet" },
  { value: "08", label: "Aout" },
  { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Decembre" },
];

function splitIso(value: string) {
  const [year = "", month = "", day = ""] = (value || "").slice(0, 10).split("-");
  return { year, month, day };
}

function combine(day: string, month: string, year: string) {
  return day && month && year
    ? `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    : "";
}

const fieldClass = "rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none";

function DateJmaFields({
  day,
  month,
  year,
  onDay,
  onMonth,
  onYear,
  required,
}: {
  day: string;
  month: string;
  year: string;
  onDay: (value: string) => void;
  onMonth: (value: string) => void;
  onYear: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="number"
        min="1"
        max="31"
        placeholder="JJ"
        value={day}
        onChange={(event) => onDay(event.target.value)}
        required={required}
        className={`w-16 ${fieldClass}`}
      />
      <select
        value={month}
        onChange={(event) => onMonth(event.target.value)}
        required={required}
        className={fieldClass}
      >
        <option value="">Mois</option>
        {MOIS_OPTIONS.map((mois) => (
          <option key={mois.value} value={mois.value}>
            {mois.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        min="2000"
        max="2100"
        placeholder="AAAA"
        value={year}
        onChange={(event) => onYear(event.target.value)}
        required={required}
        className={`w-24 ${fieldClass}`}
      />
    </div>
  );
}

// Variante controlee (value/onChange, comme un input normal) - pour un
// champ pilote par un state du composant parent.
export function DateJmaInput({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const { day, month, year } = splitIso(value);

  return (
    <DateJmaFields
      day={day}
      month={month}
      year={year}
      onDay={(next) => onChange(combine(next, month, year))}
      onMonth={(next) => onChange(combine(day, next, year))}
      onYear={(next) => onChange(combine(day, month, next))}
      required={required}
    />
  );
}

// Variante pour formulaire natif (name/defaultValue + input cache) - pour
// un <form action={serverAction}> sans state cote parent (Server Component).
export function DateJmaFormField({
  name,
  defaultValue,
  required,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const initial = splitIso(defaultValue || "");
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const value = combine(day, month, year);

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={value} />
      <DateJmaFields
        day={day}
        month={month}
        year={year}
        onDay={setDay}
        onMonth={setMonth}
        onYear={setYear}
        required={required}
      />
    </div>
  );
}
