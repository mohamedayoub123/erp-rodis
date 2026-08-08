import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

const TILES = [
  {
    label: "Stock",
    href: "/stock",
    pageKey: "stock",
    icon: "\u{1F4CA}",
    description: "Lots de stock, entrees/sorties, modifier ou supprimer.",
  },
  {
    label: "Rapport",
    href: "/stock/rapport",
    pageKey: "stockRapportPf",
    icon: "\u{1F4CB}",
    description: "Stock Actuel et autres rapports.",
  },
  {
    label: "Articles",
    href: "/articles",
    pageKey: "articlesHub",
    icon: "\u{1F4E6}",
    description: "Liste des articles produit fini et matiere premiere.",
  },
  {
    label: "Mouvements",
    href: "/mouvements",
    pageKey: "mouvementsHub",
    icon: "\u{1F4E6}",
    description: "Entrees/sorties, codes TE/TS.",
  },
  {
    label: "Commandes",
    href: "/commandes",
    pageKey: "commandesListe",
    icon: "\u{1F9FE}",
    description: "Liste des commandes clients.",
  },
  {
    label: "Tableau cmd",
    href: "/tableau-commandes",
    pageKey: "tableauCommandes",
    icon: "\u{1F5C2}\u{FE0F}",
    description: "Vue tableau combinee des commandes.",
  },
  {
    label: "Dormant",
    href: "/stock-dormant",
    pageKey: "stockDormant",
    icon: "\u{23F3}",
    description: "Stock dormant avec commande.",
  },
  {
    label: "Dormant sans cmd",
    href: "/stock-dormant-sans-commande",
    pageKey: "stockDormantSansCommande",
    icon: "\u{1F9CA}",
    description: "Stock dormant sans commande associee.",
  },
  {
    label: "Client",
    href: "/clients",
    pageKey: "clients",
    icon: "\u{1F464}",
    description: "Liste des clients.",
  },
  {
    label: "Statistique",
    href: "/statistique",
    pageKey: "statistiqueHub",
    icon: "\u{1F4C8}",
    description: "Statistiques de livraison et de stock.",
  },
] as const;

export default async function GestionStockPfPage() {
  const currentUser = await getCurrentStockUser();
  const pageViewMap = await getPageViewMap(currentUser);
  const visibleTiles = TILES.filter((tile) => pageViewMap[tile.pageKey] ?? false);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef5f0_0%,#f8fbf8_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Gestion Stock PF
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
