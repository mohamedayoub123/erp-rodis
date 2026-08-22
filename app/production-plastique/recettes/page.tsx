import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchArticlesPlastique } from "../shared";

export default async function RecettesPlastiqueListePage() {
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
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Recette Plastique</h1>
              <p className="mt-2 text-sm text-slate-600">
                Choisis un article pour voir/modifier sa composition (matiere plastique + colorant, en %).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/production-plastique/recettes/${article.id}`}
              className="flex items-center justify-between rounded-2xl border border-black/5 bg-white px-5 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.1)]"
            >
              <span className="font-semibold text-slate-900">{article.nom_article}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {article.categorie}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
