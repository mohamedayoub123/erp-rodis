"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { filtrerCodes, type CodesPourRecherche } from "@/lib/codes-flux-shared";

// Nombre de codes dessines dans la liste : au-dela on tape un caractere de plus
const MAX_AFFICHES = 1500;

// Champ "Code" du rapport Flux par Code : des qu'on tape (ex : "AA"), la liste de tous les codes correspondants s'ouvre ; un clic (ou les
// fleches puis Entree) ouvre directement le flux du code. Taper un code complet puis Entree marche comme avant.
export function ChampCode({ valeurInitiale, produits, codes }: { valeurInitiale: string } & CodesPourRecherche) {
  const [valeur, setValeur] = useState(valeurInitiale);
  const [ouvert, setOuvert] = useState(false);
  // ligne choisie avec les fleches ; -1 = aucune (Entree envoie alors le texte tape)
  const [choix, setChoix] = useState(-1);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const saisie = useDeferredValue(valeur);
  const resultats = useMemo(() => filtrerCodes(codes, saisie), [codes, saisie]);
  const affiches = resultats.slice(0, MAX_AFFICHES);
  const visible = ouvert && saisie.trim() !== "";

  function ouvrirLeFlux(code: string) {
    // la valeur doit etre dans le champ avant d'envoyer le formulaire
    flushSync(() => {
      setValeur(code);
      setOuvert(false);
    });
    champ.current?.form?.requestSubmit();
  }

  function deplacer(pas: number) {
    const suivant = Math.min(affiches.length - 1, Math.max(0, choix + pas));
    setChoix(suivant);
    liste.current?.querySelector(`[data-rang="${suivant}"]`)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="relative min-w-[240px] flex-1">
      <input
        ref={champ}
        type="text"
        name="code"
        value={valeur}
        onChange={(evenement) => {
          setValeur(evenement.target.value);
          setOuvert(true);
          setChoix(-1);
        }}
        onClick={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={(evenement) => {
          if (evenement.key === "ArrowDown") {
            evenement.preventDefault();
            if (visible) deplacer(1);
            else setOuvert(true);
          } else if (evenement.key === "ArrowUp" && visible) {
            evenement.preventDefault();
            deplacer(-1);
          } else if (evenement.key === "Enter" && visible && choix >= 0 && affiches[choix]) {
            evenement.preventDefault();
            ouvrirLeFlux(affiches[choix][0]);
          } else if (evenement.key === "Escape") {
            setOuvert(false);
          }
        }}
        placeholder="Code, ex: AA4256"
        autoComplete="off"
        autoFocus
        className="w-full rounded-2xl border-2 border-sky-200 bg-sky-50/50 px-5 py-4 text-xl font-bold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-sky-500 focus:bg-white"
      />
      {visible ? (
        // onMouseDown : le champ garde le curseur, la liste ne se ferme pas avant le clic (ni quand on fait defiler)
        <div
          onMouseDown={(evenement) => evenement.preventDefault()}
          className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
        >
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
            {resultats.length === 0
              ? `Aucun code avec "${saisie.trim()}"`
              : `${resultats.length} code${resultats.length > 1 ? "s" : ""} avec "${saisie.trim()}"${resultats.length > MAX_AFFICHES ? ` : les ${MAX_AFFICHES} premiers, tape un caractere de plus` : ""}`}
          </p>
          <div ref={liste} className="max-h-80 overflow-y-auto">
            {affiches.map(([code, produit], rang) => (
              <button
                key={code}
                type="button"
                data-rang={rang}
                onClick={() => ouvrirLeFlux(code)}
                className={`flex w-full items-baseline gap-3 px-4 py-2 text-left ${rang === choix ? "bg-sky-100" : "hover:bg-sky-50"}`}
              >
                <span className="min-w-[8rem] text-base font-bold text-slate-900">{code}</span>
                <span className="truncate text-sm text-slate-600">{produits[produit]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
