import { BLEU_TITRE, POLICE } from "./diapositive";
import { Diagramme } from "./diagramme";
import type { DiagrammeProc } from "./procedures-donnees";

// Une diapositive "procedure" du rapport : titre + schema redessine en vectoriel (textes bien lisibles).
export function DiapositiveProcedure({ diagramme }: { diagramme: DiagrammeProc }) {
  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-8">
      <h2 className="text-4xl font-light" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
        {diagramme.titre}
      </h2>
      <div className="mx-auto mt-6 w-full max-w-[900px]">
        <Diagramme diagramme={diagramme} identifiant={diagramme.cle} />
      </div>
    </section>
  );
}
