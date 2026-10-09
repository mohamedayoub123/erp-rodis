import { BLEU_TITRE, Diapositive } from "./diapositive";

// Diapositive 2 du "Rapport de revue de processus PR4" : objectif de la presentation (texte identique a
// l'original, le meme pour tous les trimestres).
const OBJECTIFS = ["Revue du processus PR4", "Lié aux exigences ISO 9001, 14001, 22716"];

export function DiapositiveObjectifPr4() {
  return (
    <Diapositive variante="contenu">
      <h2
        className="absolute font-light leading-[1.2]"
        style={{ left: "6.3%", top: "8.3%", width: "70%", fontSize: "3.8cqw", color: BLEU_TITRE }}
      >
        Objectif de la présentation :
      </h2>

      <ul
        className="absolute list-none leading-[1.2]"
        style={{ left: "7.1%", top: "47.5%", width: "70%", fontSize: "1.9cqw", color: "#404040" }}
      >
        {OBJECTIFS.map((objectif) => (
          <li key={objectif}>→ {objectif}</li>
        ))}
      </ul>
    </Diapositive>
  );
}
