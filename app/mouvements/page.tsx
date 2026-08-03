import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";

export default function MouvementsHubPage() {
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
                Mouvements
              </h1>
            </div>

            <BackButton href="/" label="Retour accueil" />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/mouvements/produit-fini"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F4E6}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Mouvements Produit Fini</span>
            <span className="text-sm text-slate-600">
              Entrees/sorties de stock produit fini, codes TE/TS.
            </span>
          </Link>

          <Link
            href="/mouvements/matiere-premiere"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F9EA}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Mouvements Matiere Premiere</span>
            <span className="text-sm text-slate-600">
              A venir.
            </span>
          </Link>
        </section>
      </div>
    </main>
  );
}
