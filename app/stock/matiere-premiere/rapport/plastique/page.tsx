import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { StatistiqueArticlePlastique } from "@/app/_components/statistique-article-plastique";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

type SearchParams = Promise<{ q?: string; categorie?: string }>;

export default async function StatistiqueArticlePlastiqueMpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "stockPlastiqueMp");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Statistique Article Plastique (E3)
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Flacon, flacon PET, pot, capsule, topette - stock actuel, stock min et stock max.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <StatistiqueArticlePlastique
          pageHref="/stock/matiere-premiere/rapport/plastique"
          canEdit={canEdit}
          searchParams={searchParams}
        />
      </div>
    </main>
  );
}
