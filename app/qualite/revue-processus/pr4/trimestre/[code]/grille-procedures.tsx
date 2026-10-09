import { BLEU_TITRE, POLICE } from "./diapositive";
import { Diagramme } from "./diagramme";
import type { DiagrammeProc } from "./procedures-donnees";

// Schemas de procedures : 3 par ligne sur grand ecran (2 sur ecran moyen, 1 sur telephone), chacun aussi grand que
// possible - plus besoin de descendre longtemps pour tous les voir.
export function GrilleProcedures({ procedures }: { procedures: DiagrammeProc[] }) {
  return (
    <section className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {procedures.map((procedure) => (
        <article
          key={procedure.cle}
          className="rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
        >
          <h2 className="mb-3 text-2xl font-light" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
            {procedure.titre}
          </h2>
          <Diagramme diagramme={procedure} identifiant={procedure.cle} />
        </article>
      ))}
    </section>
  );
}
