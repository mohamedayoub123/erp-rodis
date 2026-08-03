"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canChangeStatusCommandesUser,
  canDeleteCommandesUser,
  canWritePageUser,
  getCurrentStockUser,
} from "@/lib/stock-auth";

function normalizeArticle(value: string) {
  return value.replace(/\u00a0/g, "").trim().toUpperCase();
}

// Toute creation/modification/suppression de commande peut changer ce que
// montrent les pages statistique, tableau-commandes et stock dormant sans
// commande (elles lisent toutes les commandes/leur statut) - sans ca, une
// commande supprimee peut continuer a s'afficher sur ces pages tant que le
// cache de navigation cote client n'a pas ete invalide.
function revalidateCommandeDependentPages(commandeId?: number) {
  revalidatePath("/commandes");
  if (commandeId) {
    revalidatePath(`/commandes/${commandeId}`);
  }
  revalidatePath("/fifo");
  revalidatePath("/tableau-commandes");
  revalidatePath("/stock-dormant-sans-commande");
  revalidatePath("/statistique-livraison");
  revalidatePath("/statistique-livraison-client");
  revalidatePath("/admin");
  revalidatePath("/");
}

async function requireCommandesWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandesNouvelle"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter des commandes.");
  }
}

async function requireCommandesEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandesDetail"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les commandes.");
  }
}

async function requireCommandesDeleteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeleteCommandesUser(currentUser))) {
    throw new Error("Cet utilisateur ne peut pas supprimer une commande.");
  }
}

async function requireCommandesChangeStatusAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canChangeStatusCommandesUser(currentUser))) {
    throw new Error("Cet utilisateur ne peut pas changer le statut d'une commande.");
  }
}

function extractPreparateur(commentaire: string | null | undefined) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith("PREPARATEUR_COMMANDE:"));
  return token ? token.replace("PREPARATEUR_COMMANDE:", "").trim() : "";
}

function upsertPreparateurComment(commentaire: string | null | undefined, preparateur: string) {
  const parts = (commentaire || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith("PREPARATEUR_COMMANDE:"));

  if (preparateur.trim()) {
    parts.push(`PREPARATEUR_COMMANDE:${preparateur.trim()}`);
  }

  return parts.join(" | ");
}

function extractStatusDateValue(commentaire: string | null | undefined, statusKey: string) {
  if (!commentaire) return "";

  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith(`STATUT_DATE_${statusKey}:`));
  return token ? token.replace(`STATUT_DATE_${statusKey}:`, "").trim() : "";
}

function upsertStatusDateComment(
  commentaire: string | null | undefined,
  statusKey: "EN_COURS" | "STAND" | "BL_TRANSFORME" | "LIVREE",
  dateValue?: string
) {
  const finalDate = (dateValue || new Date().toISOString().slice(0, 10)).trim();
  const parts = (commentaire || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith(`STATUT_DATE_${statusKey}:`));

  parts.push(`STATUT_DATE_${statusKey}:${finalDate}`);
  return parts.join(" | ");
}

function applyStatusDateComment(
  commentaire: string | null | undefined,
  statusValue: string | null | undefined
) {
  const upperStatus = String(statusValue || "").trim().toUpperCase();

  if (upperStatus === "STAND") {
    return upsertStatusDateComment(commentaire, "STAND");
  }

  if (upperStatus === "BL_TRANSFORME") {
    return upsertStatusDateComment(commentaire, "BL_TRANSFORME");
  }

  if (upperStatus === "LIVREE") {
    return upsertStatusDateComment(commentaire, "LIVREE");
  }

  return upsertStatusDateComment(commentaire, "EN_COURS");
}

function upsertTransitionDateComment(
  commentaire: string | null | undefined,
  transitionKey: "STAND_ENCOURS" | "ENCOURS_BLTRANSFORME" | "ENCOURS_LIVREE",
  dateValue?: string
) {
  const finalDate = (dateValue || new Date().toISOString().slice(0, 10)).trim();
  const parts = (commentaire || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith(`DATE_TRANSITION_${transitionKey}:`));

  parts.push(`DATE_TRANSITION_${transitionKey}:${finalDate}`);
  return parts.join(" | ");
}

function applyTransitionDateComment(
  commentaire: string | null | undefined,
  statusValue: string | null | undefined
) {
  const upperStatus = String(statusValue || "").trim().toUpperCase();

  if (
    upperStatus === "EN_COURS" ||
    upperStatus === "STAND" ||
    upperStatus === "FIFO_PARTIEL" ||
    upperStatus === "FIFO_CALCULE" ||
    upperStatus === "SAISIE_WEB"
  ) {
    return upsertTransitionDateComment(commentaire, "STAND_ENCOURS");
  }

  if (upperStatus === "BL_TRANSFORME") {
    return upsertTransitionDateComment(commentaire, "ENCOURS_BLTRANSFORME");
  }

  if (upperStatus === "LIVREE") {
    return upsertTransitionDateComment(commentaire, "ENCOURS_LIVREE");
  }

  return commentaire || "";
}

function sanitizeMetaValue(value: string) {
  return value.replaceAll("|", "/").trim();
}

function buildCommandeSortieMetaLine(
  code: string,
  livrePour: string,
  numeroBl: string,
  preparateur: string,
  quantite: number
) {
  const codeValue = sanitizeMetaValue(code);
  const client = sanitizeMetaValue(livrePour);
  const bl = sanitizeMetaValue(numeroBl);
  const preparateurValue = sanitizeMetaValue(preparateur);

  if (!codeValue && !client && !bl && !preparateurValue) {
    return "";
  }

  return `SORTIEWEB|${new Date().toISOString().slice(0, 10)}|${codeValue || "-"}|${client || "-"}|${bl || "-"}|${preparateurValue || "-"}|${Number(quantite)}`;
}

