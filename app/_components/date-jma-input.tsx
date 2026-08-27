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

export const ANNEE_OPTIONS = [
  "2024",
  "2025",
  "2026",
  "2027",
  "2028",
  "2029",
  "2030",
  "2031",
  "2032",
  "2033",
  "2034",
  "2035",
  "2036",
  "2037",
  "2038",
  "2039",
  "2040",
];

// Valeur par defaut "intelligente" pour un champ DateJmaFormField qui
// represente LA date d'une saisie Fabrication/Conditionnement/Emballage
// (pas une date independante comme la peremption) : si une date a deja ete
// enregistree (on rouvre une saisie existante), elle est gardee telle
// quelle - sinon (nouvelle saisie), le jour vient du programme (date_jour
// de programme_lignes, le jour prevu de cette production) et le mois/annee
// sont ceux d'aujourd'hui (cas courant : la saisie se fait le jour meme ou
// tres peu apres) - demande explicite, les 3 champs restent modifiables a
// la main ensuite.
export function smartEntryDateDefault(
  existingValue: string | null | undefined,
  ligneDateJour: string | null | undefined
): string {
  if (existingValue) return existingValue;
  const day = (ligneDateJour || "").slice(8, 10);
  if (!day) return "";
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = String(today.getFullYear());
  return `${year}-${month}-${day}`;
}

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
      <select
        value={year}
        onChange={(event) => onYear(event.target.value)}
        required={required}
        className={`w-24 ${fieldClass}`}
      >
        <option value="">AAAA</option>
        {ANNEE_OPTIONS.map((anneeValue) => (
          <option key={anneeValue} value={anneeValue}>
            {anneeValue}
          </option>
        ))}
      </select>
    </div>
  );
}

// Variante controlee (value/onChange, comme un input normal) - pour un
// champ pilote par un state du composant parent.
//
// Garde jour/mois/annee en etat local (au lieu de les deriver de `value` a
// chaque rendu) : tant que les 3 ne sont pas remplis, combine() renvoie ""
// donc `value` ne bouge jamais - un composant purement derive de `value`
// perd alors ce qui vient d'etre tape des que l'utilisateur passe au champ
// suivant. L'etat local garde la saisie partielle visible ; `value` n'est
// remis a jour vers le parent qu'une fois les 3 champs remplis.
export function DateJmaInput({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [day, setDay] = useState(() => splitIso(value).day);
  const [month, setMonth] = useState(() => splitIso(value).month);
  const [year, setYear] = useState(() => splitIso(value).year);

  // Resynchronise l'etat local si `value` change depuis l'exterieur (ex:
  // remise a zero du formulaire apres "Valider entree") - "adjusting state
  // during render" via un useState de comparaison (pattern documente par
  // React), pas une ref : lire/ecrire une ref pendant le rendu est interdit
  // (erreur reelle corrigee : react-hooks/refs).
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    const next = splitIso(value);
    if (next.day !== day) setDay(next.day);
    if (next.month !== month) setMonth(next.month);
    if (next.year !== year) setYear(next.year);
  }

  return (
    <DateJmaFields
      day={day}
      month={month}
      year={year}
      onDay={(next) => {
        setDay(next);
        onChange(combine(next, month, year));
      }}
      onMonth={(next) => {
        setMonth(next);
        onChange(combine(day, next, year));
      }}
      onYear={(next) => {
        setYear(next);
        onChange(combine(day, month, next));
      }}
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
