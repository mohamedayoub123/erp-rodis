import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticlePfRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
};

type RecetteLigneRow = {
  article_pf_id: number;
};

async function fetchArticlesFini() {
  const rows: ArticlePfRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme")
      .neq("nature", "vrac")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ArticlePfRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchLigneCounts() {
  const rows: RecetteLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("recettes_pf")
      .select("article_pf_id")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as RecetteLigneRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

type SearchParams = Promise<{ q?: string }>;

export default async function RecetteConditionnementListPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim();
  const qLower = q.toLowerCase();

  const [{ rows: articles, error: articlesError }, { rows: lignes, error: lignesError }] = await Promise.all([
    fetchArticlesFini(),
    fetchLigneCounts(),
  ]);

  const error = articlesError || lignesError;

  const countByArticle = new Map<number, number>();
  for (const ligne of lignes) {
    countByArticle.set(ligne.article_pf_id, (countByArticle.get(ligne.article_pf_id) ?? 0) + 1);
  }

  // La liste ne montre que les produits qui ont deja une recette ajoutee -
  // pour creer une nouvelle recette on passe par "Ajouter une recette", pas
  // par ce tableau (qui contiendrait sinon tous les produits finis existants,
  // recette ou pas).
  const articlesAvecRecette = articles.filter((article) => (countByArticle.get(article.id) ?? 0) > 0);
  const filteredArticles = articlesAvecRecette
    .filter((article) => !qLower || matchesArticleSearch(article.nom_article, qLower))
    .sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Recette Conditionnement
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Liste des produits finis (article PF avec nature &quot;Fini&quot;). Choisis un produit
              pour voir/modifier sa formule : quels articles MP et en quelle quantite.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/production" label="Retour production" />
            <Link
              href="/production/recette-conditionnement/nouvelle"
              className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
            >
              Ajouter une recette
            </Link>
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="flex gap-3">
            <div className="flex-1">
              <SearchableFilterInput
                name="q"
                defaultValue={q}
                options={articlesAvecRecette.map((a) => ({ id: a.id, label: a.nom_article }))}
                placeholder="Rechercher un produit fini..."
              />
            </div>
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
            {q ? (
              <a
                href="/production/recette-conditionnement"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </a>
            ) : null}
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {q
                ? "Aucun resultat pour ce filtre."
                : "Aucune recette ajoutee pour le moment - clique sur \"Ajouter une recette\"."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Produit fini</th>
                    <th className="px-6 py-4 font-semibold">Gamme</th>
                    <th className="px-6 py-4 font-semibold">Articles MP dans la formule</th>
                    <th className="px-6 py-4 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArticles.map((article) => (
                    <tr key={article.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{article.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{article.gamme || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{countByArticle.get(article.id) ?? 0}</td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/production/recette-conditionnement/${article.id}`}
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Voir la recette
                        </Link>
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
