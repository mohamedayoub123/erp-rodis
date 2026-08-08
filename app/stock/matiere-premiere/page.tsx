import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

const TILES = [
  {
    label: "Stock",
    href: "/stock/matiere-premiere/stock",
    pageKey: "stockMatierePremiere",
    icon: "\u{1F4CA}",
    description: "Suivi du stock matiere premiere.",
  },
  {
    label: "Mouvement",
    href: "/mouvements/matiere-premiere",
    pageKey: "mouvementsMatierePremiere",
    icon: "\u{1F4E6}",
    description: "Entrees/sorties de matiere premiere.",
  },
  {
    label: "Article",
    href: "/articles/matiere-premiere",
    pageKey: "articlesMatierePremiere",
    icon: "\u{1F9EA}",
    description: "Liste des articles matiere premiere.",
  },
  {
    label: "Stock Alert",
    href: "/stock/matiere-premiere/alerte",
    pageKey: "stockAlerteMp",
    icon: "\u{26A0}\u{FE0F}",
    description: "Articles sous le seuil d'alerte.",
  },
  {
    label: "Stock Actuel",
    href: "/stock/matiere-premiere/stock-actuel",
    pageKey: "stockActuelMp",
    icon: "\u{1F4CB}",
    description: "Tous les articles avec leur stock actuel.",
  },
  {
    label: "Stock Dormant",
    href: "/stock/matiere-premiere/dormant",
    pageKey: "stockDormantMp",
    icon: "\u{23F3}",
    description: "En attente de configuration.",
  },
  {
    label: "Statistique",
    href: "/stock/matiere-premiere/statistique",
    pageKey: "statistiqueMp",
    icon: "\u{1F4C8}",
    description: "En attente de configuration.",
  },
  {
    label: "Stock Perime",
    href: "/stock/matiere-premiere/perime",
    pageKey: "stockPerimeMp",
    icon: "\u{1F6D1}",
    description: "Lots perimes et actifs par article.",
  },
  {
    label: "Import",
    href: "/stock/matiere-premiere/commande",
    pageKey: "commandeMp",
    icon: "\u{1F4E5}",
    description: "Suivi des commandes matiere premiere.",
  },
  {
    label: "Commande",
    href: "/stock/matiere-premiere/bc",
    pageKey: "commandeBcMp",
    icon: "\u{1F9FE}",
    description: "Bons de commande (BC) : article, quantite, statut.",
  },
] as const;

export default async function StockMatierePremierePage() {
  const currentUser = await getCurrentStockUser();
  const pageViewMap = await getPageViewMap(currentUser);
  const visibleTiles = TILES.filter((tile) => pageViewMap[tile.pageKey] ?? false);

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
                Gestion Stock MP
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Choisis la page que tu veux ouvrir.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
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
