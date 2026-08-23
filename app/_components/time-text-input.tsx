"use client";

import { useState } from "react";

// Masque de saisie heure "HH:MM" (24h garanti, jamais le selecteur natif du
// navigateur - voir commentaire sur les <input type="time"> remplaces).
// Demande explicite (apres un premier essai a saisie manuelle du ":" rejete
// par l'utilisateur) : taper juste les chiffres, le ":" et le zero de
// remplissage apparaissent tout seuls - "si j'ecris 8, le 08 vient
// automatique, et il me prend apres le ':' pour ecrire les minutes".
export type TimeMaskState = { h: string; m: string; hAutoPadded: boolean };

// Un premier chiffre 3-9 ne peut jamais commencer une heure a 2 chiffres
// (30-99 n'existe pas) - complete tout de suite en "0X" et passe aux
// minutes. Un premier chiffre 0/1/2 reste ambigu (peut encore devenir
// 00-09/10-19/20-23) - attend le 2e chiffre.
export function parseTimeValue(value: string): TimeMaskState {
  const match = /^(\d{0,2}):?(\d{0,2})$/.exec((value || "").trim());
  if (!match) return { h: "", m: "", hAutoPadded: false };
  return { h: match[1] ?? "", m: match[2] ?? "", hAutoPadded: false };
}

export function renderTimeState(state: TimeMaskState): string {
  if (!state.h) return "";
  if (state.h.length < 2) return state.h;
  return state.m ? `${state.h}:${state.m}` : `${state.h}:`;
}

export function pushTimeDigit(state: TimeMaskState, d: string): TimeMaskState {
  if (state.h.length < 2) {
    if (state.h === "") {
      if ("3456789".includes(d)) return { h: "0" + d, m: "", hAutoPadded: true };
      if ("012".includes(d)) return { h: d, m: "", hAutoPadded: false };
      return state;
    }
    const h1 = state.h;
    if (h1 === "2") {
      if ("0123".includes(d)) return { h: h1 + d, m: "", hAutoPadded: false };
      // 2 ne peut pas continuer avec ce chiffre (24-29 n'existe pas) -
      // complete l'heure a "02" et retente ce meme chiffre comme 1ere
      // minute, plutot que de le perdre silencieusement.
      const completed = "0" + h1;
      if ("012345".includes(d)) return { h: completed, m: d, hAutoPadded: true };
      return { h: completed, m: "", hAutoPadded: true };
    }
    if ("0123456789".includes(d)) return { h: h1 + d, m: "", hAutoPadded: false };
    return state;
  }
  if (state.m.length === 0) {
    if ("012345".includes(d)) return { ...state, m: d };
    return state;
  }
  if (state.m.length === 1) {
    if ("0123456789".includes(d)) return { ...state, m: state.m + d };
    return state;
  }
  return state;
}

export function popTimeDigit(state: TimeMaskState): TimeMaskState {
  if (state.m.length > 0) return { ...state, m: state.m.slice(0, -1) };
  if (state.h.length === 2) {
    // Une heure auto-completee depuis un seul chiffre (8 -> "08") s'efface
    // d'un coup - sinon un backspace laisserait un "0" fantome que
    // l'utilisateur n'a jamais tape.
    if (state.hAutoPadded) return { h: "", m: "", hAutoPadded: false };
    return { h: state.h.slice(0, 1), m: "", hAutoPadded: false };
  }
  if (state.h.length === 1) return { h: "", m: "", hAutoPadded: false };
  return state;
}

const NAV_KEYS = new Set([
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "Shift",
  "Control",
  "Meta",
  "Alt",
  "Enter",
  "Escape",
]);

// Meme gestion clavier partagee par TimeTextInput et tout champ heure
// controle localement (ex: TempsField dans fabrication-form.tsx, qui
// combine l'heure avec un jour/mois) - un seul setState (React.Dispatch)
// suffit, jamais 2 implementations du meme pavé de touches a maintenir.
export function handleTimeKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  setState: (updater: (prev: TimeMaskState) => TimeMaskState) => void
) {
  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    setState((prev) => pushTimeDigit(prev, event.key));
  } else if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    setState((prev) => popTimeDigit(prev));
  } else if (!NAV_KEYS.has(event.key) && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
  }
}

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
  const [state, setState] = useState<TimeMaskState>(() => parseTimeValue(defaultValue ?? ""));

  return (
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
      className={className}
    />
  );
}
