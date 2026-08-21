import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { formatDate } from "@/lib/format-date";
import { vracLabelFromName } from "@/lib/gamme-families";
import { fetchBesoinArticleInfoAction } from "../../../actions";
import { BesoinRowsEditor } from "./besoin-rows-editor";

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
//
// Reservee aux comptes admin (isAdminUser) pour le moment, comme les
// sections Salle de pesage/Salle de conditionnement du Dashboard qui y
// menent - un utilisateur non-admin qui devinerait l'URL directement doit
// aussi etre bloque, pas seulement ne pas voir le lien.
export default async function BesoinBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ ligneId: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const currentUser = await getCurrentStockUser();
  if (!isAdminUser(currentUser)) {
    notFound();
  }

  const { ligneId } = await params;
  const ligneIdNumber = Number(ligneId);
  const { code: codeParam, stage: stageParam, qt: qtParam, erreur } = await searchParams;
  const code = (codeParam || "").trim();
  const stage: "vrac" | "carton" = stageParam === "carton" ? "carton" : "vrac";
  // Un nombre de carton n'a jamais de virgule - certaines lignes decoupees
  // avant cette regle ont encore un qt_carton fractionnaire en base (ex:
  // 312.5), toujours arrondi au SUPERIEUR ici pour que le besoin en
  // matiere premiere ne soit jamais sous-estime.
  const qtRaw = Number(qtParam || "0");
  const qt = stage === "carton" ? Math.ceil(qtRaw) : qtRaw;

  if (!ligneIdNumber || !code) {
    notFound();
  }

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

  // Meme fonction que la re-verification serveur (validerBatchAction) et
  // que le picker cote client (fetchBesoinArticleInfoAction) - le
  // disponible affiche ici doit toujours etre calcule PAR LOT, jamais sur
  // le total de l'article (tous lots confondus), sinon un lot sans assez
  // de stock apparait comme "OK" simplement parce qu'un AUTRE lot du meme
  // article a le reste (voir la note dans actions.ts).
  const rows = await Promise.all(
    mpIds.map(async (mpId) => {
      const info = depotBId
        ? await fetchBesoinArticleInfoAction(mpId, depotBId)
        : { unite: null, disponible: 0, lots: [] as { numeroLot: string; solde: number }[] };
      return {
        id: mpId,
        nom: articleMpById.get(mpId)?.nom_article ?? `#${mpId}`,
        unite: articleMpById.get(mpId)?.unite ?? "-",
        besoin: round(besoinParMp.get(mpId) ?? 0),
        stock: round(info.disponible),
        lots: info.lots,
      };
    })
  );
  rows.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  // Liste complete des matieres premieres pour le picker "Ajouter un
  // article"/modifier un article existant - PostgREST plafonne a 1000
  // lignes, pagine par securite meme si le catalogue MP actuel tient
  // largement dans une seule page.
  const mpArticleOptions: { id: number; label: string }[] = [];
  let mpFromIndex = 0;
  const mpPageSize = 1000;
  while (true) {
    const { data: mpData, error: mpListError } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article")
      .order("nom_article", { ascending: true })
      .range(mpFromIndex, mpFromIndex + mpPageSize - 1);
    if (mpListError) break;
    const chunk = (mpData as { id: number; nom_article: string }[] | null) ?? [];
    mpArticleOptions.push(...chunk.map((a) => ({ id: a.id, label: a.nom_article })));
    if (chunk.length < mpPageSize) break;
    mpFromIndex += mpPageSize;
  }

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

        {!depotBId ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              Aucun depot nomme &quot;Depot B&quot; - cree-le depuis Entrepot.
            </p>
          </section>
        ) : (
          <>
            {erreur ? (
              <section className="no-print rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">
                {erreur}
              </section>
            ) : null}

            <BesoinRowsEditor
              ligneId={ligneIdNumber}
              code={code}
              stage={stage}
              qt={qt}
              depotBId={depotBId}
              canWrite={canWrite}
              initialRows={rows}
              mpArticleOptions={mpArticleOptions}
            />
          </>
        )}
      </div>
    </main>
  );
}
