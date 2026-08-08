import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { addRecetteLigneAction, updateRecetteLigneAction, deleteRecetteLigneAction } from "../actions";

type ArticlePfRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
  nature: string | null;
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

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

export default async function RecetteFabricationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const articlePfId = Number(id);

  const { data: articlePf } = await supabaseServer
    .from("articles")
    .select("id, nom_article, gamme, nature")
    .eq("id", articlePfId)
    .maybeSingle();

  if (!articlePf || (articlePf as ArticlePfRow).nature !== "vrac") {
    notFound();
  }

  const [{ data: lignesData, error: lignesError }, { rows: articlesMp, error: articlesMpError }] =
    await Promise.all([
      supabaseServer
        .from("recettes_pf")
        .select("id, article_pf_id, article_mp_id, quantite")
        .eq("article_pf_id", articlePfId)
        .order("id", { ascending: true }),
      fetchAllArticlesMp(),
    ]);

  const error = lignesError || articlesMpError;
  const lignes = (lignesData ?? []) as RecetteLigneRow[];
  const mpById = new Map(articlesMp.map((article) => [article.id, article]));
  const mpOptions = articlesMp
    .map((article) => ({ id: article.id, label: article.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  const usedMpIds = new Set(lignes.map((ligne) => ligne.article_mp_id));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Recette Fabrication
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {(articlePf as ArticlePfRow).nom_article}
            </h1>
            {(articlePf as ArticlePfRow).gamme ? (
              <p className="mt-1 text-sm text-slate-600">{(articlePf as ArticlePfRow).gamme}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/production/recette-fabrication" label="Retour" />
            <RefreshButton />
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : lignes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun article MP dans la formule pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article MP</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Quantite</th>
                    <th className="px-6 py-4 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
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
                            <input type="hidden" name="page_key" value="recetteFabrication" />
                            <input type="hidden" name="ligne_id" value={ligne.id} />
                            <input type="hidden" name="article_pf_id" value={articlePfId} />
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              name="quantite"
                              defaultValue={ligne.quantite}
                              className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                            />
                            <button
                              type="submit"
                              className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Enregistrer
                            </button>
                          </form>
                        </td>
                        <td className="px-6 py-4">
                          <form action={deleteRecetteLigneAction}>
                            <input type="hidden" name="page_key" value="recetteFabrication" />
                            <input type="hidden" name="ligne_id" value={ligne.id} />
                            <input type="hidden" name="article_pf_id" value={articlePfId} />
                            <button
                              type="submit"
                              className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                            >
                              Supprimer
                            </button>
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
          <h2 className="mb-4 text-lg font-bold text-slate-900">Ajouter un article MP a la formule</h2>
          <form action={addRecetteLigneAction} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="page_key" value="recetteFabrication" />
            <input type="hidden" name="article_pf_id" value={articlePfId} />
            <ProduitPickerField articles={mpOptions.filter((option) => !usedMpIds.has(option.id))} />
            <input
              type="number"
              step="0.001"
              min="0"
              name="quantite"
              placeholder="Quantite"
              required
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
            >
              Ajouter
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
