import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { RecetteConditionnementFormulaire } from "../recette-conditionnement-formulaire";
import { createRecetteCompleteAction } from "../../recette-fabrication/actions";
import { SubmitButton } from "@/app/_components/submit-button";

type ArticleFiniRow = {
  id: number;
  nom_article: string;
  contenance: number | null;
  piece_par_carton: number | null;
  dispenseur_pcs_carton: number | null;
};

async function fetchArticlesFini() {
  const rows: ArticleFiniRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, contenance, piece_par_carton, dispenseur_pcs_carton")
      .neq("nature", "vrac")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    rows.push(...((data ?? []) as ArticleFiniRow[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

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

export default async function NouvelleRecetteConditionnementPage() {
  noStore();

  const [
    { rows: articlesFini, error: articlesFiniError },
    { rows: articlesVrac, error: articlesVracError },
    { rows: articlesMp, error: articlesMpError },
  ] = await Promise.all([fetchArticlesFini(), fetchArticlesVrac(), fetchAllArticlesMp()]);

  const error = articlesFiniError || articlesVracError || articlesMpError;

  const pfOptions = articlesFini
    .map((article) => ({
      id: article.id,
      label: article.nom_article,
      contenance: article.contenance,
      piecePartCarton: article.piece_par_carton,
      dispenseurPcsCarton: article.dispenseur_pcs_carton,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const vracOptions = articlesVrac
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
              Recette Conditionnement
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Nouvelle recette
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Choisis le produit fini, le vrac utilise et le nombre de cartons du lot, puis ajoute
              en dessous tous les articles MP (et leur quantite) qui composent la formule.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/production/recette-conditionnement" label="Retour" />
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
              <input type="hidden" name="page_key" value="recetteConditionnement" />
              <RecetteConditionnementFormulaire pfArticles={pfOptions} vracArticles={vracOptions} mpArticles={mpOptions} />
              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                >
                  Enregistrer la recette
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
