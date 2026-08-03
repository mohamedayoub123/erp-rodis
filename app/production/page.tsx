import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";

export default function ProductionPage() {
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
                Production
              </h1>
            </div>

            <BackButton href="/" label="Retour accueil" />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/production/suivi"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F4CB}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Planning Production</span>
            <span className="text-sm text-slate-600">
              Suis l&apos;avancement reel par ligne : vrac termine, cartons produits jour par jour.
            </span>
          </Link>

          <Link
            href="/production/suivi-production"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F4CA}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Suivi Production</span>
            <span className="text-sm text-slate-600">
              Rapports de poste : equipe, dechets, arrets, cadence, poids reel.
            </span>
          </Link>

          <Link
            href="/programe-par-ligne"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F5D3}\u{FE0F}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Programme par ligne</span>
            <span className="text-sm text-slate-600">
              Planning du jour par zone/chaine : produit, qt carton, vrac a fabriquer, plateforme.
            </span>
          </Link>

          <Link
            href="/historique-programme"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F4DC}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Historique programme</span>
            <span className="text-sm text-slate-600">
              Retrouve les programmes deja enregistres (MB1, MB2...).
            </span>
          </Link>

          <Link
            href="/ravitailleur-par-ligne"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F9CD}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Ravitailleur par ligne</span>
            <span className="text-sm text-slate-600">
              Assigne la personne qui approvisionne chaque zone/chaine.
            </span>
          </Link>

          <Link
            href="/historique-programme-dispatcher"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F4D1}"}
            </span>
            <span className="text-lg font-bold text-slate-900">
              Historique Programme Dispatcher
            </span>
            <span className="text-sm text-slate-600">
              Retrouve les enregistrements pris depuis Programme Dispatcher (PD1, PD2...).
            </span>
          </Link>

          <Link
            href="/code-par-article"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F3F7}\u{FE0F}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Code par article</span>
            <span className="text-sm text-slate-600">
              Code auto et code manuel de chaque article, modifiables directement ici.
            </span>
          </Link>

          <Link
            href="/production/rapport"
            className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-4xl" aria-hidden="true">
              {"\u{1F4C4}"}
            </span>
            <span className="text-lg font-bold text-slate-900">Rapport</span>
            <span className="text-sm text-slate-600">Tous les rapports de production.</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
