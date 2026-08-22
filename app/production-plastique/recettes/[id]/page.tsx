import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { canVoirPrixUser, getCurrentStockUser } from "@/lib/stock-auth";
import { computeCoutPlastiqueParPiece, type RecettePlastiqueLigne } from "../../shared";
import {
  addRecettePlastiqueLigneAction,
  updateRecettePlastiqueLigneAction,
  deleteRecettePlastiqueLigneAction,
  updatePoidsNetAction,
} from "../../actions";

function formatQuantiteGrammes(grammes: number): string {
  if (grammes >= 1000) {
    return `${(grammes / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} kg`;
  }
  return `${grammes.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} g`;
}

export default async function RecettePlastiqueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const articleProduitId = Number(id);
  const canVoirPrix = await canVoirPrixUser(await getCurrentStockUser());

  const { data: articleData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article, categorie, poids_net")
    .eq("id", articleProduitId)
    .maybeSingle();

  if (!articleData) {
    notFound();
  }
  const article = articleData as { id: number; nom_article: string; categorie: string | null; poids_net: number | null };

  const { data: lignesData } = await supabaseServer
    .from("recettes_plastique")
    .select("id, article_produit_id, article_matiere_id, pourcentage")
    .eq("article_produit_id", articleProduitId)
    .order("id", { ascending: true });
  const lignes = (lignesData ?? []) as RecettePlastiqueLigne[];

  // Matiere premiere = TOUS les articles MP (pas seulement les plastiques -
  // le colorant, la resine etc. sont des articles MP classiques comme les
  // autres), sauf l'article produit lui-meme.
  const { data: articlesMpData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article")
    .neq("id", articleProduitId);
  const mpOptions = ((articlesMpData ?? []) as { id: number; nom_article: string }[])
    .map((a) => ({ id: a.id, label: a.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const mpById = new Map(((articlesMpData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article]));
  const usedMatiereIds = new Set(lignes.map((l) => l.article_matiere_id));

  const sommePourcent = lignes.reduce((total, l) => total + Number(l.pourcentage ?? 0), 0);

  const { coutParPiece, lignesSansPrix } = canVoirPrix
    ? await computeCoutPlastiqueParPiece(article.poids_net, lignes)
    : { coutParPiece: null, lignesSansPrix: [] as number[] };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                Recette Plastique
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{article.nom_article}</h1>
              {article.categorie ? <p className="mt-1 text-sm text-slate-600">{article.categorie}</p> : null}
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique/recettes" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form action={updatePoidsNetAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="article_produit_id" value={articleProduitId} />
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Poids net d&apos;1 piece (grammes)
              <input
                type="number"
                step="0.001"
                min="0"
                name="poids_net"
                defaultValue={article.poids_net ?? ""}
                placeholder="Ex: 15"
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
          <p className="mt-2 text-xs text-slate-500">
            Necessaire pour convertir les % de la recette en quantite reelle (et calculer le prix de revient
            d&apos;1 piece).
          </p>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {lignes.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">Aucune matiere dans la composition pour le moment.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Matiere</th>
                  <th className="px-6 py-3 font-semibold">%</th>
                  <th className="px-6 py-3 font-semibold">Qte / piece</th>
                  {canVoirPrix ? <th className="px-6 py-3 font-semibold">Cout</th> : null}
                  <th className="px-6 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-6 py-3 font-semibold text-slate-900">Total</td>
                  <td
                    className={`px-6 py-3 font-semibold ${
                      Math.abs(sommePourcent - 100) > 0.01 ? "text-amber-700" : "text-slate-900"
                    }`}
                  >
                    {sommePourcent.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}%
                  </td>
                  <td className="px-6 py-3 font-semibold text-slate-900">
                    {article.poids_net ? formatQuantiteGrammes(article.poids_net) : "-"}
                  </td>
                  {canVoirPrix ? (
                    <td className="px-6 py-3 font-semibold text-slate-900">
                      {coutParPiece !== null
                        ? `${coutParPiece.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} FCFA`
                        : "-"}
                    </td>
                  ) : null}
                  <td></td>
                </tr>
              </tfoot>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.id} className="border-t border-slate-100">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {mpById.get(ligne.article_matiere_id) || `Article #${ligne.article_matiere_id}`}
                    </td>
                    <td className="px-6 py-4">
                      <form
                        action={updateRecettePlastiqueLigneAction}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="ligne_id" value={ligne.id} />
                        <input type="hidden" name="article_produit_id" value={articleProduitId} />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          name="pourcentage"
                          defaultValue={ligne.pourcentage}
                          className="w-24 rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                        />
                        <span className="text-slate-500">%</span>
                        <SubmitButton
                          pendingLabel="..."
                          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Enregistrer
                        </SubmitButton>
                      </form>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {article.poids_net
                        ? formatQuantiteGrammes((article.poids_net * ligne.pourcentage) / 100)
                        : "-"}
                    </td>
                    {canVoirPrix ? (
                      <td className="px-6 py-4 text-slate-600">
                        {lignesSansPrix.includes(ligne.article_matiere_id) ? "Prix inconnu" : "-"}
                      </td>
                    ) : null}
                    <td className="px-6 py-4">
                      <form action={deleteRecettePlastiqueLigneAction}>
                        <input type="hidden" name="ligne_id" value={ligne.id} />
                        <input type="hidden" name="article_produit_id" value={articleProduitId} />
                        <SubmitButton
                          pendingLabel="..."
                          className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          Supprimer
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {canVoirPrix && lignesSansPrix.length > 0 ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {lignesSansPrix.length} matiere{lignesSansPrix.length > 1 ? "s" : ""} sans prix connu - cout partiel,
            incomplet.
          </p>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Ajouter une matiere</h2>
          <form action={addRecettePlastiqueLigneAction} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="article_produit_id" value={articleProduitId} />
            <ProduitPickerField articles={mpOptions.filter((option) => !usedMatiereIds.has(option.id))} />
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              name="pourcentage"
              placeholder="%"
              required
              className="w-24 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            />
            <SubmitButton
              pendingLabel="Ajout..."
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Ajouter
            </SubmitButton>
          </form>
        </section>
      </div>
    </main>
  );
}
