import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchArticlesPlastique } from "../shared";

export default async function ProductionPlastiqueArticlesPage() {
  noStore();

  const articles = await fetchArticlesPlastique();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                Production Plastique
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Articles</h1>
              <p className="mt-2 text-sm text-slate-600">
                Flacons, capsules et pots - fabriques en interne, jamais achetes.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {articles.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">Aucun article plastique trouve.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Article</th>
                  <th className="px-6 py-3 font-semibold">Categorie</th>
                  <th className="px-6 py-3 font-semibold">Poids net (grs)</th>
                  <th className="px-6 py-3 font-semibold">Recette</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-semibold text-slate-900">{article.nom_article}</td>
                    <td className="px-6 py-3 text-slate-600">{article.categorie || "-"}</td>
                    <td className="px-6 py-3 text-slate-600">{article.poids_net ?? "-"}</td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/production-plastique/recettes/${article.id}`}
                        className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
                      >
                        Voir la recette
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
