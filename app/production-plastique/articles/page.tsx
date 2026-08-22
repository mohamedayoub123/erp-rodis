import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchArticlesPlastique, normalizeCategoriePlastique } from "../shared";
import { updateArticlePlastiqueDepotAction } from "../actions";
import { SubmitButton } from "@/app/_components/submit-button";

const CATEGORIES_AFFICHEES = ["FLACON", "CAPSULE", "POTS", "TOPETTE"] as const;

type SearchParams = Promise<{ q?: string; categorie?: string }>;

export default async function ProductionPlastiqueArticlesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const categorieFilter = (params.categorie || "").trim();

  const [allArticles, depotsResult] = await Promise.all([
    fetchArticlesPlastique(),
    supabaseServer.from("depots").select("id, nom").order("nom", { ascending: true }),
  ]);
  const depots = ((depotsResult.data ?? []) as { id: number; nom: string }[]).map((d) => ({
    id: d.id,
    label: d.nom,
  }));
  const depotNomById = new Map(depots.map((d) => [d.id, d.label]));
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
              href="/production-plastique/articles"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>
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
                  <th className="px-6 py-3 font-semibold">Depot</th>
                  <th className="px-6 py-3 font-semibold">Recette</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-semibold text-slate-900">{article.nom_article}</td>
                    <td className="px-6 py-3 text-slate-600">{normalizeCategoriePlastique(article.categorie)}</td>
                    <td className="px-6 py-3 text-slate-600">{article.poids_net ?? "-"}</td>
                    <td className="px-6 py-3">
                      <details className="group">
                        <summary className="cursor-pointer text-slate-600 marker:content-none">
                          {article.depot_id ? depotNomById.get(article.depot_id) ?? `Depot #${article.depot_id}` : "-"}
                        </summary>
                        <form action={updateArticlePlastiqueDepotAction} className="mt-2 flex items-center gap-2">
                          <input type="hidden" name="article_id" value={article.id} />
                          <select
                            name="depot_id"
                            defaultValue={article.depot_id ? String(article.depot_id) : ""}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none"
                          >
                            <option value="">Sans depot</option>
                            {depots.map((depot) => (
                              <option key={depot.id} value={depot.id}>
                                {depot.label}
                              </option>
                            ))}
                          </select>
                          <SubmitButton
                            pendingLabel="..."
                            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                          >
                            OK
                          </SubmitButton>
                        </form>
                      </details>
                    </td>
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
