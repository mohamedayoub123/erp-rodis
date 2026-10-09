import { Suspense } from "react";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { trouverTrimestrePr4 } from "@/lib/trimestres-pr4";
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
// /qualite/revue-processus (qualiteRevueProcessus). En tete : la page de garde du rapport (annee / trimestre
// de la page ouverte), puis ses diapositives ; la suite sera ajoutee en dessous.
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
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">Revue Processus</p>
            <p className="mt-1 text-sm text-slate-600">
              {trimestre.libelle} - {trimestre.periode}
              {trimestre.enCours ? " (trimestre en cours)" : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/qualite/revue-processus/pr4/trimestre" label="Retour trimestres" />
            <RefreshButton />
          </div>
        </section>

        <PageDeGardePr4 trimestre={trimestre} />
        <DiapositiveObjectifPr4 />
        <DiapositiveOrganigrammePr4 />
        <GrilleProcedures procedures={PROCEDURES} />
        <Suspense
          fallback={
            <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              Calcul des indicateurs en cours...
            </section>
          }
        >
          <DiapositiveIndicateursPr4 annee={trimestre.annee} trimestre={trimestre.trimestre} />
        </Suspense>
        <Suspense fallback={<section className="rounded-[1.75rem] border border-black/5 bg-white p-6 text-sm text-slate-500">Calcul des graphiques KPI en cours...</section>}>
          <DiapositiveKpiArretProduction annee={trimestre.annee} trimestre={trimestre.trimestre} />
          <DiapositiveKpiCoutCarton annee={trimestre.annee} trimestre={trimestre.trimestre} />
        </Suspense>
        <DiapositiveSwot />
        <DiapositiveFin />

        <section className="rounded-[1.75rem] border border-dashed border-violet-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
          Contenu a venir : les autres pages de {trimestre.libelle} seront ajoutees ici.
        </section>
      </div>
    </main>
  );
}
