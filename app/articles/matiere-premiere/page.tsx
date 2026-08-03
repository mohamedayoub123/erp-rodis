import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { updateArticleMpAction } from "./actions";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

const PAGE_SIZE = 100;

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  gamme: string | null;
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, unite, gamme")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      return { rows, error };
    }

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

type SearchParams = Promise<{
  page?: string;
  q?: string;
  categorie?: string;
}>;

export default async function ArticlesMatierePremierePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const currentStockUser = await getCurrentStockUser();
  const canWriteArticles = await canWritePageUser(currentStockUser, "articlesMatierePremiereNouvelle");
  const canEditArticles = await canWritePageUser(currentStockUser, "articlesMatierePremiere");
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const q = (params.q || "").trim();
  const categorie = (params.categorie || "").trim();
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { rows: allArticles, error: fetchError } = await fetchAllArticlesMp();

  const qLower = q.toLowerCase();
  const categorieLower = categorie.toLowerCase();

  const filteredArticles = allArticles.filter((article) => {
    if (qLower && !String(article.nom_article ?? "").toLowerCase().includes(qLower)) return false;
    if (
      categorieLower &&
      !String(article.categorie ?? "").toLowerCase().includes(categorieLower)
    )
      return false;
    return true;
  });

  const totalArticles = filteredArticles.length;
  const totalPages = Math.max(1, Math.ceil(totalArticles / PAGE_SIZE));
  const articles = filteredArticles.slice(from, to + 1);
  const categorieOptions = [
    ...new Set(allArticles.map((article) => article.categorie).filter(Boolean)),
  ] as string[];
  const articleOptions = [...new Set(allArticles.map((article) => article.nom_article))];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Articles Matiere Premiere
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Article, categorie et unite viennent du fichier Excel. Gamme n&apos;existe pas dans
              le fichier - tu peux la remplir ici.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
            {canWriteArticles ? (
              <Link
                href="/articles/matiere-premiere/nouvelle"
                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
              >
                Ajouter article
              </Link>
            ) : null}
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 border-b border-slate-100 p-6 md:grid-cols-3">
            <input
              type="text"
              name="q"
              list="article-mp-options"
              autoComplete="off"
              defaultValue={q}
              placeholder="Rechercher un article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="article-mp-options">
              {articleOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              type="text"
              name="categorie"
              list="categorie-options"
              autoComplete="off"
              defaultValue={categorie}
              placeholder="Categorie..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <datalist id="categorie-options">
              {categorieOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
          </form>

          {fetchError ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {fetchError.message}
              </p>
            </div>
          ) : articles.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun article trouve pour le moment.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Article</th>
                      <th className="px-6 py-4 font-semibold">Categorie</th>
                      <th className="px-6 py-4 font-semibold">Unite</th>
                      <th className="px-6 py-4 font-semibold">Gamme</th>
                      {canEditArticles ? <th className="px-6 py-4 font-semibold">Modifier</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((article) => (
                      <tr key={article.id} className="border-t border-slate-100 align-top">
                        <td className="px-6 py-4 font-medium text-slate-900">{article.nom_article}</td>
                        <td className="px-6 py-4 text-slate-600">{article.categorie || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.unite || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{article.gamme || "-"}</td>
                        {canEditArticles ? (
                          <td className="px-6 py-4">
                            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                                Modifier
                              </summary>

                              <form action={updateArticleMpAction} className="mt-4 grid gap-3">
                                <input type="hidden" name="article_id" value={article.id} />
                                <input
                                  type="text"
                                  name="nom_article"
                                  defaultValue={article.nom_article}
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                  required
                                />
                                <input
                                  type="text"
                                  name="categorie"
                                  defaultValue={article.categorie || ""}
                                  placeholder="Categorie"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />
                                <input
                                  type="text"
                                  name="unite"
                                  defaultValue={article.unite || ""}
                                  placeholder="Unite"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />
                                <input
                                  type="text"
                                  name="gamme"
                                  defaultValue={article.gamme || ""}
                                  placeholder="Gamme"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />

                                <div>
                                  <button
                                    type="submit"
                                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                  >
                                    Enregistrer
                                  </button>
                                </div>
                              </form>
                            </details>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm">
                <p className="text-slate-500">
                  Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalArticles)} sur {totalArticles}
                </p>

                <div className="flex gap-3">
                  <Link
                    href={`/articles/matiere-premiere?page=1&q=${encodeURIComponent(q)}&categorie=${encodeURIComponent(categorie)}`}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Premiere
                  </Link>
                  <Link
                    href={`/articles/matiere-premiere?page=${Math.max(1, currentPage - 1)}&q=${encodeURIComponent(q)}&categorie=${encodeURIComponent(categorie)}`}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Precedent
                  </Link>
                  <Link
                    href={`/articles/matiere-premiere?page=${Math.min(totalPages, currentPage + 1)}&q=${encodeURIComponent(q)}&categorie=${encodeURIComponent(categorie)}`}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Suivant
                  </Link>
                  <Link
                    href={`/articles/matiere-premiere?page=${totalPages}&q=${encodeURIComponent(q)}&categorie=${encodeURIComponent(categorie)}`}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      currentPage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Derniere
                  </Link>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
