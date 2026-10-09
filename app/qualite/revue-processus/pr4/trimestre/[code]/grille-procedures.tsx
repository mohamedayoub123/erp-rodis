import { BLEU_TITRE, POLICE } from "./diapositive";
import { Diagramme } from "./diagramme";
import type { DiagrammeProc } from "./procedures-donnees";

// Schemas de procedures : 3 par ligne sur grand ecran, TOUS A LA MEME HAUTEUR (chaque schema est dessine a la meme
// hauteur, sa largeur suit sa forme), aussi grands que possible. Sur ecran etroit : un par ligne.
const MARGE = 16; // marge interieure d'une carte (px)
const ECART = 16; // ecart entre cartes (px)
const PAR_LIGNE = 3;

function ratio(procedure: DiagrammeProc) {
  return procedure.vue[2] / procedure.vue[3];
}

export function GrilleProcedures({ procedures }: { procedures: DiagrammeProc[] }) {
  const lignes: DiagrammeProc[][] = [];
  for (let i = 0; i < procedures.length; i += PAR_LIGNE) lignes.push(procedures.slice(i, i + PAR_LIGNE));

  // Hauteur commune : la plus grande qui laisse tenir la ligne la plus large dans la largeur disponible
  const hauteurs = lignes.map((ligne) => {
    const somme = ligne.reduce((total, procedure) => total + ratio(procedure), 0);
    const marges = ligne.length * 2 * MARGE + (ligne.length - 1) * ECART;
    return `calc((100cqw - ${marges}px) / ${somme.toFixed(4)})`;
  });
  const hauteurCommune = `min(${hauteurs.join(", ")})`;

  return (
    <section className="proc-grille" style={{ containerType: "inline-size" }}>
      <style>{`
        .proc-grille .proc-ligne { display: flex; flex-direction: column; gap: ${ECART}px; }
        .proc-grille .proc-carte { width: 100%; }
        @container (min-width: 1100px) {
          .proc-grille .proc-ligne { flex-direction: row; justify-content: center; align-items: flex-start; }
          .proc-grille .proc-carte { width: calc(var(--hauteur) * var(--ratio) + ${2 * MARGE}px); flex: none; }
        }
      `}</style>
      <div className="flex flex-col" style={{ gap: ECART, ["--hauteur" as string]: hauteurCommune }}>
        {lignes.map((ligne, index) => (
          <div key={index} className="proc-ligne">
            {ligne.map((procedure) => (
              <article
                key={procedure.cle}
                className="proc-carte rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
                style={{ padding: MARGE, ["--ratio" as string]: ratio(procedure).toFixed(4) }}
              >
                <h2 className="mb-3 min-h-9 text-2xl font-light leading-9" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
                  {procedure.titre}
                </h2>
                <Diagramme diagramme={procedure} identifiant={procedure.cle} />
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
