import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchPlCodeByGroupeId } from "@/lib/programme-numbering";
import { fetchTotalStockInDepot } from "@/app/depots/transfer-order/stock-lots";
import { VerifierStockTable } from "@/app/depots/transfer-order/verifier-stock-table";
import { autoCreateTransferOrdersFromProgrammeLigneAction } from "./actions";
import { computeQtCarton, splitVracIntoBatches } from "@/lib/dispatcher-shared";

type ProgrammeLigneRow = {
  article_id: number | null;
  qt_carton: number | null;
  vrac_a_fabriquer: number | null;
  date_jour: string;
  plateforme: string | null;
};

type ArticleRow = {
  id: number;
  nom_article: string;
  nature: string | null;
  vrac_article_id: number | null;
  quantite_recette_base: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
  max_vrac_auto: number | null;
  vrac_max_manuel: number | null;
};

type RecetteLigneRow = {
  article_pf_id: number;
  article_mp_id: number;
  quantite: number;
};

type ArticleMpRow = {
  id: number;
  nom_article: string;
  unite: string | null;
};

type MouvementRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

// Meme calcul que /production/programme/[numero]/stock (Programme MB), mais
// adapte a programme_lignes : pas de vrac_article_id/qt_vrac stockes ici, le
// vrac reel de la ligne (vrac_a_fabriquer) et l'article vrac (resolu via
// articles.nature/vrac_article_id, comme lib/vrac-article.ts) servent
// directement au lieu d'un ratio derive de qt_carton.
export default async function HistoriqueProgrammeVerifierStockPage({
  params,
}: {
  params: Promise<{ groupeId: string }>;
}) {
  noStore();
  const { groupeId } = await params;
  const groupeIdNumber = Number(groupeId);
  if (!groupeIdNumber) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  // Meme droit que "Charger dans Programme par ligne"/Dispatch sur cette
  // meme page historique - reserve a qui peut faire le programme, pas
  // seulement a l'admin (contrairement a la version Programme MB dont ce
  // calcul est adapte).
  const canView = await canWritePageUser(currentUser, "programeParLigne");
  if (!canView) notFound();
  const canCreateTransferOrders = await canWritePageUser(currentUser, "depots");

  const { data: lignesData, error } = await supabaseServer
    .from("programme_lignes")
    .select("article_id, qt_carton, vrac_a_fabriquer, date_jour, plateforme")
    .or(`groupe_id.eq.${groupeIdNumber},and(groupe_id.is.null,id.eq.${groupeIdNumber})`);

  const lignes = ((lignesData ?? []) as ProgrammeLigneRow[]).filter((l) => l.article_id);
  if (!error && lignes.length === 0) {
    notFound();
  }

  const plCodeByGroupeId = await fetchPlCodeByGroupeId();
  const code = plCodeByGroupeId.get(groupeIdNumber) ?? `PL-${groupeIdNumber}`;

  const articleIds = [...new Set(lignes.map((l) => l.article_id).filter((id): id is number => !!id))];

  const { data: articlesData, error: articlesError } = await supabaseServer
    .from("articles")
    .select("id, nom_article, nature, vrac_article_id, quantite_recette_base, contenance, piece_par_carton, max_vrac_auto, vrac_max_manuel")
    .in("id", articleIds);

  const articleById = new Map(((articlesData ?? []) as ArticleRow[]).map((a) => [a.id, a]));

  // Meme regle que resolveVracArticleId (lib/vrac-article.ts) : un article
  // deja de nature "vrac" est son propre vrac, sinon on suit
  // vrac_article_id.
  function resolveVracId(articleId: number): number | null {
    const article = articleById.get(articleId);
    if (!article) return null;
    if (article.nature === "vrac") return articleId;
    return article.vrac_article_id ?? null;
  }

  const vracIds = [...new Set(articleIds.map((id) => resolveVracId(id)).filter((id): id is number => !!id))];
  const missingVracIds = vracIds.filter((id) => !articleById.has(id));

  if (missingVracIds.length > 0) {
    const { data: vracArticlesData } = await supabaseServer
      .from("articles")
      .select("id, nom_article, nature, vrac_article_id, quantite_recette_base")
      .in("id", missingVracIds);
    for (const a of (vracArticlesData ?? []) as ArticleRow[]) {
      articleById.set(a.id, a);
    }
  }

  const recetteArticleIds = [...new Set([...articleIds, ...vracIds])];

  const { data: recettesData, error: recettesError } = await supabaseServer
    .from("recettes_pf")
    .select("article_pf_id, article_mp_id, quantite")
    .in("article_pf_id", recetteArticleIds);

  const chargeError = articlesError || recettesError;
  const recettes = (recettesData ?? []) as RecetteLigneRow[];

  // qt_carton reellement consomme en conditionnement = somme des qt_carton
  // de CHAQUE lot une fois le vrac total decoupe par le Dispatcher, jamais
  // le qt_carton persiste sur programme_lignes (un seul arrondi sur le vrac
  // total avant tout decoupage) - meme correctif et meme raison que
  // /production/programme/[numero]/stock (Programme MB), voir son
  // commentaire pour le detail (cas reel confirme : 6000L -> 625 sur la
  // ligne, mais 2x3000L decoupes par le Dispatcher -> 313+313 = 626 en
  // vrai, 1 carton de conditionnement jamais compte ici avant ce correctif).
  const totalVracParGroupe = new Map<string, number>();
  for (const ligne of lignes) {
    if (!ligne.article_id) continue;
    const cle = `${ligne.article_id}::${ligne.plateforme ?? ""}`;
    totalVracParGroupe.set(cle, (totalVracParGroupe.get(cle) ?? 0) + Number(ligne.vrac_a_fabriquer ?? 0));
  }
  const qtCartonReelParGroupe = new Map<string, number>();
  for (const [cle, totalVrac] of totalVracParGroupe.entries()) {
    const [articleIdStr, plateforme] = cle.split("::");
    const article = articleById.get(Number(articleIdStr));
    const max = plateforme === "A" ? article?.max_vrac_auto : article?.vrac_max_manuel;
    const batches = max && max > 0 ? splitVracIntoBatches(totalVrac, max) : [totalVrac];
    const total = batches.reduce(
      (sum, batch) => sum + (computeQtCarton(batch, article?.contenance ?? null, article?.piece_par_carton ?? null) ?? 0),
      0
    );
    qtCartonReelParGroupe.set(cle, total);
  }

  // Besoin en MP = quantite de la recette x (quantite reelle du programme /
  // quantite_recette_base de l'article calibre) - qt_carton pour la recette
  // Conditionnement (article fini), vrac_a_fabriquer pour la recette
  // Fabrication (article vrac).
  const besoinParMp = new Map<number, number>();
  for (const ligne of lignes) {
    if (!ligne.article_id) continue;
    const article = articleById.get(ligne.article_id);

    if (ligne.qt_carton) {
      const cle = `${ligne.article_id}::${ligne.plateforme ?? ""}`;
      const totalVracGroupe = totalVracParGroupe.get(cle) ?? 0;
      const qtCartonReelGroupe = qtCartonReelParGroupe.get(cle) ?? ligne.qt_carton;
      const partDeLigne = totalVracGroupe > 0 ? Number(ligne.vrac_a_fabriquer ?? 0) / totalVracGroupe : 0;
      const qtCartonReelLigne = qtCartonReelGroupe * partDeLigne;
      const ratioCarton = qtCartonReelLigne / (article?.quantite_recette_base || 1);
      for (const r of recettes.filter((r) => r.article_pf_id === ligne.article_id)) {
        besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratioCarton);
      }
    }

    const vracId = resolveVracId(ligne.article_id);
    if (vracId && ligne.vrac_a_fabriquer) {
      const vracArticle = articleById.get(vracId);
      const ratioVrac = ligne.vrac_a_fabriquer / (vracArticle?.quantite_recette_base || 1);
      for (const r of recettes.filter((r) => r.article_pf_id === vracId)) {
        besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratioVrac);
      }
    }
  }

  const mpIds = [...besoinParMp.keys()];

  const [{ data: articlesMpData, error: articlesMpError }, { rows: mouvements, error: mouvementsError }] =
    await Promise.all([
      supabaseServer.from("articles_matiere_premiere").select("id, nom_article, unite").in("id", mpIds),
      mpIds.length > 0
        ? fetchAll<MouvementRow>("lots_stock_matiere_premiere", "article_id, qte_entree, qte_sortie")
        : Promise.resolve({ rows: [] as MouvementRow[], error: null }),
    ]);

  const finalError = chargeError || articlesMpError || mouvementsError;
  const articleMpById = new Map(((articlesMpData ?? []) as ArticleMpRow[]).map((a) => [a.id, a]));

  const stockParMp = new Map<number, number>();
  for (const mv of mouvements) {
    if (!mv.article_id) continue;
    stockParMp.set(
      mv.article_id,
      (stockParMp.get(mv.article_id) ?? 0) + Number(mv.qte_entree ?? 0) - Number(mv.qte_sortie ?? 0)
    );
  }

  // "Stock actuel" ci-dessus est brut, tous depots confondus, sans tenir
  // compte de ce qui est deja reserve par un autre Transfer Order - ne dit
  // pas ce qui est REELLEMENT disponible pour CE programme au depot d'ou
  // partent les Transfer Order (Depot B). fetchTotalStockInDepot fait deja
  // ce calcul net (voir app/depots/transfer-order/stock-lots.ts).
  const [{ data: depotBData }, { data: depotEData }] = await Promise.all([
    supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle(),
    supabaseServer.from("depots").select("id").ilike("nom", "Depot E").maybeSingle(),
  ]);
  const depotBId = (depotBData as { id: number } | null)?.id ?? null;
  const depotEId = (depotEData as { id: number } | null)?.id ?? null;

  const disponibleDepotBParMp = new Map<number, number>();
  const disponibleDepotEParMp = new Map<number, number>();
  await Promise.all(
    mpIds.map(async (mpId) => {
      if (depotBId) {
        disponibleDepotBParMp.set(mpId, await fetchTotalStockInDepot("MP", mpId, depotBId));
      }
      if (depotEId) {
        disponibleDepotEParMp.set(mpId, await fetchTotalStockInDepot("MP", mpId, depotEId));
      }
    })
  );

  const rows = mpIds
    .map((mpId) => ({
      id: mpId,
      nom: articleMpById.get(mpId)?.nom_article ?? `#${mpId}`,
      unite: articleMpById.get(mpId)?.unite ?? "-",
      besoin: round(besoinParMp.get(mpId) ?? 0),
      stock: round(stockParMp.get(mpId) ?? 0),
      disponibleDepotB: depotBId ? round(disponibleDepotBParMp.get(mpId) ?? 0) : null,
      disponibleDepotE: depotEId ? round(disponibleDepotEParMp.get(mpId) ?? 0) : null,
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  // "Creer les Transfer Order" bloque si ce programme est deja entierement
  // couvert par des Transfer Order existants (meme logique que Programme
  // MB, via source_groupe_id_programme_ligne au lieu de
  // source_numero_programme) - reste possible si aucun n'existe encore, ou
  // si un manque de stock au moment de leur creation n'a pas couvert tout
  // le besoin.
  const { data: existingTransferOrdersData } = await supabaseServer
    .from("transfer_orders")
    .select("id")
    .eq("source_groupe_id_programme_ligne", groupeIdNumber);
  const existingTransferOrderIds = ((existingTransferOrdersData ?? []) as { id: number }[]).map((t) => t.id);

  let dejaEntierementCouvert = false;
  if (existingTransferOrderIds.length > 0) {
    const { data: existingLignesData } = await supabaseServer
      .from("transfer_order_lignes")
      .select("article_id, quantite_demandee")
      .in("transfer_order_id", existingTransferOrderIds)
      .eq("article_type", "MP");
    const couvertParMp = new Map<number, number>();
    for (const l of (existingLignesData ?? []) as { article_id: number; quantite_demandee: number }[]) {
      couvertParMp.set(l.article_id, (couvertParMp.get(l.article_id) ?? 0) + Number(l.quantite_demandee ?? 0));
    }
    dejaEntierementCouvert = mpIds.every((mpId) => (couvertParMp.get(mpId) ?? 0) + 1e-6 >= (besoinParMp.get(mpId) ?? 0));
  }
  const peutCreerTransferOrders = existingTransferOrderIds.length === 0 || !dejaEntierementCouvert;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Programme par ligne
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Verifier stock - {code}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Tous les articles MP des recettes utilisees dans ce programme, avec le besoin calcule
                (qt carton/vrac a fabriquer x quantite recette) et le stock actuel.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href={`/historique-programme/${groupeIdNumber}`} label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {!peutCreerTransferOrders ? (
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-medium text-amber-800">
            Des Transfer Order couvrant tout le besoin de ce programme existent deja. Supprime-les
            d&apos;abord (page Transfer Order) si tu veux en recreer.
          </div>
        ) : null}

        <VerifierStockTable
          rows={rows}
          errorMessage={(error || finalError)?.message}
          createAction={autoCreateTransferOrdersFromProgrammeLigneAction}
          hiddenFieldName="groupe_id"
          hiddenFieldValue={groupeIdNumber}
          canCreateTransferOrders={canCreateTransferOrders}
          peutCreerTransferOrders={peutCreerTransferOrders}
        />
      </div>
    </main>
  );
}
