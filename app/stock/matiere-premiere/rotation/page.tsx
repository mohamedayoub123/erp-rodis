import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
  date_jour: string | null;
};

type RotationRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  stock_actuel: number;
  stock_moyen: number;
  consommation_12_mois: number;
  rotation: number | null;
  jours_couverture: number | null;
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, unite")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllMouvements() {
  const rows: MouvementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("article_id, qte_entree, qte_sortie, date_jour")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as MouvementRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type SearchParams = Promise<{ article?: string; categorie?: string }>;

export default async function RotationStockMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();
  const hasFilters = Boolean(articleFilter || categorieFilter);

  const [{ rows: articles, error: articlesError }, { rows: mouvements, error: mouvementsError }] =
    await Promise.all([fetchAllArticlesMp(), fetchAllMouvements()]);

  const error = articlesError || mouvementsError;

  // Stock actuel = somme entree-sortie de tous les mouvements de l'article
  // (meme calcul que Stock Actuel MP / Stock Alert MP). Consommation 12 mois
  // = sortie des 12 derniers mois seulement (date_jour, meme convention
  // "AAAA-MM-JJ" que le reste de l'appli - comparaison de chaines directe).
  // Stock avant 12 mois = solde des mouvements anterieurs au debut de la
  // periode (ou sans date, traites comme anterieurs) - sert a calculer un
  // stock moyen sur la periode plutot que le seul stock du jour.
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const twelveMonthsAgoIso = twelveMonthsAgo.toISOString().slice(0, 10);

  const stockByArticle = new Map<number, number>();
  const stockAvant12MoisByArticle = new Map<number, number>();
  const consommation12MoisByArticle = new Map<number, number>();
  for (const row of mouvements) {
    if (!row.article_id) continue;
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockByArticle.set(row.article_id, (stockByArticle.get(row.article_id) ?? 0) + mouvement);

    if (!row.date_jour || row.date_jour < twelveMonthsAgoIso) {
      stockAvant12MoisByArticle.set(
        row.article_id,
        (stockAvant12MoisByArticle.get(row.article_id) ?? 0) + mouvement
      );
    }

    if (row.date_jour && row.date_jour >= twelveMonthsAgoIso) {
      consommation12MoisByArticle.set(
        row.article_id,
        (consommation12MoisByArticle.get(row.article_id) ?? 0) + Number(row.qte_sortie ?? 0)
      );
    }
  }

  // Rotation = consommation des 12 derniers mois / stock MOYEN sur la
  // periode (moyenne entre le stock d'il y a 12 mois et le stock actuel) -
  // formule standard du taux de rotation, plus precise que de diviser par
  // le seul stock du jour (qui peut avoir beaucoup varie sur la periode).
  // Jours de couverture reste base sur le stock actuel : c'est bien "avec
  // ce qu'il reste aujourd'hui, combien de jours ca tient" a la vitesse
  // actuelle. Les deux restent "-" quand le calcul n'a pas de sens.
  const rotationRows: RotationRow[] = articles
    .map((article) => {
      const stockActuel = stockByArticle.get(article.id) ?? 0;
      const stockAvant12Mois = stockAvant12MoisByArticle.get(article.id) ?? 0;
      const stockMoyen = (stockAvant12Mois + stockActuel) / 2;
      const consommation = consommation12MoisByArticle.get(article.id) ?? 0;

      return {
        article_id: article.id,
        nom_article: article.nom_article,
        categorie: article.categorie,
        unite: article.unite,
        stock_actuel: stockActuel,
        stock_moyen: stockMoyen,
        consommation_12_mois: consommation,
        rotation: stockMoyen > 0 ? consommation / stockMoyen : null,
        jours_couverture: consommation > 0 ? (stockActuel * 365) / consommation : null,
      };
    })
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .sort((a, b) => (b.rotation ?? -1) - (a.rotation ?? -1));

  const articleOptions = [...new Set(articles.map((article) => article.nom_article))];
  const categorieOptions = [...new Set(articles.map((article) => article.categorie).filter(Boolean))] as string[];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf3_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Rotation de Stock MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Rotation = consommation des 12 derniers mois / stock moyen (moyenne entre le stock
              d&apos;il y a 12 mois et le stock actuel - combien de fois le stock a ete renouvele
              dans l&apos;annee). Jours de couverture = a la vitesse actuelle, combien de jours le
              stock restant tiendrait. Trie du plus rapide au plus lent.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              name="article"
              list="rotation-mp-articles"
              autoComplete="off"
              defaultValue={articleFilter}
              placeholder="Article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="rotation-mp-articles">
              {articleOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              type="text"
              name="categorie"
              list="rotation-mp-categories"
              autoComplete="off"
              defaultValue={params.categorie || ""}
              placeholder="Categorie..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="rotation-mp-categories">
              {categorieOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/matiere-premiere/rotation"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </a>
              ) : null}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : rotationRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun article pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Categorie</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="px-6 py-4 font-semibold">Stock moyen (12 mois)</th>
                    <th className="px-6 py-4 font-semibold">Consommation (12 mois)</th>
                    <th className="px-6 py-4 font-semibold">Rotation</th>
                    <th className="px-6 py-4 font-semibold">Jours de couverture</th>
                  </tr>
                </thead>
                <tbody>
                  {rotationRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.stock_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.stock_moyen)}</td>
                      <td className="px-6 py-4 font-semibold text-sky-700">
                        {formatNumber(row.consommation_12_mois)}
                      </td>
                      <td className="px-6 py-4">
                        {row.rotation === null ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                            {formatNumber(row.rotation)}x / an
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.jours_couverture === null ? "-" : `${formatNumber(row.jours_couverture)} j`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
