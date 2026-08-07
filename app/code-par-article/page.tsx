import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { familyRank, articleTypeRank, articleContenanceFromName } from "@/lib/gamme-families";
import { CodeParArticleFilterForm } from "./filter-form";
import { RefreshButton } from "@/app/_components/refresh-button";
import { BackButton } from "@/app/_components/back-button";
import { CodeCell } from "./code-cell";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
  code_auto: string | null;
  code_manu: string | null;
};

async function fetchAllArticles(): Promise<ArticleRow[]> {
  const rows: ArticleRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme, code_auto, code_manu")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ArticleRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type SearchParams = Promise<{
  article?: string;
  gamme?: string;
  code_auto?: string;
  code_manu?: string;
}>;

export default async function CodeParArticlePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "codeParArticle");
  const allArticles = await fetchAllArticles();

  const article = (params.article || "").trim();
  const gamme = (params.gamme || "").trim();
  const codeAuto = (params.code_auto || "").trim();
  const codeManu = (params.code_manu || "").trim();

  const articleLower = article.toLowerCase();
  const gammeLower = gamme.toLowerCase();
  const codeAutoLower = codeAuto.toLowerCase();
  const codeManuLower = codeManu.toLowerCase();

  const filteredArticles = allArticles.filter((row) => {
    if (articleLower && !matchesArticleSearch(row.nom_article, articleLower)) return false;
    if (gammeLower && !String(row.gamme ?? "").toLowerCase().includes(gammeLower)) return false;
    if (codeAutoLower && !String(row.code_auto ?? "").toLowerCase().includes(codeAutoLower)) return false;
    if (codeManuLower && !String(row.code_manu ?? "").toLowerCase().includes(codeManuLower)) return false;
    return true;
  });

  // Meme ordre que /articles et /tableau-commandes : familles (White Secret
  // en premier), puis type d'article, puis contenance decroissante, puis
  // alphabetique.
  const articles = [...filteredArticles].sort((a, b) => {
    const rankA = familyRank(a.gamme);
    const rankB = familyRank(b.gamme);
    if (rankA !== rankB) return rankA - rankB;

    const typeRankA = articleTypeRank(a.nom_article);
    const typeRankB = articleTypeRank(b.nom_article);
    if (typeRankA !== typeRankB) return typeRankA - typeRankB;

    const contenanceDiff = articleContenanceFromName(b.nom_article) - articleContenanceFromName(a.nom_article);
    if (contenanceDiff !== 0) return contenanceDiff;

    return a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" });
  });

  const articleOptions = [...new Set(allArticles.map((row) => row.nom_article))];
  const gammeOptions = [...new Set(allArticles.map((row) => row.gamme).filter(Boolean))] as string[];
  const codeAutoOptions = [...new Set(allArticles.map((row) => row.code_auto).filter(Boolean))] as string[];
  const codeManuOptions = [...new Set(allArticles.map((row) => row.code_manu).filter(Boolean))] as string[];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Code par article
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <CodeParArticleFilterForm
            defaultArticle={article}
            defaultGamme={gamme}
            defaultCodeAuto={codeAuto}
            defaultCodeManu={codeManu}
            articleOptions={articleOptions}
            gammeOptions={gammeOptions}
            codeAutoOptions={codeAutoOptions}
            codeManuOptions={codeManuOptions}
          />

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">Gamme</th>
                  <th className="px-4 py-3 font-semibold">Code auto</th>
                  <th className="px-4 py-3 font-semibold">Code manuel</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.nom_article}</td>
                    <td className="px-4 py-3 text-slate-600">{row.gamme || "-"}</td>
                    {canEdit ? (
                      <>
                        <td className="px-4 py-3">
                          <CodeCell
                            articleId={row.id}
                            field="code_auto"
                            initialValue={row.code_auto || ""}
                            placeholder="Code auto"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <CodeCell
                            articleId={row.id}
                            field="code_manu"
                            initialValue={row.code_manu || ""}
                            placeholder="Code manuel"
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-slate-600">{row.code_auto || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{row.code_manu || "-"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
