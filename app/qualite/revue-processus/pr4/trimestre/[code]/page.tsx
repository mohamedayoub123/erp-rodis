import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { trouverTrimestrePr4 } from "@/lib/trimestres-pr4";
import { CartesResume, CartesResumeChargement } from "./cartes-resume";
import { EnTeteRapport } from "./en-tete-rapport";
import { PARTIES, type IdPartie } from "./parties";
import { Sommaire } from "./sommaire";
import { PageDeGardePr4 } from "./page-de-garde";
import { DiapositiveObjectifPr4 } from "./diapositive-objectif";
import { DiapositiveOrganigrammePr4 } from "./diapositive-organigramme";
import { GrilleProcedures } from "./grille-procedures";
import { DiapositiveIndicateursPr4 } from "./diapositive-indicateurs";
import { DiapositiveKpiArretProduction, DiapositiveKpiCoutCarton } from "./diapositive-kpi";
import { DiapositiveSwot } from "./diapositive-swot";
import { DiapositiveFin } from "./diapositive-fin";
import { PROCEDURES } from "./procedures-donnees";

// Page d'un trimestre de la Revue Processus PR4 (ex: PR4 T1 2026 = janvier a mars 2026). Meme droit que la page
// /qualite/revue-processus (qualiteRevueProcessus). En haut : l'en-tete (boutons Diaporama et PowerPoint) et 4 cartes
// de resume ; puis le sommaire a gauche et les diapositives en 6 parties.
const carteVide =
  "rounded-[1.75rem] border border-black/5 bg-white p-6 text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]";

// Une partie du rapport : titre (cache pendant le diaporama) + ses diapositives
function Partie({ id, children }: { id: IdPartie; children: ReactNode }) {
  const partie = PARTIES.find((p) => p.id === id);
  return (
    <section id={id} data-partie className="scroll-mt-4 space-y-4">
      <h2 data-hors-diapo className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
        {PARTIES.findIndex((p) => p.id === id) + 1}. {partie?.libelle}
      </h2>
      {children}
    </section>
  );
}

const Diapo = ({ children }: { children: ReactNode }) => <div data-diapo>{children}</div>;

export default async function TrimestrePr4Page({ params }: { params: Promise<{ code: string }> }) {
  noStore();
  const { code } = await params;
  const trimestre = trouverTrimestrePr4(code);
  if (!trimestre) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <EnTeteRapport trimestre={trimestre} />

        <Suspense fallback={<CartesResumeChargement />}>
          <CartesResume code={trimestre.code} trimestre={trimestre.trimestre} />
        </Suspense>

        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
          <Sommaire />

          <div id="rapport-diapos" className="min-w-0 space-y-10">
            <Partie id="ouverture">
              <Diapo>
                <PageDeGardePr4 trimestre={trimestre} />
              </Diapo>
              <Diapo>
                <DiapositiveObjectifPr4 />
              </Diapo>
            </Partie>

            <Partie id="organisation">
              <Diapo>
                <DiapositiveOrganigrammePr4 />
              </Diapo>
            </Partie>

            <Partie id="processus">
              <Diapo>
                <GrilleProcedures procedures={PROCEDURES} />
              </Diapo>
            </Partie>

            <Partie id="performance">
              <Diapo>
                <Suspense fallback={<section className={carteVide}>Calcul des indicateurs en cours...</section>}>
                  <DiapositiveIndicateursPr4 code={trimestre.code} annee={trimestre.annee} trimestre={trimestre.trimestre} />
                </Suspense>
              </Diapo>
              <Diapo>
                <Suspense fallback={<section className={carteVide}>Calcul du graphique KPI en cours...</section>}>
                  <DiapositiveKpiArretProduction code={trimestre.code} />
                </Suspense>
              </Diapo>
              <Diapo>
                <Suspense fallback={<section className={carteVide}>Calcul du graphique du coût du carton en cours...</section>}>
                  <DiapositiveKpiCoutCarton code={trimestre.code} />
                </Suspense>
              </Diapo>
            </Partie>

            <Partie id="swot">
              <Diapo>
                <DiapositiveSwot />
              </Diapo>
            </Partie>

            <Partie id="cloture">
              <Diapo>
                <DiapositiveFin />
              </Diapo>
            </Partie>
          </div>
        </div>
      </div>
    </main>
  );
}
