import { lireArticlesMpPourFormulaires } from "@/lib/articles-mp-liste";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { SortieMpClient } from "./sortie-client";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

// Les soldes par article + lot (fonction SQL stock_mp_lot_balances, la plus lourde de cette page) ne sont plus
// attendus avant l'affichage : le formulaire s'ouvre tout de suite avec les articles, et les lots arrivent juste
// apres (voir sortie-client.tsx et chargerLotsSortieMpAction). Ils ne sont recalcules que si le stock a change
// (voir lib/lot-balances-mp.ts).
export default async function MouvementsMatierePremiereSortiePage() {
  const currentStockUser = await getCurrentStockUser();
  const canWriteMouvements = await canWritePageUser(currentStockUser, "mouvementsMatierePremiereSortie");

  const articlesData = await lireArticlesMpPourFormulaires();

  const articles = articlesData.map((article) => ({
    id: article.id,
    label: article.nom_article,
    unite: article.unite || "",
  }));

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
                Sortie stock - Matiere Premiere
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/mouvements/matiere-premiere" label="Retour mouvements matiere premiere" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <SortieMpClient articles={articles} canWrite={canWriteMouvements} />
      </div>
    </main>
  );
}
