"use client";

import { useEffect, useState } from "react";
import { calculerDecalageHorloge, formaterHeureTogo } from "@/lib/heure-togo";
import { heureServeurAction } from "./heure-serveur-actions";
import {
  handleTimeKeyDown,
  parseTimeValue,
  pushTimeDigit,
  renderTimeState,
  type TimeMaskState,
} from "./time-text-input";

// Ecart entre l'horloge de l'appareil et celle du serveur de l'ERP, calcule une seule fois par page
// (les deux champs heure du formulaire le partagent). null = pas encore synchronise.
let decalageHorlogeMs: number | null = null;
let synchronisation: Promise<void> | null = null;

function synchroniserHorloge(): Promise<void> {
  if (!synchronisation) {
    synchronisation = (async () => {
      const debut = Date.now();
      const heureServeur = await heureServeurAction();
      decalageHorlogeMs = calculerDecalageHorloge(debut, Date.now(), heureServeur);
    })().catch(() => {
      // Serveur injoignable : on garde l'horloge de l'appareil (affichee quand meme en heure du Togo).
      synchronisation = null;
    });
  }
  return synchronisation;
}

// Meme champ heure "HH:MM" que TimeTextInput, avec un petit bouton a cote : un appui met l'heure EXACTE du
// moment de l'appui, en heure du Togo, prise sur l'horloge du serveur de l'ERP (synchronisee sur internet)
// et non sur celle du telephone, qui peut etre fausse. On peut toujours corriger a la main ensuite.
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

  // Synchronise des l'ouverture de la page : au moment de l'appui, l'heure est deja calculable sans attente.
  useEffect(() => {
    void synchroniserHorloge();
  }, []);

  async function mettreHeureActuelle() {
    if (decalageHorlogeMs === null) await synchroniserHorloge();
    const instant = Date.now() + (decalageHorlogeMs ?? 0);
    setState(parseTimeValue(formaterHeureTogo(instant)));
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
        title="Mettre l'heure exacte de maintenant (heure du Togo)"
        aria-label="Mettre l'heure exacte de maintenant (heure du Togo)"
        className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
      >
        Maintenant
      </button>
    </div>
  );
}
