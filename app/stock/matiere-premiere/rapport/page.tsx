import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

const TILES = [
  {
    label: "Stock Actuel",
    href: "/stock/matiere-premiere/stock-actuel",
    pageKey: "stockActuelMp",
    icon: "\u{1F4CB}",
    description: "Tous les articles avec leur stock actuel, filtre Article/Code/Categorie, BC et import.",
  },
  {
    label: "Rotation de Stock",
    href: "/stock/matiere-premiere/rotation",
    pageKey: "stockRotationMp",
    icon: "\u{1F504}",
    description: "Vitesse de rotation de chaque article (consommation 12 mois / stock actuel) et jours de couverture.",
  },
  {
    label: "Stock Min Propose",
    href: "/stock/matiere-premiere/rapport/stock-min",
    pageKey: "stockMinProposeMp",
    icon: "\u{1F4C9}",
    description: "Stock min surdimensionne par rapport a la consommation reelle des 12 derniers mois.",
  },
  {
    label: "Besoin Commande",
    href: "/stock/matiere-premiere/rapport/commande",
    pageKey: "stockBesoinCommandeMp",
    icon: "\u{1F6D2}",
    description: "Consommation moyenne mensuelle et quantite a commander pour couvrir 6 mois, par article.",
  },
  {
    label: "Proposition de Commande",
    href: "/stock/matiere-premiere/rapport/proposition",
    pageKey: "stockPropositionCommandeMp",
    icon: "\u{2705}",
    description: "Choisis le mois : liste des articles ou le stock actuel ne suffit pas, avec la quantite a commander.",
  },
] as const;

export default async function RapportMpPage() {
  const currentUser = await getCurrentStockUser();
  const pageViewMap = await getPageViewMap(currentUser);
  const visibleTiles = TILES.filter((tile) => pageViewMap[tile.pageKey] ?? false);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleTiles.map((tile) => (
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
