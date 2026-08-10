import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

const TILES = [
  {
    label: "Stock Actuel",
    href: "/stock/stock-actuel",
    pageKey: "stockActuelPf",
    icon: "\u{1F4CB}",
    description: "Tous les articles avec leur stock actuel, filtre Article/Code/Categorie.",
  },
  {
    label: "Stock par Code",
    href: "/stock/rapport/code",
    pageKey: "stockCodePf",
    icon: "\u{1F3F7}\u{FE0F}",
    description: "Ecris un article : tous ses codes avec stock > 0, la quantite et la date de fabrication.",
  },
] as const;

export default async function RapportPfPage() {
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
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/gestion-stock-pf" label="Retour gestion stock PF" />
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
