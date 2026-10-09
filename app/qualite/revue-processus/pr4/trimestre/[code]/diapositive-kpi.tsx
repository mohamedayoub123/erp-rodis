import { BLEU_TITRE, POLICE } from "./diapositive";
import { GraphiqueLignes } from "./graphique-lignes";
import { dernierMoisAffiche, lireKpiArretProduction, lireKpiCoutCarton } from "./kpi-donnees";

// Diapositives "KPI" : (1) % temps d'arret et production realisee, de janvier 2025 au mois en cours (un espace entre
// 2025 et 2026) ; (2) analyse comparative du cout du carton, mois par mois. Comme pour le tableau, on ne montre que
// les mois jusqu'a la fin du trimestre de la page ouverte.
const BLEU = "#4472c4";
const ORANGE = "#ed7d31";
const carte =
  "rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6";

function Indisponible() {
  return <section className={`${carte} text-sm text-slate-600`}>Impossible de calculer ce graphique pour le moment. Rechargez la page dans un instant.</section>;
}

const entier = (v: number) => `${Math.round(v)}%`;

export async function DiapositiveKpiArretProduction({ annee, trimestre }: { annee: number; trimestre: number }) {
  let donnees;
  try {
    donnees = await lireKpiArretProduction(dernierMoisAffiche(annee, trimestre));
  } catch {
    return <Indisponible />;
  }
  return (
    <section className={carte}>
      <h2 className="text-5xl font-light" style={{ color: BLEU_TITRE, fontFamily: POLICE }}>
        KPI
      </h2>
      <h3 className="mt-2 text-center text-2xl font-bold uppercase tracking-[0.12em] text-slate-700 sm:text-3xl" style={{ fontFamily: POLICE }}>
        % temps d&apos;arrêt et production réalisée
      </h3>
      <div className="mt-4">
        <GraphiqueLignes
          categories={donnees.categories}
          yMax={120}
          yPas={20}
          formatY={(v) => `${v}%`}
          series={[
            { cle: "production", nom: "Production réalisée (%)", couleur: ORANGE, marqueur: "carre", valeurs: donnees.production, etiquette: entier, decalage: -16 },
            { cle: "arret", nom: "Temps d'arrêt (%)", couleur: BLEU, marqueur: "losange", valeurs: donnees.arret, etiquette: entier, decalage: -16 },
          ]}
        />
      </div>
    </section>
  );
}

const un = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export async function DiapositiveKpiCoutCarton({ annee, trimestre }: { annee: number; trimestre: number }) {
  let donnees;
  try {
    donnees = await lireKpiCoutCarton(annee, dernierMoisAffiche(annee, trimestre));
  } catch {
    return <Indisponible />;
  }
  const maximum = Math.max(
    1,
    ...[donnees.r1, donnees.r2, donnees.r3, donnees.r4, donnees.r5, donnees.r6, donnees.nbCarton].flatMap((serie) => serie.filter((v): v is number => v !== null))
  );
  const yMax = Math.ceil(maximum / 500) * 500;
  return (
    <section className={carte}>
      <h2 className="text-center text-3xl font-light text-slate-900 sm:text-4xl" style={{ fontFamily: POLICE }}>
        KPI – Analyse comparative du coût du carton (multi-sources)
      </h2>
      <h3 className="mt-3 text-center text-2xl font-bold text-slate-700" style={{ fontFamily: POLICE }}>
        variation coût de carton par mois
      </h3>
      <div className="mt-4">
        <GraphiqueLignes
          categories={donnees.categories}
          yMax={yMax}
          yPas={500}
          formatY={(v) => v.toLocaleString("fr-FR")}
          tailleEtiquette={15}
          couleurEtiquette="#1b1b1b"
          series={[
            { cle: "r1", nom: "Coût carton / journalier totale", couleur: "#4a7ebb", valeurs: donnees.r1, etiquette: un, decalage: -14 },
            { cle: "r2", nom: "Coût carton / journalier cosmétique", couleur: "#be4b48", valeurs: donnees.r2, etiquette: un, decalage: 24 },
            { cle: "r3", nom: "Coût carton / journalier cosmétique et énergie cosmétique", couleur: "#98b954", valeurs: donnees.r3, etiquette: un, decalage: 24 },
            { cle: "r4", nom: "Coût carton / coût journalier et énergie totale", couleur: "#7d60a0", valeurs: donnees.r4, etiquette: un, decalage: 24 },
            { cle: "r5", nom: "Coût carton / coût journalier totale, embauches et énergie totale", couleur: "#46aac5", valeurs: donnees.r5, etiquette: un, decalage: -14 },
            { cle: "nb", nom: "nb carton fabriqué (÷ 100)", couleur: "#f79646", valeurs: donnees.nbCarton, etiquette: un, decalage: -14 },
            { cle: "r6", nom: "Coût carton / énergie, salaire total et dépenses techniques", couleur: "#2c4d75", valeurs: donnees.r6, etiquette: un, decalage: -14 },
          ]}
        />
      </div>
    </section>
  );
}
