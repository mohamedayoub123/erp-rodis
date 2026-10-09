"use client";

import { useCallback, useEffect, useState } from "react";

// Mode diaporama : les diapositives (elements [data-diapo] de #rapport-diapos) passent une a une en plein ecran.
// Fleches / espace / PageSuivante pour avancer, Echap pour quitter. Les textes marques [data-hors-diapo] (bandeaux de
// fiabilite, saisies, titres de parties) sont caches pendant la projection.
const CSS = `
body.diaporama-actif { overflow: hidden; }
body.diaporama-actif #rapport-diapos {
  position: fixed; inset: 0; z-index: 70; display: flex; overflow: auto; background: #0f172a;
}
body.diaporama-actif #rapport-diapos section[data-partie] { display: contents; }
body.diaporama-actif #rapport-diapos [data-hors-diapo] { display: none !important; }
body.diaporama-actif #rapport-diapos [data-diapo] { display: none; }
body.diaporama-actif #rapport-diapos [data-diapo][data-actif] {
  display: block; margin: auto; width: min(100vw, calc(100vh * 16 / 9)); max-width: 100vw;
}
body.diaporama-actif #rapport-diapos [data-diapo][data-actif] > * { border-radius: 0; }
`;

function diapositives(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("#rapport-diapos [data-diapo]"));
}

export function BoutonDiaporama() {
  const [actif, setActif] = useState(false);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);

  const demarrer = () => {
    setTotal(diapositives().length);
    setIndex(0);
    setActif(true);
    document.documentElement.requestFullscreen?.().catch(() => {
      // plein ecran refuse : le diaporama reste affiche sur toute la fenetre
    });
  };

  const arreter = useCallback(() => {
    setActif(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);

  // Affiche la diapositive courante (les autres sont cachees par le CSS)
  useEffect(() => {
    if (!actif) return;
    document.body.classList.add("diaporama-actif");
    const liste = diapositives();
    liste.forEach((element, position) => {
      if (position === index) element.setAttribute("data-actif", "1");
      else element.removeAttribute("data-actif");
    });
    document.getElementById("rapport-diapos")?.scrollTo({ top: 0 });
    return () => {
      document.body.classList.remove("diaporama-actif");
      liste.forEach((element) => element.removeAttribute("data-actif"));
    };
  }, [actif, index]);

  // Clavier + sortie du plein ecran par la touche Echap du navigateur
  useEffect(() => {
    if (!actif) return;
    const suivante = () => setIndex((i) => Math.min(i + 1, Math.max(0, diapositives().length - 1)));
    const precedente = () => setIndex((i) => Math.max(i - 1, 0));
    const surTouche = (evenement: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(evenement.key)) {
        evenement.preventDefault();
        suivante();
      } else if (["ArrowLeft", "PageUp", "Backspace"].includes(evenement.key)) {
        evenement.preventDefault();
        precedente();
      } else if (evenement.key === "Home") setIndex(0);
      else if (evenement.key === "End") setIndex(Math.max(0, diapositives().length - 1));
      else if (evenement.key === "Escape") arreter();
    };
    const surPleinEcran = () => {
      if (!document.fullscreenElement) setActif(false);
    };
    window.addEventListener("keydown", surTouche);
    document.addEventListener("fullscreenchange", surPleinEcran);
    return () => {
      window.removeEventListener("keydown", surTouche);
      document.removeEventListener("fullscreenchange", surPleinEcran);
    };
  }, [actif, arreter]);

  const bouton =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-slate-800 shadow hover:bg-white disabled:opacity-40";

  return (
    <>
      <button
        type="button"
        onClick={demarrer}
        className="rounded-full border border-violet-200 bg-white px-5 py-2 text-sm font-semibold text-violet-700 transition hover:border-violet-400"
      >
        Diaporama
      </button>
      {actif ? (
        <>
          <style>{CSS}</style>
          <div className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900/80 px-4 py-2 text-white backdrop-blur">
            <button type="button" aria-label="Diapositive précédente" onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={index === 0} className={bouton}>
              ‹
            </button>
            <span className="min-w-[4.5rem] text-center text-sm tabular-nums">
              {index + 1} / {total}
            </span>
            <button type="button" aria-label="Diapositive suivante" onClick={() => setIndex((i) => Math.min(i + 1, total - 1))} disabled={index >= total - 1} className={bouton}>
              ›
            </button>
            <button type="button" aria-label="Quitter le diaporama" onClick={arreter} className={bouton}>
              ✕
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
