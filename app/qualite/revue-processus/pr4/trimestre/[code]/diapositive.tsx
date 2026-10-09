import type { ReactNode } from "react";

// Fond commun des diapositives du "Rapport de revue de processus PR4" (meme presentation que le modele
// d'origine : bandes orange / bleues a droite, triangle bleu a gauche). Zone 16/9 dont tout - formes et textes
// (unite "cqw" = 1 % de la largeur de la diapositive) - suit la largeur : proportionnelle sur telephone comme
// sur grand ecran. Les enfants se placent en absolu, en pourcentage de la diapositive.
export const CODE_DOCUMENT = "Code : CCSIQP-FO-031 Version : 1 Date 17/07/2023";
export const POLICE = '"Century Gothic", "Gill Sans", "Trebuchet MS", system-ui, sans-serif';
export const BLEU_TITRE = "#4472c4";

export function Diapositive({
  variante,
  children,
}: {
  // "garde" : triangle bleu en haut a gauche + code du document en vertical a droite
  // "contenu" : triangle bleu en bas a gauche
  variante: "garde" | "contenu";
  children: ReactNode;
}) {
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
      style={{ containerType: "inline-size", fontFamily: POLICE }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 2000 1123"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {variante === "garde" ? (
          <polygon points="5,0 142,0 5,925" fill="#6288ce" />
        ) : (
          <polygon points="0,645 72,1123 0,1123" fill="#6288ce" />
        )}
        <polygon points="1625,250 1845,835 1500,1123 1535,1010" fill="#c9d6ef" />
        <polygon points="1535,0 1800,0 1835,830" fill="#c9824f" />
        <polygon points="1800,0 1965,0 1840,830" fill="#6f78a0" />
        <polygon points="1925,0 2000,0 2000,600 1835,835" fill="#5b82c6" />
        <polygon points="1470,1123 1860,690 1905,830 1700,1123" fill="#e0955f" fillOpacity="0.92" />
        <polygon points="2000,590 2000,1123 1710,1123" fill="#4a74c6" />
        {variante === "garde" ? (
          <text
            transform="rotate(-90 1855 610)"
            x="1855"
            y="610"
            textAnchor="middle"
            fontSize="30"
            fill="#ffffff"
            fillOpacity="0.45"
            fontFamily={POLICE}
          >
            {CODE_DOCUMENT}
          </text>
        ) : null}
      </svg>
      {children}
    </div>
  );
}
