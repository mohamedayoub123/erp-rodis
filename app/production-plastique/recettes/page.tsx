import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchArticlesPlastique, normalizeCategoriePlastique } from "../shared";

const CATEGORIES_AFFICHEES = ["FLACON", "CAPSULE", "POTS", "TOPETTE"] as const;

type SearchParams = Promise<{ q?: string; categorie?: string }>;

export default async function RecettesPlastiqueListePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const categorieFilter = (params.categorie || "").trim();

  const allArticles = await fetchArticlesPlastique();
  const qWords = q.split(/\s+/).filter(Boolean);
  const articles = allArticles.filter((article) => {
    // Recherche sur le nom ET la categorie (normalisee) - un article "PET 150
    // ML BOTTLE ROYAL BLUE" ne contient jamais le mot "flacon" dans son nom,
    // mais sa categorie normalisee si (FLACON) : sans ca, chercher "flacon" le
    // ratait completement alors qu'il est bien dans la liste.
    const haystack = `${article.nom_article} ${normalizeCategoriePlastique(article.categorie)}`.toLowerCase();
    if (qWords.length > 0 && !qWords.every((word) => haystack.includes(word))) return false;
    if (categorieFilter && normalizeCategoriePlastique(article.categorie) !== categorieFilter) return false;
    return true;
  });

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

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Chercher un article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <select
              name="categorie"
              defaultValue={categorieFilter}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Toutes categories</option>
              {CATEGORIES_AFFICHEES.map((categorie) => (
                <option key={categorie} value={categorie}>
                  {categorie}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Filtrer
            </button>
            <Link
              href="/production-plastique/recettes"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>
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
                {normalizeCategoriePlastique(article.categorie)}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
