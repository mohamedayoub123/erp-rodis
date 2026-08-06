import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import {
  addManualFifoLotAction,
  calculateFifoForCommandeAction,
  cancelFifoBatchAction,
  deliverCommandeAction,
  updateAllFifoResultsAction,
  updateManualCommandeAction,
} from "../actions";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { PrintButton } from "./print-button";
import { formatDate } from "@/lib/format-date";

type CommandeDetailRow = {
  id: number;
  numero_proforma: string;
  client: string;
  statut: string;
  commentaire: string | null;
  mode_chargement: string | null;
  type_tc: string | null;
  created_at: string | null;
  commande_lignes:
    | {
        id: number;
        article_id: number;
        quantite_demandee: number;
        qt_non_dispo_total: number | null;
        qt_non_dispo_2_mois: number | null;
        qt_non_dispo_4_mois: number | null;
        qt_non_dispo_6_mois: number | null;
        articles:
          | { nom_article: string | null; type_article: string | null }
          | { nom_article: string | null; type_article: string | null }[]
          | null;
      }[]
    | null;
};

type FifoResultRow = {
  id: number;
  commande_ligne_id: number;
  article_id: number;
  numero_lot: string | null;
  date_fabrication: string | null;
  chambre: string | null;
  quantite_chargee: number;
  regle_appliquee: string | null;
  articles: { nom_article: string | null } | { nom_article: string | null }[] | null;
};

type LotMovementAvailabilityRow = {
  id: number;
  article_id: number;
  numero_lot: string | null;
  code_normalise: string | null;
  date_fabrication: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
};

type ArticleAvailability = {
  total: number;
  twoMonths: number;
  fourMonths: number;
  sixMonths: number;
};

function getArticleName(
  relation:
    | { nom_article: string | null }
    | { nom_article: string | null }[]
    | null
    | undefined
) {
  if (Array.isArray(relation)) {
    return relation[0]?.nom_article || "-";
  }

  return relation?.nom_article || "-";
}

function getArticleType(
  relation:
    | { type_article: string | null }
    | { type_article: string | null }[]
    | null
    | undefined
) {
  if (Array.isArray(relation)) {
    return relation[0]?.type_article || "";
  }

  return relation?.type_article || "";
}

function normalizeClientName(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

// Certains clients importes en masse ont un client_normalise qui garde les
// espaces (ex: "IPP SARL") au lieu de la convention utilisee par le
// formulaire "Ajouter client" (espaces retires: "IPPSARL") - on essaie donc
// plusieurs formes avant d'abandonner.
async function findClientPays(clientName: string) {
  const trimmed = (clientName || "").trim();

  if (!trimmed) {
    return "";
  }

  const attempts = [
    supabaseServer
      .from("clients")
      .select("pays")
      .eq("client_normalise", normalizeClientName(trimmed))
      .maybeSingle(),
    supabaseServer
      .from("clients")
      .select("pays")
      .eq("client_normalise", trimmed.toUpperCase())
      .maybeSingle(),
    supabaseServer.from("clients").select("pays").ilike("nom_client", trimmed).maybeSingle(),
  ];

  for (const attempt of attempts) {
    const { data } = await attempt;
    const pays = (data as { pays: string | null } | null)?.pays;

    if (pays && pays.trim()) {
      return pays.trim();
    }
  }

  return "";
}

function isContainerMode(modeChargement: string | null | undefined) {
  const value = (modeChargement || "").toUpperCase();
  return (
    value.includes("CONTINAIR") ||
    value.includes("CONTENAIR") ||
    value.includes("CONTENEUR") ||
    value.includes("CONTAINER")
  );
}

// Sibling trucks are stored as "<proforma>-2", "<proforma>-3"... to satisfy
// the unique constraint on numero_proforma - strip that for display so the
// user only ever sees the plain number.
function getBaseProforma(numeroProforma: string) {
  return numeroProforma.replace(/-\d+$/, "");
}

function formatStatus(value: string | null) {
  const status = (value || "").toUpperCase();

  if (status === "LIVREE") return "Livree";
  if (status === "BL_TRANSFORME") return "BL transforme";
  if (status === "STAND") return "Stand";
  if (status === "EN_COURS") return "En cours";
  if (status === "FIFO_PARTIEL") return "En cours";
  if (status === "FIFO_CALCULE") return "En cours";
  if (status === "SAISIE_WEB") return "En cours";

  return value || "-";
}

function extractPreparateur(commentaire: string | null | undefined) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith("PREPARATEUR_COMMANDE:"));
  return token ? token.replace("PREPARATEUR_COMMANDE:", "").trim() : "";
}

