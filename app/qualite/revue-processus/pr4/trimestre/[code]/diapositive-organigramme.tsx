import { BLEU_TITRE, POLICE } from "./diapositive";
import { Organigramme } from "./organigramme";

// Diapositive 3 du "Rapport de revue de processus PR4" : organigramme, redessine pour que les noms restent bien
// lisibles (zoom, glisser pour se deplacer, plein ecran) - le meme pour tous les trimestres.
export function DiapositiveOrganigrammePr4() {
  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-4">
      <h2 className="text-4xl font-light" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
        Organigramme
      </h2>
      <div className="mt-5">
        <Organigramme />
      </div>
    </section>
  );
}
