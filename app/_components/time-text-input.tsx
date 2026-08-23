"use client";

import { useState } from "react";

// Champ heure "HH:MM" en texte libre (24h garanti, jamais le selecteur natif
// du navigateur - voir commentaire sur les <input type="time"> remplaces).
// Bloque toute frappe qui casserait la forme HH:MM (ex: un 3e chiffre avant
// le ":" - "140" refuse, reste a "14") SANS jamais inserer le ":" a la
// place de l'utilisateur - demande explicite : "il faut que moi-meme mette
// le ':', pas oblige d'ecrire 2 chiffres et le ':' vient automatique".
export const PARTIEL_HHMM = /^([01]?[0-9]?|2[0-3]?)(:([0-5]?[0-9]?)?)?$/;

export function TimeTextInput({
  name,
  defaultValue,
  required,
  className,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <input
      type="text"
      name={name}
      inputMode="numeric"
      placeholder="HH:MM"
      pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
      title="Format 24h, ex: 14:30"
      required={required}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (PARTIEL_HHMM.test(next)) {
          setValue(next);
        }
      }}
      className={className}
    />
  );
}
