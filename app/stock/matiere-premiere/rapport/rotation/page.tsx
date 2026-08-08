import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { matchesArticleSearch } from "@/lib/article-search";
import { applyProposedMinStockAction } from "./actions";

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  min_stock: number | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_sortie: number;
  date_jour: string | null;
};

type RotationRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  min_actuel: number;
  consommation_12_mois: number;
  nouveau_min_propose: number;
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, unite, min_stock")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchMouvementsSince(sinceDate: string) {
  const rows: MouvementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("article_id, qte_sortie, date_jour")
      .gte("date_jour", sinceDate)
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

export default async function RapportRotationMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const categorieFilter = (params.categorie || "").trim().toLowerCase();
  const hasFilters = Boolean(articleFilter || categorieFilter);

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "articlesMatierePremiere");

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const sinceDate = twelveMonthsAgo.toISOString().slice(0, 10);

  const [{ rows: articles, error: articlesError }, { rows: mouvements, error: mouvementsError }] =
    await Promise.all([fetchAllArticlesMp(), fetchMouvementsSince(sinceDate)]);

  const error = articlesError || mouvementsError;

  // Consommation 12 mois = somme des sorties des 12 derniers mois. Le
  // Stock min d'un article est dimensionne pour couvrir 3 mois de besoin
  // (convention de l'entreprise) - on compare donc au quart de cette
  // consommation annuelle (equivalent 3 mois), pas au total 12 mois.
  const consommationByArticle = new Map<number, number>();
  for (const row of mouvements) {
    if (!row.article_id) continue;
    consommationByArticle.set(
      row.article_id,
      (consommationByArticle.get(row.article_id) ?? 0) + Number(row.qte_sortie ?? 0)
    );
  }

  const rotationRows: RotationRow[] = [];
  for (const article of articles) {
    const minActuel = article.min_stock;
    if (minActuel === null || minActuel <= 0) continue;

    const consommation12Mois = consommationByArticle.get(article.id) ?? 0;
    const nouveauMinPropose = consommation12Mois / 4;

    if (nouveauMinPropose >= minActuel) continue;

    rotationRows.push({
      article_id: article.id,
      nom_article: article.nom_article,
      categorie: article.categorie,
      unite: article.unite,
      min_actuel: minActuel,
      consommation_12_mois: consommation12Mois,
      nouveau_min_propose: Math.round(nouveauMinPropose * 100) / 100,
    });
  }

  // Le plus gros ecart (min actuel - nouveau min propose) en premier - ce
  // sont les articles ou le Stock min est le plus surdimensionne par
  // rapport a la vraie consommation.
  const filteredRows = rotationRows
    .filter((row) => !articleFilter || matchesArticleSearch(row.nom_article, articleFilter))
    .filter((row) => !categorieFilter || (row.categorie || "").toLowerCase().includes(categorieFilter))
    .sort(
      (a, b) =>
        b.min_actuel - b.nouveau_min_propose - (a.min_actuel - a.nouveau_min_propose)
    );

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
              Rapport Rotation MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Le Stock min d&apos;un article est dimensionne pour 3 mois de besoin. Articles dont
              la consommation reelle des 12 derniers mois (ramenee a 3 mois) est plus basse que ce
              Stock min - avec une nouvelle proposition de min a jour.
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
                  href="/stock/matiere-premiere/rapport/rotation"
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
          ) : filteredRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters
                ? "Aucun resultat pour ce filtre."
                : "Aucun article dont la consommation est en dessous du Stock min pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Categorie</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Stock min actuel</th>
                    <th className="px-6 py-4 font-semibold">Consommation 12 mois</th>
                    <th className="px-6 py-4 font-semibold">Nouveau min propose (3 mois)</th>
                    {canEdit ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.categorie || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.min_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.consommation_12_mois)}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                          {formatNumber(row.nouveau_min_propose)}
                        </span>
                      </td>
                      {canEdit ? (
                        <td className="px-6 py-4">
                          <form action={applyProposedMinStockAction}>
                            <input type="hidden" name="article_id" value={row.article_id} />
                            <input type="hidden" name="nouveau_min" value={row.nouveau_min_propose} />
                            <button
                              type="submit"
                              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Appliquer
                            </button>
                          </form>
                        </td>
                      ) : null}
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
