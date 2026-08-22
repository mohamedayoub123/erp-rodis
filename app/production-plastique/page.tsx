import { BackButton } from "@/app/_components/back-button";

// Module vide pour l'instant - rien construit encore, sert juste de point
// d'entree/reserve d'acces (voir lib/page-registry.ts, cle
// "productionPlastique") en attendant de definir le contenu reel.
export default function ProductionPlastiquePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Production Plastique
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Module pas encore construit - rien pour l&apos;instant.
              </p>
            </div>

            <BackButton href="/" label="Retour accueil" />
          </div>
        </section>
      </div>
    </main>
  );
}
