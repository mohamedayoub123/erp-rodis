"use client";

import { useRef, useState } from "react";

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

const VIDE: TimeMaskState = { h: "", m: "", hAutoPadded: false };

function ajouterChiffres(depart: TimeMaskState, chiffres: string): TimeMaskState {
  return chiffres.split("").reduce<TimeMaskState>((etat, chiffre) => pushTimeDigit(etat, chiffre), depart);
}

// Ce qui a ete ajoute entre l'ancienne et la nouvelle valeur, ou que soit le curseur (et meme si un morceau selectionne a ete remplace)
function partieAjoutee(avant: string, apres: string): string {
  let debut = 0;
  while (debut < avant.length && debut < apres.length && avant[debut] === apres[debut]) debut += 1;
  let fin = 0;
  while (fin < avant.length - debut && fin < apres.length - debut && avant[avant.length - 1 - fin] === apres[apres.length - 1 - fin]) fin += 1;
  return apres.slice(debut, apres.length - fin);
}

// TOUTE la saisie passe par ici, a partir de la valeur du champ : clavier d'ordinateur, clavier d'iPad ou de telephone, coller, stylet,
// dictee. Aucune touche n'est bloquee ni reconnue au clavier : les tablettes n'annoncent pas toutes la touche tapee.
//  * chiffres tapes a la suite : "8" -> "08:", puis les minutes ; "14" -> "14:" ;
//  * "1:" ou "8h" (un seul chiffre d'heure suivi d'un separateur) -> "01:" ;
//  * heure deja complete (ex : apres "Maintenant") : le premier chiffre tape apres avoir touche le champ (nouvelleSaisie), ou tape sur une
//    heure selectionnee, REMPLACE l'ancienne heure ; un chiffre en trop pendant qu'on ecrit est ignore ;
//  * effacer le dernier caractere = Retour arriere ; les lettres sont ignorees.
export function appliquerValeurTapee(prev: TimeMaskState, valeur: string, nouvelleSaisie = false): TimeMaskState {
  const avant = renderTimeState(prev);
  if (valeur === avant) return prev;
  if (!valeur) return VIDE;
  const heureSeule = /^\s*(\d)\s*[:hH.,;\s-]+$/.exec(valeur);
  if (heureSeule) return { h: "0" + heureSeule[1], m: "", hAutoPadded: true };

  const ajoutes = partieAjoutee(avant, valeur).replace(/\D/g, "");
  const complete = prev.h.length === 2 && prev.m.length === 2;
  if (complete && ajoutes) return nouvelleSaisie || valeur.length <= avant.length ? ajouterChiffres(VIDE, ajoutes) : prev;
  // Tape a la fin : on continue a partir de ce qui est deja la
  if (valeur.startsWith(avant)) return ajoutes ? ajouterChiffres(prev, ajoutes) : prev;

  const chiffres = valeur.replace(/\D/g, "");
  const effaceALaFin = valeur.length < avant.length && avant.startsWith(valeur);
  if (effaceALaFin && avant.replace(/\D/g, "").length - chiffres.length <= 1) return popTimeDigit(prev);
  return ajouterChiffres(VIDE, chiffres);
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
  // Vrai quand on vient de toucher le champ : le prochain chiffre commence une nouvelle heure
  const nouvelleSaisie = useRef(false);

  return (
    <input
      type="text"
      name={name}
      inputMode="numeric"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder="HH:MM"
      pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
      title="Format 24h, ex: 14:30"
      required={required}
      value={renderTimeState(state)}
      onFocus={() => {
        nouvelleSaisie.current = true;
      }}
      onChange={(event) => {
        const valeur = event.target.value;
        const remplacer = nouvelleSaisie.current;
        nouvelleSaisie.current = false;
        setState((prev) => appliquerValeurTapee(prev, valeur, remplacer));
      }}
      className={className}
    />
  );
}
