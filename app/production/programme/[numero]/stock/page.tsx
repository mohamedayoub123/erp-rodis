import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canWritePageUser, getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";
import { autoCreateTransferOrdersAction } from "./actions";
import { fetchTotalStockInDepot } from "@/app/depots/transfer-order/stock-lots";
import { VerifierStockTable } from "@/app/depots/transfer-order/verifier-stock-table";

type ProgrammeRow = {
  article_id: number;
  vrac_article_id: number | null;
  qt_carton: number;
  qt_vrac: number;
  date_jour: string;
};

type ArticleRow = {
  id: number;
  nom_article: string;
  quantite_recette_base: number | null;
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

export default async function ProgrammeVerifierStockPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  noStore();
  const { numero } = await params;
  const numeroProgramme = Number(numero);
  if (!numeroProgramme) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  // Porte depuis V2, reserve au compte admin pour le moment.
  if (!isAdminUser(currentUser)) notFound();
  const canCreateTransferOrders = await canWritePageUser(currentUser, "depots");

  const { data: lignesData, error } = await supabaseServer
    .from("programmes")
    .select("article_id, vrac_article_id, qt_carton, qt_vrac, date_jour")
    .eq("numero_programme", numeroProgramme);

  const lignes = (lignesData ?? []) as ProgrammeRow[];
  if (!error && lignes.length === 0) {
    notFound();
  }
  const anneeProgramme = lignes[0]?.date_jour?.slice(0, 4) || "----";

  const articleIds = [...new Set(lignes.flatMap((l) => [l.article_id, l.vrac_article_id]).filter((id): id is number => !!id))];

  const [
    { data: articlesData, error: articlesError },
    { data: recettesData, error: recettesError },
  ] = await Promise.all([
    supabaseServer.from("articles").select("id, nom_article, quantite_recette_base").in("id", articleIds),
    supabaseServer.from("recettes_pf").select("article_pf_id, article_mp_id, quantite").in("article_pf_id", articleIds),
  ]);

  const chargeError = articlesError || recettesError;
  const articleById = new Map(((articlesData ?? []) as ArticleRow[]).map((a) => [a.id, a]));
  const recettes = (recettesData ?? []) as RecetteLigneRow[];

  // Besoin en MP = quantite de la recette x (qt du programme / quantite_recette_base
  // de l'article calibre) - qt_carton pour la recette Conditionnement (article
  // fini), qt_vrac pour la recette Fabrication (article vrac).
  const besoinParMp = new Map<number, number>();
  for (const ligne of lignes) {
    // quantite_recette_base pas renseigne sur l'article -> recette
    // consideree calibree pour 1 carton/1 kg vrac (meme repli que sur les
    // pages Recette Conditionnement/Fabrication), au lieu de ne rien
    // afficher du tout.
    const article = articleById.get(ligne.article_id);
    const ratioCarton = ligne.qt_carton / (article?.quantite_recette_base || 1);
    for (const r of recettes.filter((r) => r.article_pf_id === ligne.article_id)) {
      besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratioCarton);
    }
    if (ligne.vrac_article_id) {
      const vracArticle = articleById.get(ligne.vrac_article_id);
      const ratioVrac = ligne.qt_vrac / (vracArticle?.quantite_recette_base || 1);
      for (const r of recettes.filter((r) => r.article_pf_id === ligne.vrac_article_id)) {
        besoinParMp.set(r.article_mp_id, (besoinParMp.get(r.article_mp_id) ?? 0) + r.quantite * ratioVrac);
      }
    }
  }

  const mpIds = [...besoinParMp.keys()];

  const [
    { data: articlesMpData, error: articlesMpError },
    { rows: mouvements, error: mouvementsError },
  ] = await Promise.all([
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
    stockParMp.set(mv.article_id, (stockParMp.get(mv.article_id) ?? 0) + Number(mv.qte_entree ?? 0) - Number(mv.qte_sortie ?? 0));
  }

  // "Stock actuel" ci-dessus est brut, tous depots confondus, sans tenir
  // compte de ce qui est deja reserve par un autre Transfer Order - meme
  // correctif que la version Programme par ligne de cette page (voir
  // app/historique-programme/[groupeId]/stock/page.tsx).
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
  // couvert par des Transfer Order existants (source_numero_programme) -
  // reste possible si aucun n'existe encore (jamais cree, ou tous
  // supprimes), ou si un manque de stock au moment de leur creation n'a pas
  // couvert tout le besoin (compare quantite_demandee cumulee vs besoin).
  const { data: existingTransferOrdersData } = await supabaseServer
    .from("transfer_orders")
    .select("id")
    .eq("source_numero_programme", numeroProgramme);
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Programme
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Verifier stock - MB.{anneeProgramme}.{numeroProgramme}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Tous les articles MP des recettes utilisees dans ce programme, avec le besoin
              calcule (qt carton/vrac x quantite recette) et le stock actuel.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href={`/production/programme/${numeroProgramme}`} label="Retour" />
            <RefreshButton />
          </div>
        </div>

        {!peutCreerTransferOrders ? (
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-medium text-amber-800">
            Des Transfer Order couvrant tout le besoin de ce programme existent deja. Supprime-les
            d&apos;abord (page Transfer Order) si tu veux en recreer.
          </div>
        ) : null}

        <VerifierStockTable
          rows={rows}
          errorMessage={(error || finalError)?.message}
          createAction={autoCreateTransferOrdersAction}
          hiddenFieldName="numero_programme"
          hiddenFieldValue={numeroProgramme}
          canCreateTransferOrders={canCreateTransferOrders}
          peutCreerTransferOrders={peutCreerTransferOrders}
        />
      </div>
    </main>
  );
}
