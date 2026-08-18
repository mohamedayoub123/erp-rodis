import Link from "next/link";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getPageViewMap } from "@/lib/stock-auth";

const TILES = [
  { label: "Dashboard", href: "/production/suivi/dashboard", pageKey: "productionSuiviDashboard" },
  { label: "Calendrier", href: "/production/suivi/calendrier", pageKey: "productionSuiviCalendrier" },
  { label: "Suivi par Etape", href: "/production/suivi/en-cours", pageKey: "productionSuiviEnCours" },
] as const;

export default async function SuiviProductionPage() {
  const currentUser = await getCurrentStockUser();
  const pageViewMap = await getPageViewMap(currentUser);
  const visibleTiles = TILES.filter((tile) => pageViewMap[tile.pageKey] ?? false);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Planning Production
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="flex flex-wrap gap-3">
          {visibleTiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex-1 rounded-[1.75rem] border border-black/5 bg-white p-6 text-center text-lg font-bold text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:border-sky-300"
            >
              {tile.label}
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
