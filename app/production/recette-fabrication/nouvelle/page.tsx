import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { NouvelleRecetteLignes } from "../nouvelle-recette-lignes";
import { createRecetteCompleteAction } from "../actions";

async function fetchArticlesVrac() {
  const rows: { id: number; nom_article: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article")
      .eq("nature", "vrac")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    rows.push(...((data ?? []) as { id: number; nom_article: string }[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllArticlesMp() {
  const rows: { id: number; nom_article: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    rows.push(...((data ?? []) as { id: number; nom_article: string }[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export default async function NouvelleRecetteFabricationPage() {
  noStore();

  const [{ rows: articlesVrac, error: articlesVracError }, { rows: articlesMp, error: articlesMpError }] =
    await Promise.all([fetchArticlesVrac(), fetchAllArticlesMp()]);

  const error = articlesVracError || articlesMpError;

  const pfOptions = articlesVrac
    .map((article) => ({ id: article.id, label: article.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const mpOptions = articlesMp
    .map((article) => ({ id: article.id, label: article.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Recette Fabrication
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Nouvelle recette
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Choisis le produit vrac, puis ajoute en dessous tous les articles MP (et leur
              quantite) qui composent sa formule.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/production/recette-fabrication" label="Retour" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error.message}
            </p>
          ) : (
            <form action={createRecetteCompleteAction} className="grid gap-6">
              <input type="hidden" name="page_key" value="recetteFabrication" />

              <div>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                  Produit vrac
                </h2>
                <ProduitPickerField articles={pfOptions} hiddenName="article_pf_id" textName="pf_produit" />
              </div>

              <div>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                  Articles MP de la formule
                </h2>
                <NouvelleRecetteLignes articles={mpOptions} uniteBase="kg" />
              </div>

              <div>
                <button
                  type="submit"
                  className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                >
                  Enregistrer la recette
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
