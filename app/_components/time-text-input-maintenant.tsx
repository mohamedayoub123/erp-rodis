"use client";

import { useState } from "react";
import {
  handleTimeKeyDown,
  parseTimeValue,
  pushTimeDigit,
  renderTimeState,
  type TimeMaskState,
} from "./time-text-input";

// Meme champ heure "HH:MM" que TimeTextInput, avec un petit bouton a cote : un appui met l'heure EXACTE
// du moment de l'appui (heure de l'appareil). On peut toujours corriger a la main ensuite.
// Utilise par l'Entree par ligne du Conditionnement (Temps demarage lot / Temps arret batch).
export function TimeTextInputMaintenant({
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
  const [state, setState] = useState<TimeMaskState>(() => parseTimeValue(defaultValue ?? ""));

  function mettreHeureActuelle() {
    const maintenant = new Date();
    const heures = String(maintenant.getHours()).padStart(2, "0");
    const minutes = String(maintenant.getMinutes()).padStart(2, "0");
    setState(parseTimeValue(`${heures}:${minutes}`));
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        name={name}
        inputMode="numeric"
        placeholder="HH:MM"
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
        title="Format 24h, ex: 14:30"
        required={required}
        value={renderTimeState(state)}
        onKeyDown={(event) => handleTimeKeyDown(event, setState)}
        onChange={() => {}}
        onPaste={(event) => {
          event.preventDefault();
          const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
          setState((prev) => {
            let next = prev;
            for (const digit of digits) next = pushTimeDigit(next, digit);
            return next;
          });
        }}
        className={`min-w-0 flex-1 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={mettreHeureActuelle}
        title="Mettre l'heure exacte de maintenant"
        aria-label="Mettre l'heure exacte de maintenant"
        className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
      >
        Maintenant
      </button>
    </div>
  );
}
