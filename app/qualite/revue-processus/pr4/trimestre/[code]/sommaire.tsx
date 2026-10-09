"use client";

import { useEffect, useState } from "react";
import { PARTIES } from "./parties";

// Sommaire du rapport : liste verticale collee a gauche sur grand ecran, rangee de boutons defilante sur telephone.
// La partie en cours de lecture est mise en valeur.
export function Sommaire() {
  const [actif, setActif] = useState<string>(PARTIES[0].id);

  useEffect(() => {
    const mettreAJour = () => {
      // la derniere partie dont le haut est deja passe sous le haut de la fenetre
      let courant: string = PARTIES[0].id;
      for (const partie of PARTIES) {
        const element = document.getElementById(partie.id);
        if (element && element.getBoundingClientRect().top <= 140) courant = partie.id;
      }
      setActif(courant);
    };
    mettreAJour();
    window.addEventListener("scroll", mettreAJour, { passive: true });
    return () => window.removeEventListener("scroll", mettreAJour);
  }, []);

  return (
    <nav
      aria-label="Sommaire du rapport"
      data-hors-diapo
      className="sticky top-2 z-20 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border border-black/5 bg-white/95 p-2 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur lg:top-4 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:p-3"
    >
      <p className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 lg:block">Sommaire</p>
      {PARTIES.map((partie, index) => (
        <a
          key={partie.id}
          href={`#${partie.id}`}
          aria-current={actif === partie.id ? "true" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${
            actif === partie.id ? "bg-violet-600 font-semibold text-white" : "text-slate-700 hover:bg-violet-50"
          }`}
        >
          <span className="mr-2 text-xs opacity-70">{index + 1}</span>
          {partie.libelle}
        </a>
      ))}
    </nav>
  );
}
