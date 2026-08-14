import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { AjouterArticleFormulaire } from "../ajouter-article-formulaire";
import {
  addRecetteOuVracAction,
  updateRecetteLigneAction,
  deleteRecetteLigneAction,
  updateQuantiteBaseAction,
} from "../../recette-fabrication/actions";
import { SubmitButton } from "@/app/_components/submit-button";

type ArticlePfRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
  nature: string | null;
  quantite_recette_base: number | null;
  vrac_article_id: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
  dispenseur_pcs_carton: number | null;
};

type ArticleMpRow = {
  id: number;
  nom_article: string;
  unite: string | null;
};

type RecetteLigneRow = {
  id: number;
  article_pf_id: number;
  article_mp_id: number;
  quantite: number;
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, unite")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
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

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export default async function RecetteConditionnementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const articlePfId = Number(id);

  const { data: articlePf } = await supabaseServer
    .from("articles")
    .select(
      "id, nom_article, gamme, nature, quantite_recette_base, vrac_article_id, contenance, piece_par_carton, dispenseur_pcs_carton"
    )
    .eq("id", articlePfId)
    .maybeSingle();

  if (!articlePf || (articlePf as ArticlePfRow).nature === "vrac") {
    notFound();
  }

  const [
    { data: lignesData, error: lignesError },
    { rows: articlesMp, error: articlesMpError },
    { rows: articlesVrac, error: articlesVracError },
  ] = await Promise.all([
    supabaseServer
      .from("recettes_pf")
      .select("id, article_pf_id, article_mp_id, quantite")
      .eq("article_pf_id", articlePfId)
      .order("id", { ascending: true }),
    fetchAllArticlesMp(),
    fetchArticlesVrac(),
  ]);

  const error = lignesError || articlesMpError || articlesVracError;
  const vracOptions = articlesVrac
    .map((article) => ({ id: article.id, label: article.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const vracActuel = articlesVrac.find((article) => article.id === (articlePf as ArticlePfRow).vrac_article_id) ?? null;
  const lignes = (lignesData ?? []) as RecetteLigneRow[];
  const mpById = new Map(articlesMp.map((article) => [article.id, article]));
  const mpOptions = articlesMp
    .map((article) => ({ id: article.id, label: article.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  const usedMpIds = new Set(lignes.map((ligne) => ligne.article_mp_id));
  const quantiteBase = (articlePf as ArticlePfRow).quantite_recette_base;
  const { contenance, piece_par_carton: piecePartCarton, dispenseur_pcs_carton: dispenseurPcsCarton } =
    articlePf as ArticlePfRow;
  // "Nombre de cartons du lot" pas encore rempli -> calcule quand meme pour
  // 1 carton, pour ne pas laisser le vrac affiche a vide.
  const qtVracNecessaire =
    contenance && piecePartCarton
      ? round((quantiteBase || 1) * piecePartCarton * contenance, 3)
      : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Recette Conditionnement
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {(articlePf as ArticlePfRow).nom_article}
            </h1>
            {(articlePf as ArticlePfRow).gamme ? (
              <p className="mt-1 text-sm text-slate-600">{(articlePf as ArticlePfRow).gamme}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/production/recette-conditionnement" label="Retour" />
            <RefreshButton />
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Quantite du lot
          </h2>
          <form action={updateQuantiteBaseAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="page_key" value="recetteConditionnement" />
            <input type="hidden" name="article_pf_id" value={articlePfId} />
            <input type="hidden" name="vrac_article_id" value={vracActuel?.id ?? ""} />
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Nombre de cartons du lot
              <input
                type="number"
                step="0.001"
                min="0"
                name="quantite_recette_base"
                defaultValue={quantiteBase ?? ""}
                placeholder="Ex: 100"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <SubmitButton
              pendingLabel="Enregistrement..."
              className="rounded-full bg-slate-900 px-4 py-3 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Enregistrer
            </SubmitButton>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : lignes.length === 0 && !vracActuel ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun article dans la formule pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Quantite</th>
                    <th className="px-6 py-4 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {vracActuel ? (
                    <tr className="border-t border-slate-100 bg-sky-50/40">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {vracActuel.nom_article} <span className="text-xs text-sky-700">(vrac)</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">kg</td>
                      <td className="px-6 py-4 text-slate-700">
                        {qtVracNecessaire !== null
                          ? qtVracNecessaire.toLocaleString("fr-FR", { maximumFractionDigits: 3 })
                          : "-"}
                        <span className="ml-2 text-xs text-slate-400">(auto)</span>
                      </td>
                      <td className="px-6 py-4">
                        <form action={updateQuantiteBaseAction}>
                          <input type="hidden" name="page_key" value="recetteConditionnement" />
                          <input type="hidden" name="article_pf_id" value={articlePfId} />
                          <input type="hidden" name="quantite_recette_base" value={quantiteBase ?? ""} />
                          <SubmitButton
                            pendingLabel="Retrait..."
                            className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                          >
                            Retirer
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                  {lignes.map((ligne) => {
                    const articleMp = mpById.get(ligne.article_mp_id);
                    return (
                      <tr key={ligne.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {articleMp?.nom_article || `Article #${ligne.article_mp_id}`}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{articleMp?.unite || "-"}</td>
                        <td className="px-6 py-4">
                          <form action={updateRecetteLigneAction} className="flex items-center gap-2">
                            <input type="hidden" name="page_key" value="recetteConditionnement" />
                            <input type="hidden" name="ligne_id" value={ligne.id} />
                            <input type="hidden" name="article_pf_id" value={articlePfId} />
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              name="quantite"
                              defaultValue={ligne.quantite}
                              placeholder="Quantite"
                              required
                              className="w-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                            />
                            <SubmitButton
                              pendingLabel="Enregistrement..."
                              className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Enregistrer
                            </SubmitButton>
                          </form>
                        </td>
                        <td className="px-6 py-4">
                          <form action={deleteRecetteLigneAction}>
                            <input type="hidden" name="page_key" value="recetteConditionnement" />
                            <input type="hidden" name="ligne_id" value={ligne.id} />
                            <input type="hidden" name="article_pf_id" value={articlePfId} />
                            <SubmitButton
                              pendingLabel="Suppression..."
                              className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                            >
                              Supprimer
                            </SubmitButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Ajouter un article a la formule</h2>
          <form action={addRecetteOuVracAction}>
            <input type="hidden" name="page_key" value="recetteConditionnement" />
            <input type="hidden" name="article_pf_id" value={articlePfId} />
            <AjouterArticleFormulaire
              mpOptions={mpOptions.filter((option) => !usedMpIds.has(option.id))}
              vracOptions={vracActuel ? [] : vracOptions}
              nbCarton={quantiteBase}
              piecePartCarton={piecePartCarton}
              dispenseurPcsCarton={dispenseurPcsCarton}
            />
          </form>
        </section>
      </div>
    </main>
  );
}
