import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { trouverTrimestrePr4 } from "@/lib/trimestres-pr4";
import { PageDeGardePr4 } from "./page-de-garde";

// Page d'un trimestre de la Revue Processus PR4 (ex: PR4 T1 2026 = janvier a mars 2026). Meme droit que la page
// /qualite/revue-processus (qualiteRevueProcessus). En tete : la page de garde du rapport (annee / trimestre
// de la page ouverte) ; le contenu du trimestre sera ajoute en dessous.
export default async function TrimestrePr4Page({ params }: { params: Promise<{ code: string }> }) {
  noStore();
  const { code } = await params;
  const trimestre = trouverTrimestrePr4(code);
  if (!trimestre) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">Revue Processus</p>
            <p className="mt-1 text-sm text-slate-600">
              {trimestre.libelle} - {trimestre.periode}
              {trimestre.enCours ? " (trimestre en cours)" : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/qualite/revue-processus" label="Retour revue processus" />
            <RefreshButton />
          </div>
        </section>

        <PageDeGardePr4 trimestre={trimestre} />

        <section className="rounded-[1.75rem] border border-dashed border-violet-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
          Contenu a venir : les elements de {trimestre.libelle} seront ajoutes ici.
        </section>
      </div>
    </main>
  );
}
