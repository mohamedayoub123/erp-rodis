import type { TrimestrePr4 } from "@/lib/trimestres-pr4";

// Page de garde du "Rapport de revue de processus PR4" (meme presentation que la diapositive d'origine :
// logo, titre, "2026 / T1" en bas, code du document). L'annee et le trimestre viennent de la page ouverte.
// Dessinee dans une zone 16/9 dont tout (textes compris) suit la largeur : elle reste proportionnelle sur
// telephone comme sur grand ecran.
const CODE_DOCUMENT = "Code : CCSIQP-FO-031 Version : 1 Date 17/07/2023";
const POLICE = '"Century Gothic", "Gill Sans", "Trebuchet MS", system-ui, sans-serif';

export function PageDeGardePr4({ trimestre }: { trimestre: TrimestrePr4 }) {
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
      style={{ containerType: "inline-size", fontFamily: POLICE }}
    >
      {/* Formes de la diapositive : triangle bleu a gauche, bandes orange / bleues a droite */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 2000 1123"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon points="5,0 142,0 5,925" fill="#6288ce" />
        <polygon points="1625,250 1845,835 1500,1123 1535,1010" fill="#c9d6ef" />
        <polygon points="1535,0 1800,0 1835,830" fill="#c9824f" />
        <polygon points="1800,0 1965,0 1840,830" fill="#6f78a0" />
        <polygon points="1925,0 2000,0 2000,600 1835,835" fill="#5b82c6" />
        <polygon points="1470,1123 1860,690 1905,830 1700,1123" fill="#e0955f" fillOpacity="0.92" />
        <polygon points="2000,590 2000,1123 1710,1123" fill="#4a74c6" />
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
      </svg>

      {/* Logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-rodis-pr4.png"
        alt="Rodis Lome"
        className="absolute h-auto"
        style={{ left: "40.5%", top: "0.6%", width: "13%" }}
      />

      {/* Titre */}
      <div
        className="absolute text-center font-light leading-[1.22]"
        style={{ left: "17%", top: "39%", width: "64%", fontSize: "5.6cqw", color: "#4472c4" }}
      >
        <span className="block">Rapport de revue de</span>
        <span className="block">processus PR4</span>
      </div>

      {/* Annee / trimestre : change selon la page */}
      <div
        className="absolute text-center font-bold"
        style={{ left: "30%", top: "81%", width: "37%", fontSize: "2.7cqw", color: "#7f7f7f" }}
      >
        {trimestre.annee} / T{trimestre.trimestre}
      </div>

      {/* Pied de page */}
      <div className="absolute" style={{ left: "6.5%", top: "89.6%", fontSize: "1.05cqw", color: "#8c8c8c" }}>
        {CODE_DOCUMENT}
      </div>
      <div className="absolute" style={{ left: "74.8%", top: "89.6%", fontSize: "1.05cqw", color: "#4472c4" }}>
        1
      </div>
    </div>
  );
}
