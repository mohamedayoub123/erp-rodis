import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { formatDate } from "@/lib/format-date";
import { vracLabelFromName } from "@/lib/gamme-families";
import { fetchLotsInDepot, totalAvailable } from "@/app/depots/transfer-order/stock-lots";
import { validerBatchAction } from "../../../actions";

type LigneRow = { id: number; article_id: number | null; produit: string | null; date_jour: string };
type ArticleRow = { id: number; nom_article: string; quantite_recette_base: number | null; vrac_article_id: number | null };
type RecetteLigneRow = { article_pf_id: number; article_mp_id: number; quantite: number };
type ArticleMpRow = { id: number; nom_article: string; unite: string | null };

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

type SearchParams = Promise<{ code?: string; stage?: string; qt?: string; erreur?: string }>;

// Besoin en MP pour UN SEUL code (pas tout le programme, contrairement a
// "Verifier Stock") - accessible depuis Salle de pesage (stage=vrac, formule
// de l'article Vrac via articles.vrac_article_id) ou Salle de conditionnement
// (stage=carton, formule de l'article conditionne lui-meme). Stock compare
// uniquement au Depot B (destination des Transfer Order), pas au stock
// total tous depots confondus.
export default async function BesoinBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ ligneId: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const { ligneId } = await params;
  const ligneIdNumber = Number(ligneId);
  const { code: codeParam, stage: stageParam, qt: qtParam, erreur } = await searchParams;
  const code = (codeParam || "").trim();
  const stage: "vrac" | "carton" = stageParam === "carton" ? "carton" : "vrac";
  const qt = Number(qtParam || "0");

  if (!ligneIdNumber || !code) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "productionSuiviDashboard");

  const { data: ligneData } = await supabaseServer
    .from("programme_lignes")
    .select("id, article_id, produit, date_jour")
    .eq("id", ligneIdNumber)
    .maybeSingle();

  const ligne = ligneData as LigneRow | null;
  if (!ligne || !ligne.article_id) {
    notFound();
  }

  const { data: articleData } = await supabaseServer
    .from("articles")
    .select("id, nom_article, quantite_recette_base, vrac_article_id")
    .eq("id", ligne.article_id)
    .maybeSingle();
  const article = articleData as ArticleRow | null;

  let recetteArticleId: number | null = null;
  let recetteArticleQuantiteBase: number | null = null;
  let vracArticleNom: string | null = null;

  if (stage === "vrac") {
    recetteArticleId = article?.vrac_article_id ?? null;
    if (recetteArticleId) {
      const { data: vracArticleData } = await supabaseServer
        .from("articles")
        .select("id, nom_article, quantite_recette_base")
        .eq("id", recetteArticleId)
        .maybeSingle();
      const vracArticle = vracArticleData as { nom_article: string; quantite_recette_base: number | null } | null;
      vracArticleNom = vracArticle?.nom_article ?? null;
      recetteArticleQuantiteBase = vracArticle?.quantite_recette_base ?? null;
    }
  } else {
    recetteArticleId = article?.id ?? null;
    recetteArticleQuantiteBase = article?.quantite_recette_base ?? null;
  }

  const { data: recettesData } = recetteArticleId
    ? await supabaseServer
        .from("recettes_pf")
        .select("article_pf_id, article_mp_id, quantite")
        .eq("article_pf_id", recetteArticleId)
    : { data: [] as RecetteLigneRow[] };
  const recettes = (recettesData ?? []) as RecetteLigneRow[];

  const ratio = qt / (recetteArticleQuantiteBase || 1);
  const besoinParMp = new Map<number, number>();
  for (const r of recettes) {
    besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratio);
  }

  const mpIds = [...besoinParMp.keys()];
  const { data: articlesMpData } = mpIds.length > 0
    ? await supabaseServer.from("articles_matiere_premiere").select("id, nom_article, unite").in("id", mpIds)
    : { data: [] as ArticleMpRow[] };
  const articleMpById = new Map(((articlesMpData ?? []) as ArticleMpRow[]).map((a) => [a.id, a]));

  const { data: depotBData } = await supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle();
  const depotBId = (depotBData as { id: number } | null)?.id ?? null;

  // Deja reserve par un AUTRE batch valide (voir validerBatchAction) - a
  // deduire du stock reel Depot B, meme si ce stock n'a pas encore
  // physiquement bouge (aucun Transfer Invoice valide pour cette reservation).
  const reserveParMp = new Map<number, number>();
  if (depotBId && mpIds.length > 0) {
    const { data: reserveData } = await supabaseServer
      .from("production_mp_reserve")
      .select("article_mp_id, quantite")
      .eq("depot_id", depotBId)
      .in("article_mp_id", mpIds);
    for (const r of (reserveData ?? []) as { article_mp_id: number; quantite: number }[]) {
      reserveParMp.set(r.article_mp_id, (reserveParMp.get(r.article_mp_id) ?? 0) + Number(r.quantite));
    }
  }

  const rows = await Promise.all(
    mpIds.map(async (mpId) => {
      const lots = depotBId ? await fetchLotsInDepot("MP", mpId, depotBId) : [];
      const stockReel = totalAvailable(lots);
      const reserve = reserveParMp.get(mpId) ?? 0;
      return {
        id: mpId,
        nom: articleMpById.get(mpId)?.nom_article ?? `#${mpId}`,
        unite: articleMpById.get(mpId)?.unite ?? "-",
        besoin: round(besoinParMp.get(mpId) ?? 0),
        stock: round(Math.max(0, stockReel - reserve)),
      };
    })
  );
  rows.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  const label =
    stage === "vrac" ? vracArticleNom || vracLabelFromName(ligne.produit) || "-" : ligne.produit || "-";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                {stage === "vrac" ? "Salle de pesage" : "Salle de conditionnement"}
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{label}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(ligne.date_jour)} - Lot {code} - Qt {qt.toLocaleString("fr-FR")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 no-print">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
              <SimplePrintButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!depotBId ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Aucun depot nomme &quot;Depot B&quot; - cree-le depuis Entrepot.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucune recette trouvee pour cet article.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article MP</th>
                    <th className="px-6 py-4 font-semibold">Unite</th>
                    <th className="px-6 py-4 font-semibold">Besoin</th>
                    <th className="px-6 py-4 font-semibold">Disponible Depot B</th>
                    <th className="px-6 py-4 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const insuffisant = row.besoin > row.stock;
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                        <td className="px-6 py-4 text-slate-600">{row.unite}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.besoin.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.stock.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-6 py-4">
                          {insuffisant ? (
                            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                              Insuffisant
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {erreur ? (
          <section className="no-print rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">
            {erreur}
          </section>
        ) : null}

        {canWrite ? (
          <section className="no-print rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {(() => {
              const anyInsuffisant = rows.some((row) => row.besoin > row.stock);
              return (
                <form action={validerBatchAction} className="flex flex-wrap items-end gap-4">
                  <input type="hidden" name="ligne_id" value={ligneIdNumber} />
                  <input type="hidden" name="code" value={code} />
                  <input type="hidden" name="stage" value={stage} />
                  <input type="hidden" name="qt" value={qt} />
                  {rows.map((row) => (
                    <span key={row.id}>
                      <input type="hidden" name="article_mp_id" value={row.id} />
                      <input type="hidden" name="besoin" value={row.besoin} />
                    </span>
                  ))}
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Numero de lot
                    <input
                      type="text"
                      name="numero_lot"
                      placeholder="Numero de lot reel"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal normal-case text-slate-900 outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={anyInsuffisant}
                    className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Valider - le batch est fait
                  </button>
                  {anyInsuffisant ? (
                    <p className="w-full text-xs font-semibold text-red-700">
                      Stock Depot B insuffisant pour au moins une matiere premiere - validation impossible.
                    </p>
                  ) : null}
                </form>
              );
            })()}
          </section>
        ) : null}
      </div>
    </main>
  );
}
