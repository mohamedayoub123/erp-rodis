import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canVoirPrixUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import {
  computeCoutReelArticle,
  fetchArticleIdsAvecProductionSurPeriode,
  type CoutReelPeriode,
} from "@/lib/cout-production-reel";
import { CoutReelTable, type CoutReelArticleRow } from "./cout-reel-table";

// Calcule le cout de PLUSIEURS articles (potentiellement des dizaines) sur
// une seule page - peut depasser la limite de temps par defaut d'une
// fonction Vercel (60s, maximum autorise sur le plan Hobby).
export const maxDuration = 60;

const CONCURRENCE = 4;

async function traiterAvecConcurrence<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await run(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCE, items.length) }, worker));
  return results;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { fromIso: from.toISOString().slice(0, 10), toIso: now.toISOString().slice(0, 10) };
}

export default async function CoutReelListePage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canVoirPrix = await canVoirPrixUser(currentUser);

  if (!canVoirPrix) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            La visibilite des prix est reservee - demande l&apos;acces a un administrateur si besoin.
          </section>
        </div>
      </main>
    );
  }

  const defaultRange = currentMonthRange();
  const periode: CoutReelPeriode = { dateFrom: defaultRange.fromIso, dateTo: defaultRange.toIso };

  const articleIds = await fetchArticleIdsAvecProductionSurPeriode(periode);

  const { data: articlesData } = articleIds.length
    ? await supabaseServer.from("articles").select("id, nom_article, nature").in("id", articleIds)
    : { data: [] };
  const articlesFinis = ((articlesData ?? []) as { id: number; nom_article: string; nature: string | null }[]).filter(
    (a) => a.nature !== "vrac"
  );

  const resultats = await traiterAvecConcurrence(articlesFinis, (article) =>
    computeCoutReelArticle(article.id, periode)
  );

  const rows: CoutReelArticleRow[] = resultats.map((result) => ({
    articleId: result.articleId,
    nomArticle: result.nomArticle,
    quantite: result.quantiteTotaleProduite,
    coutTotal: result.coutTotal,
    venteTotale: result.margeTotale !== null ? result.coutTotal + result.margeTotale : null,
    marge: result.margeTotale,
  }));
  rows.sort((a, b) => a.nomArticle.localeCompare(b.nomArticle, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Cout Reel</h1>
              <p className="mt-2 text-sm text-slate-600">
                Tous les articles avec une production reelle ce mois-ci ({defaultRange.fromIso} au{" "}
                {defaultRange.toIso}). Ecris un nom ou un code pour filtrer, clique une ligne pour le detail
                complet (electricite, journaliers, detail par mois...).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {rows.length === 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune production reelle enregistree ce mois-ci.
          </section>
        ) : (
          <CoutReelTable rows={rows} />
        )}
      </div>
    </main>
  );
}