function monthsBetween(fromDate: Date, toDate: Date) {
  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
}

// Le solde d'un lot (article_id + code_normalise/numero_lot) doit etre
// additionne sur TOUTES ses lignes avant de regarder son age - sinon une
// grosse entree ancienne (solde d'ouverture importe en vrac, date factice)
// et les sorties recentes qui la consomment tombent dans des tranches
// d'age differentes et faussent le calcul (une tranche peut meme devenir
// negative). Regle "plus ancienne date gagne" pour la date representative,
// comme partout ailleurs dans l'app.
async function getArticleAvailabilityMap(articleIds: number[]) {
  if (articleIds.length === 0) {
    return new Map<number, ArticleAvailability>();
  }

  const rows: LotMovementAvailabilityRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select("id, article_id, numero_lot, code_normalise, date_fabrication, qte_entree, qte_sortie")
      .in("article_id", articleIds)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const currentRows = (data as LotMovementAvailabilityRow[] | null) ?? [];
    rows.push(...currentRows);

    if (currentRows.length < pageSize) break;
    from += pageSize;
  }

  const lotBalances = new Map<
    string,
    { article_id: number; qty: number; date_fabrication: string | null }
  >();

  for (const row of rows) {
    const key = `${row.article_id}::${String(row.code_normalise || row.numero_lot || "").trim().toUpperCase()}`;
    const current = lotBalances.get(key) ?? {
      article_id: row.article_id,
      qty: 0,
      date_fabrication: row.date_fabrication,
    };

    current.qty += Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);

    if (
      row.date_fabrication &&
      (!current.date_fabrication ||
        new Date(row.date_fabrication).getTime() < new Date(current.date_fabrication).getTime())
    ) {
      current.date_fabrication = row.date_fabrication;
    }

    lotBalances.set(key, current);
  }

  const today = new Date();
  const availability = new Map<number, ArticleAvailability>();

  for (const lot of lotBalances.values()) {
    if (lot.qty <= 0) continue;

    const current = availability.get(lot.article_id) ?? {
      total: 0,
      twoMonths: 0,
      fourMonths: 0,
      sixMonths: 0,
    };

    current.total += lot.qty;

    if (lot.date_fabrication) {
      const ageMonths = monthsBetween(new Date(lot.date_fabrication), today);
      if (ageMonths <= 2) current.twoMonths += lot.qty;
      if (ageMonths <= 4) current.fourMonths += lot.qty;
      if (ageMonths <= 6) current.sixMonths += lot.qty;
    }

    availability.set(lot.article_id, current);
  }

  return availability;
}

type ClosestLotCandidate = {
  lot_stock_id: number;
  numero_lot: string;
  date_fabrication: string;
  qty: number;
};

