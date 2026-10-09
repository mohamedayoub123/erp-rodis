import type { TrimestrePr4 } from "@/lib/trimestres-pr4";
import { BLEU_TITRE, CODE_DOCUMENT, Diapositive } from "./diapositive";

// Page de garde du "Rapport de revue de processus PR4" (meme presentation que la diapositive d'origine :
// logo, titre, "2026 / T1" en bas, code du document). L'annee et le trimestre viennent de la page ouverte.
export function PageDeGardePr4({ trimestre }: { trimestre: TrimestrePr4 }) {
  return (
    <Diapositive variante="garde">
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
        style={{ left: "17%", top: "39%", width: "64%", fontSize: "5.6cqw", color: BLEU_TITRE }}
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
      <div className="absolute" style={{ left: "74.8%", top: "89.6%", fontSize: "1.05cqw", color: BLEU_TITRE }}>
        1
      </div>
    </Diapositive>
  );
}
