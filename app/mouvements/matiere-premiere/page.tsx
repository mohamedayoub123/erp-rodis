import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";

export default function MouvementsMatierePremierePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Mouvements Matiere Premiere
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                TE = entree, TS = sortie. En attente de configuration des formulaires.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BackButton href="/mouvements" label="Retour mouvements" />
              <Link
                href="/mouvements/matiere-premiere/entree"
                className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white"
              >
                Entrer
              </Link>
              <Link
                href="/mouvements/matiere-premiere/sortie"
                className="rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white"
              >
                Sortie
              </Link>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="p-6 text-sm text-slate-500">Aucun mouvement enregistre.</div>
        </section>
      </div>
    </main>
  );
}