function appendSortieMeta(existingNote: string | null | undefined, lines: string[]) {
  const base = String(existingNote || "").trim();
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);

  if (cleanLines.length === 0) {
    return base || null;
  }

  if (!base) {
    return cleanLines.join("\n");
  }

  return `${base}\n${cleanLines.join("\n")}`;
}

type ParsedLine = {
  article: string;
  quantite: number;
};

type StockSummaryRow = {
  article_id: number;
  article_normalise: string;
  stock_total: number;
  stock_2_mois: number;
  stock_4_mois: number;
  stock_6_mois: number;
};

type LotAvailabilityRow = {
  id: number;
  article_id: number;
  numero_lot: string | null;
  code_normalise: string | null;
  date_jour: string | null;
  chambre: string | null;
  stock_restant: number;
  date_fabrication: string | null;
  code_pays?: string | null;
  qte_entree?: number | null;
  qte_sortie?: number | null;
};

type ReservedArticleRow = {
  article_id: number;
  quantite_chargee: number;
};

type FifoLotRow = {
  id: number;
  article_id: number;
  numero_lot: string;
  code_normalise: string;
  date_fabrication: string | null;
  date_jour: string | null;
  chambre: string | null;
  code_pays?: string | null;
  stock_restant: number;
};

function parseLines(raw: string): ParsedLine[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 2) {
        throw new Error(`Ligne invalide: ${line}`);
      }

      const article = parts[0].trim();
      const quantite = Number(parts[1].trim().replace(",", "."));

      if (!article || Number.isNaN(quantite) || quantite <= 0) {
        throw new Error(`Ligne invalide: ${line}`);
      }

      return { article, quantite };
    });
}

