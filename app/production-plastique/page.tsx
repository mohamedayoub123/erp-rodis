import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

const TILES = [
  {
    label: "Articles",
    href: "/production-plastique/articles",
    icon: "\u{1F9F4}",
    description: "Flacons, capsules, pots - fabriques en interne, jamais achetes.",
  },
  {
    label: "Recette Plastique",
    href: "/production-plastique/recettes",
    icon: "\u{1F9EA}",
    description: "Composition en % (matiere plastique + colorant) et prix de revient d'1 piece.",
  },
  {
    label: "Ajouter Programme",
    href: "/production-plastique/programme",
    icon: "\u{1F4E5}",
    description: "Article + quantite (+ lot optionnel) - entre en stock et se transfere directement.",
  },
  {
    label: "Historique Matiere Utilisee",
    href: "/production-plastique/historique-matiere",
    icon: "\u{1F9EE}",
    description: "Par code : quelle resine/colorant, quelle quantite, quel lot et quel prix.",
  },
  {
    label: "Statistique Article Plastique (E3)",
    href: "/production-plastique/statistique",
    icon: "\u{1F9F4}",
    description: "Flacon, flacon PET, pot, capsule, topette - stock actuel, stock min et stock max.",
  },
  {
    label: "Commandes Article Plastique",
    href: "/production-plastique/commandes",
    icon: "\u{1F4CB}",
    description: "Enregistrees depuis Statistique Article Plastique (E3) via Save.",
  },
] as const;

export default function ProductionPlastiquePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
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
                Flacons, capsules, pots fabriques en interne.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
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
      </div>
    </main>
  );
}