// Pour un article clarifiant en mode container, seuls les lots <= 2 mois
// sont eligibles au FIFO. Quand il en manque, on propose ici les lots juste
// en dehors de cette fenetre (les plus proches de la limite) pour que
// l'utilisateur decide manuellement s'il les accepte via l'override FIFO.
async function getClosestClarifiantDates(articleIds: number[]) {
  const byArticle = new Map<number, ClosestLotCandidate[]>();

  if (articleIds.length === 0) {
    return byArticle;
  }

  const { data, error } = await supabaseServer
    .from("lots_stock")
    .select("id, article_id, numero_lot, code_normalise, date_fabrication, qte_entree, qte_sortie")
    .in("article_id", articleIds)
    .not("date_fabrication", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const today = new Date();
  const byKey = new Map<
    string,
    {
      lot_stock_id: number;
      row_ids: number[];
      article_id: number;
      numero_lot: string;
      date_fabrication: string;
      qty: number;
    }
  >();

  for (const row of (data as
    | {
        id: number;
        article_id: number;
        numero_lot: string | null;
        code_normalise: string | null;
        date_fabrication: string | null;
        qte_entree: number | null;
        qte_sortie: number | null;
      }[]
    | null) ?? []) {
    if (!row.date_fabrication) continue;

    const lotLabel = (row.numero_lot || row.code_normalise || "").trim();
    const key = `${row.article_id}::${lotLabel.toUpperCase()}`;
    const current = byKey.get(key) ?? {
      lot_stock_id: row.id,
      row_ids: [],
      article_id: row.article_id,
      numero_lot: lotLabel,
      date_fabrication: row.date_fabrication,
      qty: 0,
    };

    current.qty += Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    current.row_ids.push(row.id);

    // Le lot represente par sa date de fabrication la plus ancienne, meme
    // convention que le reste de l'app (la plus ancienne date gagne).
    if (new Date(row.date_fabrication).getTime() < new Date(current.date_fabrication).getTime()) {
      current.date_fabrication = row.date_fabrication;
      current.lot_stock_id = row.id;
    }

    byKey.set(key, current);
  }

  // Une partie (ou tout) d'un lot propose peut deja avoir ete confirmee
  // (fifo_resultats) - qu'il s'agisse du calcul automatique ou d'un clic
  // "Confirmer" precedent. Il faut soustraire ce qui est deja reserve avant
  // d'afficher/reproposer la quantite disponible, sinon la meme quantite
  // reste affichee comme "disponible" apres avoir ete utilisee.
  const allRowIds = [...byKey.values()].flatMap((lot) => lot.row_ids);
  const reservedByRowId = new Map<number, number>();

  if (allRowIds.length > 0) {
    const { data: reservedRows, error: reservedError } = await supabaseServer
      .from("fifo_resultats")
      .select("lot_stock_id, quantite_chargee")
      .in("lot_stock_id", allRowIds);

    if (reservedError) {
      throw new Error(reservedError.message);
    }

    for (const row of (reservedRows as { lot_stock_id: number | null; quantite_chargee: number }[] | null) ??
      []) {
      if (!row.lot_stock_id) continue;
      reservedByRowId.set(
        row.lot_stock_id,
        (reservedByRowId.get(row.lot_stock_id) ?? 0) + Number(row.quantite_chargee ?? 0)
      );
    }
  }

  for (const lot of byKey.values()) {
    const reserved = lot.row_ids.reduce((sum, id) => sum + (reservedByRowId.get(id) ?? 0), 0);
    const available = lot.qty - reserved;
    if (available <= 0) continue;

    const ageMonths = monthsBetween(new Date(lot.date_fabrication), today);
    if (ageMonths <= 2) continue;

    const list = byArticle.get(lot.article_id) ?? [];
    list.push({
      lot_stock_id: lot.lot_stock_id,
      numero_lot: lot.numero_lot || "-",
      date_fabrication: lot.date_fabrication,
      qty: available,
    });
    byArticle.set(lot.article_id, list);
  }

  for (const [articleId, list] of byArticle.entries()) {
    list.sort(
      (a, b) => new Date(b.date_fabrication).getTime() - new Date(a.date_fabrication).getTime()
    );
    byArticle.set(articleId, list);
  }

  return byArticle;
}

async function fetchAllClientNamesForCommandeDetail() {
  const rows: { client: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les clients au-dela du 1000e
  // etaient invisibles dans le datalist du formulaire d'edition.
  while (true) {
    const { data, error } = await supabaseServer.from("commandes").select("client").range(
      from,
      from + pageSize - 1
    );

    if (error) break;

    const chunk = (data as { client: string | null }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function CommandeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const commandeId = Number(id);

  const currentStockUser = await getCurrentStockUser();
  const canWriteCommandes = await canWritePageUser(currentStockUser, "commandesDetail");
  const canEditCommandes = await canWritePageUser(currentStockUser, "commandesDetail");

  const [{ data: selectedCommandeData }, { data: fifoData }, commandesData] =
    await Promise.all([
      supabaseServer
        .from("commandes")
        .select(
          "id, numero_proforma, client, statut, commentaire, mode_chargement, type_tc, created_at, commande_lignes(id, article_id, quantite_demandee, qt_non_dispo_total, qt_non_dispo_2_mois, qt_non_dispo_4_mois, qt_non_dispo_6_mois, articles(nom_article, type_article))"
        )
        .eq("id", commandeId)
        .maybeSingle(),
      supabaseServer
        .from("fifo_resultats")
        .select(
          "id, commande_ligne_id, article_id, numero_lot, date_fabrication, chambre, quantite_chargee, regle_appliquee, articles(nom_article)"
        )
        .eq("commande_id", commandeId)
        .order("ordre_ligne", { ascending: true })
        .order("id", { ascending: true }),
      fetchAllClientNamesForCommandeDetail(),
    ]);

  const selectedCommande = (selectedCommandeData as CommandeDetailRow | null) ?? null;

  if (!selectedCommande) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#f8fbff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
        <div className="mx-auto w-full space-y-6">
          <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-medium text-slate-600">Commande introuvable.</p>
            <div className="mt-4">
              <BackButton href="/commandes" label="Retour aux commandes" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  const fifoResults: FifoResultRow[] = (fifoData as FifoResultRow[] | null) ?? [];

  const selectedArticleIds = [
    ...new Set(
      (selectedCommande.commande_lignes ?? [])
        .map((ligne) => Number(ligne.article_id))
        .filter((value) => value > 0)
    ),
  ];
  const availabilityMap = await getArticleAvailabilityMap(selectedArticleIds);

  const isContainer = isContainerMode(selectedCommande.mode_chargement);
  const isCommandeLivree = (selectedCommande.statut || "").toUpperCase() === "LIVREE";

  const lignesAvecManque = (selectedCommande.commande_lignes ?? [])
    .map((ligne) => ({ ligne, manque: Number(ligne.qt_non_dispo_total ?? 0) }))
    .filter((entry) => entry.manque > 0);

  const clarifiantShortageArticleIds = [
    ...new Set(
      lignesAvecManque
        .filter((entry) => isContainer && getArticleType(entry.ligne.articles).trim().toLowerCase() === "clarifiant")
        .map((entry) => Number(entry.ligne.article_id))
    ),
  ];

  const closestDatesMap = await getClosestClarifiantDates(clarifiantShortageArticleIds);

  const clientOptions = [
    ...new Set(
      commandesData
        .map((row) => (row.client || "").trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  const selectedPreparateur = extractPreparateur(selectedCommande.commentaire);

  const selectedClientPays = await findClientPays(selectedCommande.client);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef6ff_0%,#f8fbff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="text-xl font-bold text-slate-900">
                Detail commande {getBaseProforma(selectedCommande.numero_proforma)}
              </h1>
              <p className="text-sm text-slate-600">
                Client : {selectedCommande.client} | Pays : {selectedClientPays || "-"} | Statut :{" "}
                {formatStatus(selectedCommande.statut)}
              </p>
              <p className="text-sm text-slate-500">
                Mode : {selectedCommande.mode_chargement || "-"}
              </p>
            </div>

            <div className="no-print flex flex-wrap gap-2">
              <BackButton href="/commandes" label="Retour aux commandes" />
              <RefreshButton />
              <PrintButton mode="commande" label="Imprimer commande" />
              <PrintButton mode="dispatch" label="Imprimer dispatch" />
              {canWriteCommandes ? (
                <form action={calculateFifoForCommandeAction}>
                  <input type="hidden" name="commande_id" value={selectedCommande.id} />
                  <button
                    type="submit"
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Despatcher
                  </button>
                </form>
              ) : null}
              {canWriteCommandes && !isCommandeLivree && fifoResults.length > 0 ? (
                <form action={cancelFifoBatchAction}>
                  <input type="hidden" name="commande_id" value={selectedCommande.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800"
                  >
                    Annuler batch
                  </button>
                </form>
              ) : null}
              {canEditCommandes ? (
                <>
                  <form action={deliverCommandeAction}>
                    <input type="hidden" name="commande_id" value={selectedCommande.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Livrer
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>

          <div className="print-section-commande mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">Qt demandee</th>
                  <th className="px-4 py-3 font-semibold">Disponible</th>
                  <th className="px-4 py-3 font-semibold">Disponible 2 mois</th>
                  <th className="px-4 py-3 font-semibold">Disponible 4 mois</th>
                  <th className="px-4 py-3 font-semibold">Disponible 6 mois</th>
                  <th className="px-4 py-3 font-semibold">Manque total</th>
                </tr>
              </thead>
              <tbody>
                {(selectedCommande.commande_lignes ?? []).map((ligne) => {
                  const articleAvailability = availabilityMap.get(Number(ligne.article_id)) ?? {
                    total: 0,
                    twoMonths: 0,
                    fourMonths: 0,
                    sixMonths: 0,
                  };
                  const manqueTotal = Math.max(
                    0,
                    Number(ligne.quantite_demandee || 0) - Number(articleAvailability.total || 0)
                  );

                  return (
                    <tr key={ligne.id} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {getArticleName(ligne.articles)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{ligne.quantite_demandee}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {Number(articleAvailability.total || 0)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {Number(articleAvailability.twoMonths || 0)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {Number(articleAvailability.fourMonths || 0)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {Number(articleAvailability.sixMonths || 0)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600">{manqueTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {lignesAvecManque.length > 0 ? (
            <div className="print-section-hide-both mt-5 rounded-[1.5rem] border border-red-200 bg-red-50 p-4">
              <h3 className="text-lg font-bold text-red-900">
                Articles manquants pour cette commande
              </h3>
              <p className="mt-1 text-sm text-red-800">
                Apres calcul FIFO, ces articles n&apos;ont pas assez de stock disponible.
              </p>

              <div className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto pr-2">
                {lignesAvecManque.map(({ ligne, manque }) => {
                  const candidates = closestDatesMap.get(Number(ligne.article_id)) ?? [];

                  return (
                    <div key={ligne.id} className="rounded-xl bg-white px-4 py-3 text-sm">
                      <p className="font-semibold text-slate-900">
                        {getArticleName(ligne.articles)}{" "}
                        <span className="font-semibold text-red-600">- manque {manque}</span>
                      </p>

                      {candidates.length > 0 ? (
                        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <p className="font-semibold">
                            Aucun stock a moins de 2 mois - dates disponibles les plus proches
                            (a valider manuellement) :
                          </p>
                          <ul className="no-print mt-1 max-h-48 space-y-1.5 overflow-y-auto pr-2">
                            {candidates.map((candidate) => (
                              <li
                                key={candidate.lot_stock_id}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <span>
                                  {candidate.numero_lot} - {formatDate(candidate.date_fabrication)} - qt{" "}
                                  {candidate.qty}
                                </span>
                                {canEditCommandes ? (
                                  <form action={addManualFifoLotAction}>
                                    <input type="hidden" name="commande_id" value={selectedCommande.id} />
                                    <input type="hidden" name="commande_ligne_id" value={ligne.id} />
                                    <input
                                      type="hidden"
                                      name="lot_stock_id"
                                      value={candidate.lot_stock_id}
                                    />
                                    <button
                                      type="submit"
                                      className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white"
                                    >
                                      Confirmer
                                    </button>
                                  </form>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="print-section-dispatch mt-5 rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">
                Resultat FIFO avec numeros de lot
              </h3>
              <p className="text-sm text-slate-500">
                Meme logique que ton Excel: FIFO + regles continair.
              </p>
            </div>

            {fifoResults.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Aucun resultat FIFO encore. Clique sur &quot;Despatcher&quot;.
              </p>
            ) : (
              <form action={updateAllFifoResultsAction} className="mt-4">
                <input type="hidden" name="commande_id" value={selectedCommande.id} />

                {canEditCommandes ? (
                  <label className="mb-3 grid max-w-xs gap-1 text-xs font-semibold text-slate-500">
                    Preparateur (pour toute la commande)
                    <input
                      type="text"
                      name="preparateur"
                      defaultValue={selectedPreparateur}
                      placeholder="Preparateur"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                    />
                  </label>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[20%]" />
                      <col className="w-[16%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                      <col className="w-[16%]" />
                      <col className="w-[12%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Article</th>
                        <th className="px-4 py-3 font-semibold">Numero lot</th>
                        <th className="px-4 py-3 font-semibold">Date fab.</th>
                        <th className="px-4 py-3 font-semibold">Chambre</th>
                        <th className="px-4 py-3 font-semibold">Preparateur</th>
                        <th className="px-4 py-3 font-semibold">Qt chargee</th>
                        <th className="no-print px-4 py-3 font-semibold">Regle FIFO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fifoResults.map((ligne) => (
                        <tr key={ligne.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900 align-middle">
                            <input type="hidden" name="fifo_ids" value={ligne.id} />
                            {getArticleName(ligne.articles)}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {canEditCommandes ? (
                              <input
                                type="text"
                                name={`numero_lot_${ligne.id}`}
                                defaultValue={ligne.numero_lot || ""}
                                className="w-full max-w-[140px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                            ) : (
                              <span className="text-slate-700">{ligne.numero_lot || "-"}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700 align-middle">
                            {formatDate(ligne.date_fabrication)}
                          </td>
                          <td className="px-4 py-3 text-slate-700 align-middle">{ligne.chambre || "-"}</td>
                          <td className="px-4 py-3 align-middle">
                            <span className="text-slate-700">{selectedPreparateur || "-"}</span>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {canEditCommandes ? (
                              <input
                                type="number"
                                min="1"
                                step="1"
                                name={`quantite_chargee_${ligne.id}`}
                                defaultValue={ligne.quantite_chargee}
                                className="w-full max-w-[110px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-sky-700 outline-none"
                              />
                            ) : (
                              <span className="font-semibold text-sky-700">{ligne.quantite_chargee}</span>
                            )}
                          </td>
                          <td className="no-print px-4 py-3 text-slate-600 align-middle">
                            {ligne.regle_appliquee || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {canEditCommandes ? (
                  <div className="no-print mt-4">
                    <button
                      type="submit"
                      className="rounded-full bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white"
                    >
                      Enregistrer tout
                    </button>
                  </div>
                ) : null}
              </form>
            )}
          </div>

          {canEditCommandes ? (
            <details className="no-print mt-5 rounded-[1.5rem] border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Modifier cette commande
              </summary>

              <form action={updateManualCommandeAction} className="mt-4 grid gap-4">
                <input type="hidden" name="commande_id" value={selectedCommande.id} />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <input
                    type="text"
                    name="numero_proforma"
                    defaultValue={selectedCommande.numero_proforma}
                    placeholder="Numero proforma"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                    required
                  />
                  <input
                    type="text"
                    name="client"
                    defaultValue={selectedCommande.client}
                    list="clients-commandes"
                    placeholder="Client"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                    required
                  />
                  <select
                    name="statut"
                    defaultValue={
                      selectedCommande.statut === "STAND"
                        ? "STAND"
                        : selectedCommande.statut === "BL_TRANSFORME"
                          ? "BL_TRANSFORME"
                          : selectedCommande.statut === "LIVREE"
                            ? "LIVREE"
                            : "EN_COURS"
                    }
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  >
                    <option value="EN_COURS">En cours</option>
                    <option value="STAND">Stand</option>
                    <option value="BL_TRANSFORME">BL transforme</option>
                    <option value="LIVREE">Livree</option>
                  </select>
                  <select
                    name="mode_chargement"
                    defaultValue={selectedCommande.mode_chargement || "CAMION"}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  >
                    <option value="CAMION">Camion</option>
                    <option value="CONTINAIR">Continair</option>
                    <option value="TC">TC</option>
                    <option value="TC20">TC20</option>
                    <option value="TC40">TC40</option>
                  </select>
                  <label className="grid gap-1 text-xs font-semibold text-slate-600">
                    Nb de camion
                    <input
                      type="number"
                      name="type_tc"
                      min="1"
                      step="1"
                      defaultValue={selectedCommande.type_tc || "1"}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                </div>

                <p className="text-xs text-slate-500">
                  Attention : la quantite de chaque ligne ci-dessous est deja la quantite totale
                  (elle n&apos;est pas remultipliee si tu changes ce nombre ici).
                </p>

                <textarea
                  name="lignes"
                  rows={8}
                  defaultValue={(selectedCommande.commande_lignes ?? [])
                    .map((ligne) => `${getArticleName(ligne.articles)} | ${ligne.quantite_demandee}`)
                    .join("\n")}
                  className="rounded-[1.5rem] border border-slate-200 px-4 py-4 text-sm outline-none"
                  required
                />

                <datalist id="clients-commandes">
                  {clientOptions.map((client) => (
                    <option key={client} value={client} />
                  ))}
                </datalist>

                <div>
                  <button
                    type="submit"
                    className="rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white"
                  >
                    Enregistrer modification
                  </button>
                </div>
              </form>
            </details>
          ) : (
            <p className="mt-5 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : modification de commande cachee pour cet utilisateur.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
