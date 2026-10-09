import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { listerTrimestresPr4 } from "@/lib/trimestres-pr4";

// Accueil Revue Processus : conteneur pour les differentes revues (PR4
// aujourd'hui, d'autres PR pourront s'ajouter plus tard) - meme droit que
// la page /qualite/revue-processus elle-meme (qualiteRevueProcessus), pas
// de pageKey separee par revue pour l'instant.
const TILES = [
  {
    label: "PR4 - Indicateurs Cosmetique",
    href: "/qualite/revue-processus/pr4",
    icon: "\u{1F4C8}",
    description: "Tableau des 13 indicateurs (production, qualite, energie) par mois, cible et calcul automatique.",
  },
];

export default function RevueProcessusPage() {
  // La liste des trimestres depend de la date du jour : jamais figee a la compilation.
  noStore();
  const trimestres = listerTrimestresPr4();
  const annees = [...new Set(trimestres.map((t) => t.annee))];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Revue Processus</h1>
              <p className="mt-2 text-sm text-slate-600">Choisis la revue de processus que tu veux ouvrir.</p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite" label="Retour qualite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group flex flex-col gap-3 rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
            >
              <span className="text-4xl" aria-hidden="true">
                {tile.icon}
              </span>
              <span className="text-lg font-bold text-slate-900">{tile.label}</span>
              <span className="text-sm text-slate-600">{tile.description}</span>
            </Link>
          ))}
        </section>

        <section className="space-y-4 rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900">PR4 par trimestre</h2>
            <p className="mt-1 text-sm text-slate-600">
              T1 = janvier a mars, T2 = avril a juin, T3 = juillet a septembre, T4 = octobre a decembre. Un nouveau
              trimestre apparait tout seul des que ses 3 mois commencent.
            </p>
          </div>

          {annees.map((annee) => (
            <div key={annee} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">{annee}</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {trimestres
                  .filter((t) => t.annee === annee)
                  .map((t) => (
                    <Link
                      key={t.code}
                      href={`/qualite/revue-processus/pr4/trimestre/${t.code}`}
                      className="group flex flex-col gap-1 rounded-2xl border border-violet-100 bg-violet-50/40 p-4 transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-slate-900">{t.libelle}</span>
                        {t.enCours ? (
                          <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                            En cours
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-slate-600">{t.periode}</span>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
