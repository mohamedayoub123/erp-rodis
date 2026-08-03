import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

export default function RapportPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/production/rapport/ecarts"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F4CA}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Ecarts Production</span>
            <span className="text-sm text-slate-600">
              Par code : vrac/carton demande vs fabrique, conditionnement vs emballage, statut.
            </span>
          </Link>

          <Link
            href="/production/rapport/temps-arret"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{23F1}\u{FE0F}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Temps d&apos;Arret</span>
            <span className="text-sm text-slate-600">
              Temps par cause d&apos;arret, par chaine/zone/article, et temps de travail par code.
            </span>
          </Link>
        </section>
      </div>
    </main>
  );
}
