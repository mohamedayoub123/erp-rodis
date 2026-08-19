import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { QuantitePourcentField } from "../quantite-pourcent-field";
import {
  addRecetteLigneAction,
  updateRecetteLigneAction,
  deleteRecetteLigneAction,
  updateQuantiteBaseAction,
} from "../actions";
import { SubmitButton } from "@/app/_components/submit-button";
import { fetchCoutsMoyenMp, computeRecetteCost } from "@/lib/prix-revient";

type ArticlePfRow = {
  id: number;
  nom_article: string;
  gamme: string | null;
  nature: string | null;
  quantite_recette_base: number | null;
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
    .select("id, nom_article, gamme, nature, quantite_recette_base")
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
  const quantiteBase = (articlePf as ArticlePfRow).quantite_recette_base;
  const sommeLignes = lignes.reduce((total, ligne) => total + Number(ligne.quantite ?? 0), 0);
  // % se calcule sur la quantite totale du lot declaree (kg de vrac / nb de
  // cartons) si elle est renseignee, sinon a defaut sur la somme des lignes
  // (comportement precedent, pour les recettes pas encore mises a jour).
  const totalQuantite = quantiteBase !== null && quantiteBase !== undefined && quantiteBase > 0 ? quantiteBase : sommeLignes;

  const coutsMp = await fetchCoutsMoyenMp(lignes.map((ligne) => ligne.article_mp_id));
  const { coutTotal, lignesSansPrix } = computeRecetteCost(lignes, coutsMp);
  const coutParKg = quantiteBase && quantiteBase > 0 ? coutTotal / quantiteBase : null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
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

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form action={updateQuantiteBaseAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="page_key" value="recetteFabrication" />
            <input type="hidden" name="article_pf_id" value={articlePfId} />
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Quantite totale du lot (kg de vrac produit)
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
                    <th className="px-6 py-4 font-semibold">Quantite / %</th>
                    <th className="px-6 py-4 font-semibold">Prix unitaire (cout moyen)</th>
                    <th className="px-6 py-4 font-semibold">Cout</th>
                    <th className="px-6 py-4 font-semibold"></th>
                  </tr>
                </thead>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-6 py-3 font-semibold text-slate-900" colSpan={2}>
                      Total
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      {sommeLignes.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                      {totalQuantite > 0
                        ? ` / ${((sommeLignes / totalQuantite) * 100).toLocaleString("fr-FR", {
                            maximumFractionDigits: 2,
                          })}%`
                        : ""}
                    </td>
                    <td></td>
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      {coutTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA
                      {lignesSansPrix.length > 0 ? (
                        <span className="ml-1 font-normal text-amber-700">(partiel)</span>
                      ) : null}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
                <tbody>
                  {lignes.map((ligne) => {
                    const articleMp = mpById.get(ligne.article_mp_id);
                    const coutInfo = coutsMp.get(ligne.article_mp_id);
                    const coutLigne = coutInfo ? Number(ligne.quantite ?? 0) * coutInfo.coutFcfa : null;
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
                            <QuantitePourcentField
                              total={totalQuantite}
                              quantiteName="quantite"
                              defaultQuantite={ligne.quantite}
                            />
                            <SubmitButton
                              pendingLabel="Enregistrement..."
                              className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Enregistrer
                            </SubmitButton>
                          </form>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {coutInfo ? `${coutInfo.coutFcfa.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} FCFA` : "-"}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {coutLigne !== null
                            ? `${coutLigne.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA`
                            : "-"}
                        </td>
                        <td className="px-6 py-4">
                          <form action={deleteRecetteLigneAction}>
                            <input type="hidden" name="page_key" value="recetteFabrication" />
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
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Prix de revient du vrac</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-slate-500">Cout total du lot</p>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {coutTotal.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Cout par kg</p>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {coutParKg !== null ? `${coutParKg.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} FCFA` : "-"}
              </p>
            </div>
          </div>
          {lignesSansPrix.length > 0 ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {lignesSansPrix.length} article{lignesSansPrix.length > 1 ? "s" : ""} sans prix connu - cout partiel,
              incomplet.
            </p>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Ajouter un article MP a la formule</h2>
          <form action={addRecetteLigneAction} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="page_key" value="recetteFabrication" />
            <input type="hidden" name="article_pf_id" value={articlePfId} />
            <ProduitPickerField articles={mpOptions.filter((option) => !usedMpIds.has(option.id))} />
            <QuantitePourcentField total={totalQuantite} quantiteName="quantite" />
            <SubmitButton
              pendingLabel="Ajout..."
              className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
            >
              Ajouter
            </SubmitButton>
          </form>
        </section>
      </div>
    </main>
  );
}
