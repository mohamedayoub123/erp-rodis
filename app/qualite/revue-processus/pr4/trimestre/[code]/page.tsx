import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { trouverTrimestrePr4 } from "@/lib/trimestres-pr4";

// Page d'un trimestre de la Revue Processus PR4 (ex: PR4 T1 2026 = janvier a mars 2026). Meme droit que la page
// /qualite/revue-processus (qualiteRevueProcessus). Le contenu du trimestre sera ajoute ici.
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
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">Revue Processus</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{trimestre.libelle}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {trimestre.periode}
                {trimestre.enCours ? " - trimestre en cours" : ""}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite/revue-processus" label="Retour revue processus" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-dashed border-violet-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
          Contenu a venir : les elements de {trimestre.libelle} seront ajoutes ici.
        </section>
      </div>
    </main>
  );
}