async function getReservedByArticle(excludeCommandeId?: number) {
  let query = supabaseServer
    .from("fifo_resultats")
    .select("article_id, quantite_chargee, commandes!inner(statut)")
    .neq("commandes.statut", "LIVREE");

  if (excludeCommandeId) {
    query = query.neq("commande_id", excludeCommandeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const reservedMap = new Map<number, number>();

  for (const row of (data as ReservedArticleRow[] | null) ?? []) {
    reservedMap.set(
      row.article_id,
      (reservedMap.get(row.article_id) ?? 0) + Number(row.quantite_chargee ?? 0)
    );
  }

  return reservedMap;
}

async function fetchLotsStockRows<T>(
  selectClause: string,
  articleIds?: number[]
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("lots_stock")
      .select(selectClause)
      .order("date_jour", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (articleIds && articleIds.length > 0) {
      query = query.in("article_id", articleIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const currentRows = (data as T[] | null) ?? [];
    rows.push(...currentRows);

    if (currentRows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

// Le solde d'un lot (article_id + code_normalise/numero_lot) doit etre calcule
// en additionnant TOUTES ses lignes avant de regarder son age - sinon une
// grosse entree ancienne (ex: solde d'ouverture importe en vrac, date
// factice) et ses sorties recentes (date_fabrication recente) finissent
// dans des tranches d'age differentes et faussent completement le calcul
// (une tranche peut meme devenir negative). Regle "plus ancienne date
// gagne" pour la date representative du lot, comme partout ailleurs.
async function getArticleAvailabilityMap(articleIds?: number[]) {
  const data = await fetchLotsStockRows<LotAvailabilityRow>(
    "article_id, numero_lot, code_normalise, date_fabrication, qte_entree, qte_sortie",
    articleIds
  );

  const lotBalances = new Map<
    string,
    { article_id: number; qty: number; date_fabrication: string | null }
  >();

  for (const row of data) {
    if (!row.article_id) continue;

    const key = buildLotAvailabilityKey(row.article_id, row.code_normalise || row.numero_lot);
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
  const stockMap = new Map<number, StockSummaryRow>();

  for (const lot of lotBalances.values()) {
    if (lot.qty <= 0) continue;

    const current = stockMap.get(lot.article_id) ?? {
      article_id: lot.article_id,
      article_normalise: "",
      stock_total: 0,
      stock_2_mois: 0,
      stock_4_mois: 0,
      stock_6_mois: 0,
    };

    current.stock_total += lot.qty;

    if (lot.date_fabrication) {
      const ageMonths = monthsBetween(new Date(lot.date_fabrication), today);

      if (ageMonths <= 2) current.stock_2_mois += lot.qty;
      if (ageMonths <= 4) current.stock_4_mois += lot.qty;
      if (ageMonths <= 6) current.stock_6_mois += lot.qty;
    }

    stockMap.set(lot.article_id, current);
  }

  return stockMap;
}

function buildLotAvailabilityKey(articleId: number | null, codeOrLot: string | null | undefined) {
  return `${articleId ?? 0}::${String(codeOrLot || "").trim().toUpperCase()}`;
}

function getPositiveCodeLots(lots: FifoLotRow[]) {
  return lots.filter((lot) => Math.max(0, Number(lot.stock_restant ?? 0)) > 0);
}

async function getLatestLotAvailabilityRows(articleIds?: number[]) {
  const data = await fetchLotsStockRows<LotAvailabilityRow>(
    "id, article_id, numero_lot, code_normalise, date_jour, chambre, date_fabrication, qte_entree, qte_sortie",
    articleIds
  );

  const latestByLot = new Map<string, LotAvailabilityRow>();

  for (const row of data) {
    if (!row.article_id) continue;

    const lotKey = buildLotAvailabilityKey(
      row.article_id,
      row.code_normalise || row.numero_lot
    );

    const previous = latestByLot.get(lotKey);
    const mouvement =
      Number((row as LotAvailabilityRow & { qte_entree?: number | null }).qte_entree ?? 0) -
      Number((row as LotAvailabilityRow & { qte_sortie?: number | null }).qte_sortie ?? 0);

    latestByLot.set(lotKey, {
      id: row.id,
      article_id: row.article_id,
      numero_lot: String(row.numero_lot || row.code_normalise || "").trim(),
      code_normalise: String(row.code_normalise || row.numero_lot || "").trim().toUpperCase(),
      date_jour: row.date_jour,
      chambre: row.chambre,
      date_fabrication: row.date_fabrication,
      stock_restant: Number(previous?.stock_restant ?? 0) + mouvement,
    });
  }

  return [...latestByLot.values()];
}

async function buildStockSnapshot(articleIds?: number[]) {
  const data = await fetchLotsStockRows<LotAvailabilityRow>(
    "id, article_id, numero_lot, code_normalise, date_jour, chambre, date_fabrication, code_pays, qte_entree, qte_sortie",
    articleIds
  );

  const latestByLot = new Map<string, LotAvailabilityRow>();

  for (const row of data) {
    if (!row.article_id) continue;

    const qty = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    const lotKey = buildLotAvailabilityKey(
      row.article_id,
      row.code_normalise || row.numero_lot
    );
    const previous = latestByLot.get(lotKey);
    // Plus ancienne date_fabrication gagne pour representer le lot (meme
    // convention que le reste de l'app), pour eviter qu'une entree ancienne
    // et une sortie recente du meme lot se retrouvent dans des tranches
    // d'age differentes.
    const previousDate = previous?.date_fabrication ?? null;
    const olderDate =
      row.date_fabrication && (!previousDate || new Date(row.date_fabrication).getTime() < new Date(previousDate).getTime())
        ? row.date_fabrication
        : previousDate ?? row.date_fabrication;

    latestByLot.set(lotKey, {
      id: row.id,
      article_id: row.article_id,
      numero_lot: String(row.numero_lot || row.code_normalise || "").trim(),
      code_normalise: String(row.code_normalise || row.numero_lot || "").trim().toUpperCase(),
      date_jour: row.date_jour,
      chambre: row.chambre,
      date_fabrication: olderDate,
      code_pays: row.code_pays,
      stock_restant: Number(previous?.stock_restant ?? 0) + qty,
    });
  }

  // Le solde net de chaque lot (pas chaque ligne brute) determine sa
  // tranche d'age - sinon une grosse entree ancienne (solde d'ouverture
  // importe en vrac) et les sorties recentes qui la consomment se
  // retrouvent dans des tranches differentes et faussent stock_2_mois/etc.
  // (une tranche peut meme devenir negative).
  const today = new Date();
  const stockMap = new Map<number, StockSummaryRow>();

  for (const lot of latestByLot.values()) {
    const qty = Math.max(0, Number(lot.stock_restant ?? 0));
    if (qty <= 0) continue;

    const current = stockMap.get(lot.article_id) ?? {
      article_id: lot.article_id,
      article_normalise: "",
      stock_total: 0,
      stock_2_mois: 0,
      stock_4_mois: 0,
      stock_6_mois: 0,
    };

    current.stock_total += qty;

    if (lot.date_fabrication) {
      const ageMonths = monthsBetween(new Date(lot.date_fabrication), today);

      if (ageMonths <= 2) current.stock_2_mois += qty;
      if (ageMonths <= 4) current.stock_4_mois += qty;
      if (ageMonths <= 6) current.stock_6_mois += qty;
    }

    stockMap.set(lot.article_id, current);
  }

  return {
    articleAvailabilityMap: stockMap,
    latestLots: [...latestByLot.values()],
  };
}

function normalizeClientName(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

// Certains clients importes en masse ont un client_normalise qui garde les
// espaces (ex: "IPP SARL") au lieu de la convention utilisee par le
// formulaire "Ajouter client" (espaces retires: "IPPSARL") - on essaie donc
// plusieurs formes avant d'abandonner.
async function isClientFromCountry(clientName: string, countryKeyword: string) {
  const trimmed = (clientName || "").trim();

  if (!trimmed) {
    return false;
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
    const { data, error } = await attempt;

    if (error) {
      throw new Error(error.message);
    }

    const pays = (data?.pays || "").trim();

    if (pays) {
      return pays.toLowerCase().includes(countryKeyword);
    }
  }

  return false;
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

function monthsBetween(fromDate: Date, toDate: Date) {
  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
}

function applyFifoRuleForArticle(
  lots: FifoLotRow[],
  articleType: string | null | undefined,
  modeChargement: string | null | undefined
) {
  const type = (articleType || "").trim().toLowerCase();
  const isContainer = isContainerMode(modeChargement);

  if (!isContainer) {
    return {
      ruleName: "FIFO WEB STANDARD",
      lots: [...lots].sort((a, b) => {
        const dateA = a.date_fabrication ? new Date(a.date_fabrication).getTime() : 0;
        const dateB = b.date_fabrication ? new Date(b.date_fabrication).getTime() : 0;
        return dateA - dateB;
      }),
    };
  }

  if (type === "clarifiant") {
    const today = new Date();
    const eligibleLots = lots.filter((lot) => {
      if (!lot.date_fabrication) return false;
      const fabDate = new Date(lot.date_fabrication);
      return monthsBetween(fabDate, today) <= 2;
    });

    return {
      ruleName: "FIFO WEB CONTINAIR CLARIFIANT <= 2 MOIS",
      lots: eligibleLots.sort((a, b) => {
        const dateA = a.date_fabrication ? new Date(a.date_fabrication).getTime() : 0;
        const dateB = b.date_fabrication ? new Date(b.date_fabrication).getTime() : 0;
        return dateB - dateA;
      }),
    };
  }

  return {
    ruleName: "FIFO WEB CONTINAIR PLUS RECENT D'ABORD",
    lots: [...lots].sort((a, b) => {
      const dateA = a.date_fabrication ? new Date(a.date_fabrication).getTime() : 0;
      const dateB = b.date_fabrication ? new Date(b.date_fabrication).getTime() : 0;
      return dateB - dateA;
    }),
  };
}

function getRuleLimitedAvailability(
  availability: StockSummaryRow | undefined,
  articleType: string | null | undefined,
  modeChargement: string | null | undefined
) {
  const type = (articleType || "").trim().toLowerCase();
  const isContainer = isContainerMode(modeChargement);

  if (!availability) {
    return 0;
  }

  if (isContainer && type === "clarifiant") {
    return Math.max(0, Number(availability.stock_2_mois ?? 0));
  }

  return Math.max(0, Number(availability.stock_total ?? 0));
}

export async function createManualCommandeAction(formData: FormData) {
  await requireCommandesWriteAccess();
  const numeroProforma = String(formData.get("numero_proforma") || "").trim();
  const client = String(formData.get("client") || "").trim();
  const statut = String(formData.get("statut") || "").trim().toUpperCase();
  const modeChargement = String(formData.get("mode_chargement") || "").trim();
  const rawLines = String(formData.get("lignes") || "").trim();
  const nombreCamionRaw = Number(String(formData.get("nombre_camion") || "1").replace(",", "."));
  const nombreCamion = Number.isFinite(nombreCamionRaw) && nombreCamionRaw > 0 ? nombreCamionRaw : 1;
  // type_tc actually stores the truck/container COUNT (mode_chargement holds
  // the truck type - CAMION/CONTINAIR/TC20/TC40).
  const typeTc = String(nombreCamion);

  if (!numeroProforma || !client || !rawLines) {
    throw new Error("Numero proforma, client et lignes sont obligatoires.");
  }

  // One truck/container = one separate commande row, all sharing the same
  // numero_proforma. Each row keeps the per-truck quantity as typed (not
  // multiplied) so delivering one truck only affects that row - the others
  // stay "en cours" under the same proforma.
  const lignes = parseLines(rawLines);

  const { data: articlesData, error: articlesError } = await supabaseServer
    .from("articles")
    .select("id, nom_article, article_normalise");

  if (articlesError) {
    throw new Error(articlesError.message);
  }

  const articleMap = new Map(
    (articlesData ?? []).map((article) => [article.article_normalise, article])
  );

  const missingArticles = lignes
    .filter((line) => !articleMap.has(normalizeArticle(line.article)))
    .map((line) => line.article);

  if (missingArticles.length > 0) {
    throw new Error(`Articles introuvables: ${missingArticles.join(", ")}`);
  }

  const { data: existingCommande } = await supabaseServer
    .from("commandes")
    .select("id")
    .eq("numero_proforma", numeroProforma)
    .maybeSingle();

  if (existingCommande) {
    throw new Error(`La proforma ${numeroProforma} existe deja.`);
  }

  const stockByArticleId = await getArticleAvailabilityMap(
    lignes.map((line) => articleMap.get(normalizeArticle(line.article))?.id).filter(Boolean) as number[]
  );
  const reservedMap = await getReservedByArticle();
  // Every truck created in this same batch competes for the same stock, so
  // track what each earlier truck in the loop already claimed and subtract
  // it too, on top of what's reserved by other commandes.
  const claimedByThisBatch = new Map<number, number>();

  for (let truckIndex = 0; truckIndex < nombreCamion; truckIndex += 1) {
    // numero_proforma has a unique constraint in the DB, so trucks after the
    // first need a suffix to stay distinct rows. The suffix is stripped
    // everywhere the proforma is displayed, so the user only ever sees the
    // plain number.
    const truckProforma = truckIndex === 0 ? numeroProforma : `${numeroProforma}-${truckIndex + 1}`;

    const { data: insertedCommandes, error: commandeError } = await supabaseServer
      .from("commandes")
      .insert([
        {
          numero_proforma: truckProforma,
          client,
          mode_chargement: modeChargement || null,
          type_tc: typeTc || null,
          statut: statut || "EN_COURS",
          commentaire: applyTransitionDateComment(
            applyStatusDateComment("Commande creee depuis la web", statut || "EN_COURS"),
            statut || "EN_COURS"
          ),
        },
      ])
      .select("id");

    if (commandeError || !insertedCommandes || insertedCommandes.length === 0) {
      throw new Error(commandeError?.message || "Impossible de creer la commande.");
    }

    const commandeId = insertedCommandes[0].id;

    const payload = lignes.map((line) => {
      const article = articleMap.get(normalizeArticle(line.article))!;
      const stock = stockByArticleId.get(article.id);
      const reserved =
        Number(reservedMap.get(article.id) ?? 0) + Number(claimedByThisBatch.get(article.id) ?? 0);
      const stockTotal = Math.max(0, Number(stock?.stock_total ?? 0) - reserved);
      const stock2 = Math.max(0, Number(stock?.stock_2_mois ?? 0) - reserved);
      const stock4 = Math.max(0, Number(stock?.stock_4_mois ?? 0) - reserved);
      const stock6 = Math.max(0, Number(stock?.stock_6_mois ?? 0) - reserved);

      claimedByThisBatch.set(article.id, Number(claimedByThisBatch.get(article.id) ?? 0) + line.quantite);

      return {
        commande_id: commandeId,
        article_id: article.id,
        quantite_demandee: line.quantite,
        qt_non_dispo_total: Math.max(0, line.quantite - stockTotal),
        qt_non_dispo_2_mois: Math.max(0, line.quantite - stock2),
        qt_non_dispo_4_mois: Math.max(0, line.quantite - stock4),
        qt_non_dispo_6_mois: Math.max(0, line.quantite - stock6),
      };
    });

    const { error: lignesError } = await supabaseServer
      .from("commande_lignes")
      .insert(payload);

    if (lignesError) {
      throw new Error(lignesError.message);
    }
  }

  revalidateCommandeDependentPages();
  redirect("/commandes");
}

export async function updateManualCommandeAction(formData: FormData) {
  await requireCommandesEditAccess();
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  const numeroProforma = String(formData.get("numero_proforma") || "").trim();
  const client = String(formData.get("client") || "").trim();
  const statut = String(formData.get("statut") || "").trim().toUpperCase();
  const modeChargement = String(formData.get("mode_chargement") || "").trim();
  const typeTc = String(formData.get("type_tc") || "").trim();
  const rawLines = String(formData.get("lignes") || "").trim();

  if (!commandeId || !numeroProforma || !client || !rawLines) {
    throw new Error("Commande, numero proforma, client et lignes sont obligatoires.");
  }

  const lignes = parseLines(rawLines);

  const { data: articlesData, error: articlesError } = await supabaseServer
    .from("articles")
    .select("id, article_normalise");

  if (articlesError) {
    throw new Error(articlesError.message);
  }

  const articleMap = new Map(
    (articlesData ?? []).map((article) => [article.article_normalise, article])
  );
  const stockByArticleId = await getArticleAvailabilityMap(
    lignes.map((line) => articleMap.get(normalizeArticle(line.article))?.id).filter(Boolean) as number[]
  );
  const reservedMap = await getReservedByArticle(commandeId);

  const missingArticles = lignes
    .filter((line) => !articleMap.has(normalizeArticle(line.article)))
    .map((line) => line.article);

  if (missingArticles.length > 0) {
    throw new Error(`Articles introuvables: ${missingArticles.join(", ")}`);
  }

  const { data: duplicateCommande } = await supabaseServer
    .from("commandes")
    .select("id")
    .eq("numero_proforma", numeroProforma)
    .neq("id", commandeId)
    .maybeSingle();

  if (duplicateCommande) {
    throw new Error(`La proforma ${numeroProforma} existe deja sur une autre commande.`);
  }

  const { error: updateCommandeError } = await supabaseServer
    .from("commandes")
    .update({
      numero_proforma: numeroProforma,
      client,
      mode_chargement: modeChargement || null,
      type_tc: typeTc || null,
      statut: statut || "EN_COURS",
      commentaire: applyTransitionDateComment(
        applyStatusDateComment("Commande modifiee depuis la web", statut || "EN_COURS"),
        statut || "EN_COURS"
      ),
    })
    .eq("id", commandeId);

  if (updateCommandeError) {
    throw new Error(updateCommandeError.message);
  }

  const { error: deleteFifoError } = await supabaseServer
    .from("fifo_resultats")
    .delete()
    .eq("commande_id", commandeId);

  if (deleteFifoError) {
    throw new Error(deleteFifoError.message);
  }

  const { error: deleteLinesError } = await supabaseServer
    .from("commande_lignes")
    .delete()
    .eq("commande_id", commandeId);

  if (deleteLinesError) {
    throw new Error(deleteLinesError.message);
  }

  const payload = lignes.map((line) => {
    const article = articleMap.get(normalizeArticle(line.article))!;
    const stock = stockByArticleId.get(article.id);
    const reserved = Number(reservedMap.get(article.id) ?? 0);
    const stockTotal = Math.max(0, Number(stock?.stock_total ?? 0) - reserved);
    const stock2 = Math.max(0, Number(stock?.stock_2_mois ?? 0) - reserved);
    const stock4 = Math.max(0, Number(stock?.stock_4_mois ?? 0) - reserved);
    const stock6 = Math.max(0, Number(stock?.stock_6_mois ?? 0) - reserved);

    return {
      commande_id: commandeId,
      article_id: article.id,
      quantite_demandee: line.quantite,
      qt_non_dispo_total: Math.max(0, line.quantite - stockTotal),
      qt_non_dispo_2_mois: Math.max(0, line.quantite - stock2),
      qt_non_dispo_4_mois: Math.max(0, line.quantite - stock4),
      qt_non_dispo_6_mois: Math.max(0, line.quantite - stock6),
    };
  });

  const { error: insertLinesError } = await supabaseServer
    .from("commande_lignes")
    .insert(payload);

  if (insertLinesError) {
    throw new Error(insertLinesError.message);
  }

  revalidateCommandeDependentPages(commandeId);
}

export async function calculateFifoForCommandeAction(formData: FormData) {
  await requireCommandesEditAccess();
  const commandeId = Number(String(formData.get("commande_id") || "0"));

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const { data: commande, error: commandeError } = await supabaseServer
    .from("commandes")
    .select(
      "id, numero_proforma, client, mode_chargement, commande_lignes(id, article_id, quantite_demandee, articles(type_article)), commentaire"
    )
    .eq("id", commandeId)
    .single();

  if (commandeError || !commande) {
    throw new Error(commandeError?.message || "Commande introuvable.");
  }

  const lignes = commande.commande_lignes ?? [];

  if (lignes.length === 0) {
    throw new Error("Cette commande ne contient aucune ligne.");
  }

  const isUgandaClient = await isClientFromCountry(commande.client, "ouganda");
  const articleIds = [...new Set(lignes.map((line) => line.article_id))];
  const [{ articleAvailabilityMap, latestLots }, reservedResponse] = await Promise.all([
    buildStockSnapshot(articleIds),
    supabaseServer
      .from("fifo_resultats")
      .select("lot_stock_id, quantite_chargee")
      .neq("commande_id", commandeId),
  ]);

  const lotsData = latestLots.filter((row) => Number(row.stock_restant ?? 0) > 0);
  const { data: reservedData, error: reservedError } = reservedResponse;

  if (reservedError) {
    throw new Error(reservedError.message);
  }

  const reservedByLot = new Map<number, number>();
  for (const row of (reservedData as { lot_stock_id: number | null; quantite_chargee: number }[] | null) ??
    []) {
    if (!row.lot_stock_id) continue;
    reservedByLot.set(
      row.lot_stock_id,
      (reservedByLot.get(row.lot_stock_id) ?? 0) + Number(row.quantite_chargee ?? 0)
    );
  }

  const lotsByArticle = new Map<number, FifoLotRow[]>();

  for (const lot of lotsData ?? []) {
    const list = lotsByArticle.get(lot.article_id) ?? [];
    const reservedQty = Number(reservedByLot.get(lot.id) ?? 0);
    const availableQty = Math.max(0, Number(lot.stock_restant) - reservedQty);
    list.push({
      ...lot,
      numero_lot: String(lot.numero_lot || "").trim(),
      code_normalise: String(lot.code_normalise || lot.numero_lot || "").trim().toUpperCase(),
      stock_restant: availableQty,
    });
    lotsByArticle.set(lot.article_id, list);
  }

  const fifoPayload: {
    commande_id: number;
    commande_ligne_id: number;
    article_id: number;
    lot_stock_id: number;
    numero_lot: string;
    date_fabrication: string | null;
    chambre: string | null;
    quantite_chargee: number;
    ordre_ligne: number;
    regle_appliquee: string;
  }[] = [];

  let ordre = 1;
  const shortageByLine = new Map<number, number>();
  const chargedByLine = new Map<number, number>();

  for (const ligne of lignes) {
    const rawLots = lotsByArticle.get(ligne.article_id) ?? [];
    const articleRelation = ligne.articles as
      | { type_article?: string | null }
      | { type_article?: string | null }[]
      | null
      | undefined;
    const articleType = Array.isArray(articleRelation)
      ? articleRelation[0]?.type_article
      : articleRelation?.type_article;
    const articleAvailability = articleAvailabilityMap.get(ligne.article_id);
    const maxAllowedForRule = getRuleLimitedAvailability(
      articleAvailability,
      articleType,
      commande.mode_chargement
    );
    let qtyToLoad = Math.min(Number(ligne.quantite_demandee), maxAllowedForRule);
    const { ruleName: baseRuleName, lots: ruleLots } = applyFifoRuleForArticle(
      getPositiveCodeLots(rawLots),
      articleType,
      commande.mode_chargement
    );

    // Ouganda : un lot marque avec un code_pays (peu importe la valeur) est
    // reserve pour ce client et doit etre pris en priorite, meme si un lot
    // "normal" (sans code_pays) est aussi disponible pour le meme article.
    const hasCodePaysLot = ruleLots.some((lot) => (lot.code_pays || "").trim() !== "");
    const lots =
      isUgandaClient && hasCodePaysLot
        ? [...ruleLots].sort((a, b) => {
            const aHasCodePays = (a.code_pays || "").trim() !== "" ? 0 : 1;
            const bHasCodePays = (b.code_pays || "").trim() !== "" ? 0 : 1;
            return aHasCodePays - bHasCodePays;
          })
        : ruleLots;
    const ruleName =
      isUgandaClient && hasCodePaysLot ? `${baseRuleName} + CODE PAYS OUGANDA` : baseRuleName;

    for (const lot of lots) {
      if (qtyToLoad <= 0) break;
      if (Math.max(0, Number(lot.stock_restant ?? 0)) <= 0) continue;

      const takeQty = Math.min(qtyToLoad, Math.max(0, Number(lot.stock_restant ?? 0)));
      if (takeQty <= 0) continue;

      fifoPayload.push({
        commande_id: commandeId,
        commande_ligne_id: ligne.id,
        article_id: ligne.article_id,
        lot_stock_id: lot.id,
        numero_lot: lot.numero_lot,
        date_fabrication: lot.date_fabrication,
        chambre: lot.chambre,
        quantite_chargee: takeQty,
        ordre_ligne: ordre,
        regle_appliquee: ruleName,
      });

      qtyToLoad -= takeQty;
      lot.stock_restant -= takeQty;
      chargedByLine.set(
        ligne.id,
        (chargedByLine.get(ligne.id) ?? 0) + Number(takeQty)
      );
      ordre += 1;
    }

    const totalCharged = Number(chargedByLine.get(ligne.id) ?? 0);
    shortageByLine.set(ligne.id, Math.max(0, Number(ligne.quantite_demandee) - totalCharged));
  }

  const { error: deleteError } = await supabaseServer
    .from("fifo_resultats")
    .delete()
    .eq("commande_id", commandeId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (fifoPayload.length > 0) {
    const { error: insertError } = await supabaseServer
      .from("fifo_resultats")
      .insert(fifoPayload);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  await Promise.all(
    lignes.map(async (ligne) => {
      const shortage = Number(shortageByLine.get(ligne.id) ?? 0);
      const { error: updateLineError } = await supabaseServer
        .from("commande_lignes")
        .update({
          qt_non_dispo_total: shortage,
        })
        .eq("id", ligne.id);

      if (updateLineError) {
        throw new Error(updateLineError.message);
      }
    })
  );

  const commentaireBase = commande.commentaire ? `${commande.commentaire} | ` : "";
  const totalShortage = [...shortageByLine.values()].reduce((sum, value) => sum + value, 0);
  const newStatus = totalShortage > 0 ? "FIFO_PARTIEL" : "FIFO_CALCULE";
  const commentWithStatusDate = upsertStatusDateComment(
    commande.commentaire,
    "EN_COURS"
  );
  const commentWithTransitionDate = applyTransitionDateComment(
    commentWithStatusDate,
    "EN_COURS"
  );
  const { error: updateError } = await supabaseServer
    .from("commandes")
    .update({
      statut: newStatus,
      commentaire:
        `${commentWithTransitionDate}${commentWithTransitionDate ? " | " : ""}FIFO web calcule automatiquement` +
        (totalShortage > 0 ? ` | Reste a charger: ${totalShortage}` : ""),
    })
    .eq("id", commandeId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateCommandeDependentPages(commandeId);
}

// Ajoute manuellement un lot propose (hors fenetre <= 2 mois pour un
// article clarifiant/container) comme ligne FIFO supplementaire, quand
// l'utilisateur clique "Confirmer" sur une des dates les plus proches
// proposees dans "Articles manquants".
export async function addManualFifoLotAction(formData: FormData) {
  await requireCommandesEditAccess();
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  const commandeLigneId = Number(String(formData.get("commande_ligne_id") || "0"));
  const lotStockId = Number(String(formData.get("lot_stock_id") || "0"));

  if (!commandeId || !commandeLigneId || !lotStockId) {
    throw new Error("Donnees invalides pour ajouter ce lot.");
  }

  const [{ data: ligne, error: ligneError }, { data: lot, error: lotError }] = await Promise.all([
    supabaseServer
      .from("commande_lignes")
      .select("id, article_id, qt_non_dispo_total")
      .eq("id", commandeLigneId)
      .single(),
    supabaseServer
      .from("lots_stock")
      .select("id, article_id, numero_lot, code_normalise, date_fabrication, chambre")
      .eq("id", lotStockId)
      .single(),
  ]);

  if (ligneError || !ligne) {
    throw new Error(ligneError?.message || "Ligne de commande introuvable.");
  }

  if (lotError || !lot) {
    throw new Error(lotError?.message || "Lot introuvable.");
  }

  // On recalcule le solde reel du lot (net de tous ses mouvements, moins ce
  // que d'autres commandes ont deja charge dessus) plutot que de faire
  // confiance a une quantite affichee cote client, potentiellement perimee.
  const [{ data: lotRows, error: lotRowsError }, { data: reservedRows, error: reservedError }] =
    await Promise.all([
      supabaseServer
        .from("lots_stock")
        .select("qte_entree, qte_sortie")
        .eq("article_id", lot.article_id)
        .eq("code_normalise", lot.code_normalise || lot.numero_lot),
      supabaseServer.from("fifo_resultats").select("quantite_chargee").eq("lot_stock_id", lotStockId),
    ]);

  if (lotRowsError) {
    throw new Error(lotRowsError.message);
  }

  if (reservedError) {
    throw new Error(reservedError.message);
  }

  const lotBalance = (lotRows ?? []).reduce(
    (sum, row) => sum + Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0),
    0
  );
  const alreadyReserved = (reservedRows ?? []).reduce(
    (sum, row) => sum + Number(row.quantite_chargee ?? 0),
    0
  );
  const lotAvailable = Math.max(0, lotBalance - alreadyReserved);
  const shortage = Math.max(0, Number(ligne.qt_non_dispo_total ?? 0));
  const quantite = Math.min(lotAvailable, shortage);

  if (shortage <= 0) {
    throw new Error(
      "Il n'y a plus de manque sur cette ligne (deja resolu, peut-etre par un recalcul entretemps) - recharge la page."
    );
  }

  if (lotAvailable <= 0) {
    throw new Error(
      `Plus de stock disponible sur le lot ${lot.numero_lot || lot.code_normalise || ""} (deja pris par une autre commande) - recharge la page pour voir les dates encore disponibles.`
    );
  }

  const { data: maxOrdreRow } = await supabaseServer
    .from("fifo_resultats")
    .select("ordre_ligne")
    .eq("commande_id", commandeId)
    .order("ordre_ligne", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrdre = Number(maxOrdreRow?.ordre_ligne ?? 0) + 1;

  const { error: insertError } = await supabaseServer.from("fifo_resultats").insert({
    commande_id: commandeId,
    commande_ligne_id: commandeLigneId,
    article_id: lot.article_id,
    lot_stock_id: lotStockId,
    numero_lot: lot.numero_lot || lot.code_normalise || "",
    date_fabrication: lot.date_fabrication,
    chambre: lot.chambre,
    quantite_chargee: quantite,
    ordre_ligne: nextOrdre,
    regle_appliquee: "OVERRIDE MANUEL HORS 2 MOIS",
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: updateLigneError } = await supabaseServer
    .from("commande_lignes")
    .update({ qt_non_dispo_total: Math.max(0, shortage - quantite) })
    .eq("id", commandeLigneId);

  if (updateLigneError) {
    throw new Error(updateLigneError.message);
  }

  revalidateCommandeDependentPages(commandeId);
}

// Annule un batch FIFO deja despatche : supprime la reservation
// (fifo_resultats) et remet la commande a l'etat "pas encore calcule".
// Impossible une fois LIVREE - a ce stade le stock a deja ete physiquement
// sorti, annuler la reservation n'a plus de sens.
export async function cancelFifoBatchAction(formData: FormData) {
  await requireCommandesEditAccess();
  const commandeId = Number(String(formData.get("commande_id") || "0"));

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const { data: commande, error: commandeError } = await supabaseServer
    .from("commandes")
    .select("id, statut, commentaire, commande_lignes(id, quantite_demandee)")
    .eq("id", commandeId)
    .single();

  if (commandeError || !commande) {
    throw new Error(commandeError?.message || "Commande introuvable.");
  }

  if ((commande.statut || "").toUpperCase() === "LIVREE") {
    throw new Error("Cette commande est deja livree, le batch ne peut plus etre annule.");
  }

  const { error: deleteError } = await supabaseServer
    .from("fifo_resultats")
    .delete()
    .eq("commande_id", commandeId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await Promise.all(
    (commande.commande_lignes ?? []).map(async (ligne) => {
      const { error: updateLigneError } = await supabaseServer
        .from("commande_lignes")
        .update({ qt_non_dispo_total: Number(ligne.quantite_demandee ?? 0) })
        .eq("id", ligne.id);

      if (updateLigneError) {
        throw new Error(updateLigneError.message);
      }
    })
  );

  const { error: updateError } = await supabaseServer
    .from("commandes")
    .update({
      statut: "EN_COURS",
      commentaire: `${commande.commentaire ? `${commande.commentaire} | ` : ""}Batch FIFO annule manuellement`,
    })
    .eq("id", commandeId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateCommandeDependentPages(commandeId);
}

export async function deleteCommandeAction(formData: FormData) {
  await requireCommandesDeleteAccess();
  const commandeId = Number(String(formData.get("commande_id") || "0"));

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const { error } = await supabaseServer
    .from("commandes")
    .delete()
    .eq("id", commandeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeDependentPages();
}

export async function deleteProformaGroupAction(formData: FormData) {
  await requireCommandesDeleteAccess();
  const numeroProforma = String(formData.get("numero_proforma") || "").trim();

  if (!numeroProforma) {
    throw new Error("Proforma invalide.");
  }

  // Sibling trucks are stored as "<proforma>-2", "<proforma>-3"... to satisfy
  // the unique constraint on numero_proforma - match those too.
  const { error } = await supabaseServer
    .from("commandes")
    .delete()
    .or(`numero_proforma.eq.${numeroProforma},numero_proforma.like.${numeroProforma}-%`);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeDependentPages();
}

export async function changeCommandeStatusAction(formData: FormData) {
  await requireCommandesChangeStatusAccess();
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  const statut = String(formData.get("statut") || "")
    .trim()
    .toUpperCase();

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  if (!["EN_COURS", "STAND", "BL_TRANSFORME", "LIVREE"].includes(statut)) {
    throw new Error("Statut invalide.");
  }

  const { data: commande, error: commandeError } = await supabaseServer
    .from("commandes")
    .select("id, commentaire")
    .eq("id", commandeId)
    .single();

  if (commandeError || !commande) {
    throw new Error(commandeError?.message || "Commande introuvable.");
  }

  const commentaire = applyTransitionDateComment(
    applyStatusDateComment(commande.commentaire, statut),
    statut
  );

  const { error: updateError } = await supabaseServer
    .from("commandes")
    .update({
      statut,
      commentaire,
    })
    .eq("id", commandeId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateCommandeDependentPages(commandeId);
}

export async function deliverCommandeAction(formData: FormData) {
  await requireCommandesEditAccess();
  const commandeId = Number(String(formData.get("commande_id") || "0"));

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const { error } = await supabaseServer.rpc("stock_deliver_commande", {
    p_commande_id: commandeId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeDependentPages(commandeId);
  revalidatePath("/stock");
  revalidatePath("/stock-dormant");
}

export async function updateFifoResultAction(formData: FormData) {
  await requireCommandesEditAccess();
  const fifoId = Number(String(formData.get("fifo_id") || "0"));
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  const numeroLot = String(formData.get("numero_lot") || "").trim();
  const preparateur = String(formData.get("preparateur") || "").trim();
  const quantiteChargee = Number(String(formData.get("quantite_chargee") || "0").replace(",", "."));

  if (!fifoId || !commandeId) {
    throw new Error("Ligne FIFO invalide.");
  }

  if (!numeroLot) {
    throw new Error("Le code / numero de lot est obligatoire.");
  }

  if (Number.isNaN(quantiteChargee) || quantiteChargee <= 0) {
    throw new Error("La quantite chargee doit etre superieure a zero.");
  }

  const { error } = await supabaseServer.rpc("stock_override_fifo_result", {
    p_fifo_id: fifoId,
    p_commande_id: commandeId,
    p_numero_lot: numeroLot,
    p_preparateur: preparateur,
    p_quantite_chargee: quantiteChargee,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeDependentPages(commandeId);
}
