import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

const TILES = [
  {
    label: "Ecarts Production",
    href: "/production/rapport/ecarts",
    pageKey: "productionRapportEcarts",
    icon: "\u{1F4CA}",
    description: "Par code : vrac/carton demande vs fabrique, conditionnement vs emballage, statut.",
  },
  {
    label: "Temps d'Arret",
    href: "/production/rapport/temps-arret",
    pageKey: "productionRapportTempsArret",
    icon: "\u{23F1}\u{FE0F}",
    description: "Temps par cause d'arret, par chaine/zone/article, et temps de travail par code.",
  },
  {
    label: "Balance Matiere",
    href: "/production/rapport/balance-matiere",
    pageKey: "productionRapportBalanceMatiere",
    icon: "\u{2696}\u{FE0F}",
    description: "Par code : vrac fabrique vs carton fabrique converti en kg, et l'ecart matiere entre les deux.",
  },
  {
    label: "Rapport Carton",
    href: "/production/rapport/carton",
    pageKey: "productionRapportCarton",
    icon: "\u{1F4E6}",
    description: "Par code : carton commande vs carton reellement fabrique, avec KPI globaux.",
  },
] as const;

export default async function RapportPage() {
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
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
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
