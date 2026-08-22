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
import { familyRank, articleTypeRank, articleContenanceFromName } from "@/lib/gamme-families";
import { logAudit } from "@/lib/audit-log";
import { fetchCoutsParCartonProduitsFinis, type LotUtiliseInfo } from "@/lib/prix-revient";
import {
  COMPTE_CLIENTS,
  COMPTE_STOCK_PRODUIT_FINI,
  COMPTE_VARIATION_STOCK_PF,
  COMPTE_VENTES,
  creerEcriture,
  enregistrerLotsUtilisesPourEcriture,
  resoudreOuCreerClient,
  supprimerEcriturePourSource,
} from "@/lib/comptabilite";

// Meme ordre que /articles/produit-fini et la page detail de la commande
// (voir sortCommandeLignesByFamily dans [id]/page.tsx) - le Despatcher doit
// traiter les lignes dans le meme ordre que celui affiche sur la commande,
// pour que "1ere ligne de la commande" = "1ere ligne dispatchee" (ordre_ligne
// des resultats FIFO qui en decoule).
function sortLignesByFamily<
  T extends {
    articles:
      | { nom_article?: string | null; gamme?: string | null }
      | { nom_article?: string | null; gamme?: string | null }[]
      | null;
  }
>(lignes: T[]): T[] {
  function resolveArticle(ligne: T) {
    const relation = ligne.articles;
    return Array.isArray(relation) ? relation[0] : relation;
  }

  return [...lignes].sort((a, b) => {
    const articleA = resolveArticle(a);
    const articleB = resolveArticle(b);

    const rankA = familyRank(articleA?.gamme ?? null);
    const rankB = familyRank(articleB?.gamme ?? null);
    if (rankA !== rankB) return rankA - rankB;

    const typeRankA = articleTypeRank(articleA?.nom_article ?? null);
    const typeRankB = articleTypeRank(articleB?.nom_article ?? null);
    if (typeRankA !== typeRankB) return typeRankA - typeRankB;

    const contenanceDiff =
      articleContenanceFromName(articleB?.nom_article ?? null) -
      articleContenanceFromName(articleA?.nom_article ?? null);
    if (contenanceDiff !== 0) return contenanceDiff;

    return String(articleA?.nom_article ?? "").localeCompare(String(articleB?.nom_article ?? ""), "fr", {
      sensitivity: "base",
    });
  });
}

// Separe une commande selectionnee avec "*, commande_lignes(*)" en
// {commande, lignes} - forme de snapshot utilisee par logAudit(avant) pour
// pouvoir tout reinserer tel quel via restaurerAuditLogAction (voir
// app/admin/historique/actions.ts).
function splitCommandeSnapshot(row: Record<string, unknown>) {
  const { commande_lignes, ...commande } = row;
  return { commande, lignes: (commande_lignes as unknown[] | null) ?? [] };
}

function normalizeArticle(value: string) {
  return value.replace(/\u00a0/g, "").trim().toUpperCase();
}

// Le <select> de statut ne propose que 4 choix (En cours/Stand/BL
// transforme/Livree) - un statut "technique" (FIFO_PARTIEL/FIFO_CALCULE/
// SAISIE_WEB) se range dans "En cours" pour l'affichage, comme partout
// ailleurs dans l'app (voir formatStatus). Sert a detecter si le Save
// represente un VRAI changement de statut (l'utilisateur a choisi un autre
// bouton) ou juste un Save sans y toucher - dans ce 2e cas, on ne doit pas
// ecraser la valeur technique precise avec "EN_COURS".
function statutBucket(value: string | null | undefined) {
  const v = (value || "").toUpperCase();
  return v === "STAND" || v === "BL_TRANSFORME" || v === "LIVREE" ? v : "EN_COURS";
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

// Retire les marqueurs commencant par l'un de ces prefixes (utilise pour
// invalider une date devenue perimee, ex: date "en cours" quand la commande
// repasse en Stand).
function clearCommentTokens(commentaire: string | null | undefined, prefixes: string[]) {
  const parts = (commentaire || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !prefixes.some((prefix) => part.startsWith(prefix)));

  return parts.join(" | ");
}

function applyStatusDateComment(
  commentaire: string | null | undefined,
  statusValue: string | null | undefined
) {
  const upperStatus = String(statusValue || "").trim().toUpperCase();

  if (upperStatus === "STAND") {
    // Retour en Stand : la date "en cours" precedente n'est plus valable -
    // la commande redevient en attente. Sans ca, une commande qui repasse
    // Stand -> En cours -> Stand -> En cours gardait sa toute premiere date
    // "en cours", faussant tout calcul de delai fait a partir d'elle.
    const cleared = clearCommentTokens(commentaire, [
      "STATUT_DATE_EN_COURS:",
      "DATE_TRANSITION_STAND_ENCOURS:",
    ]);
    return upsertStatusDateComment(cleared, "STAND");
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

  // "STAND_ENCOURS" doit representer la date de SORTIE du Stand - ne
  // jamais la poser quand le statut cible EST Stand (creation directe en
  // Stand, ou retour en Stand), sinon une commande encore en attente se
  // retrouvait avec une date "en cours" alors qu'elle n'a jamais bouge.
  if (
    upperStatus === "EN_COURS" ||
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

function statusDateKeyFor(statutValue: string | null | undefined): "EN_COURS" | "STAND" | "BL_TRANSFORME" | "LIVREE" {
  const upper = String(statutValue || "").trim().toUpperCase();
  if (upper === "STAND") return "STAND";
  if (upper === "BL_TRANSFORME") return "BL_TRANSFORME";
  if (upper === "LIVREE") return "LIVREE";
  return "EN_COURS";
}

// "Pret dans le stock" (case a cocher a cote de chaque proforma dans la
// liste des commandes) - encode dans commentaire comme les autres marqueurs
// de cette fonction (STATUT_DATE_/DATE_TRANSITION_) plutot que d'ajouter une
// colonne, pour ne pas avoir a migrer la table pour un simple flag+date.
function upsertPretStockComment(commentaire: string | null | undefined, checked: boolean) {
  const parts = (commentaire || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "PRET_STOCK:oui" && !part.startsWith("PRET_STOCK_DATE:"));

  if (checked) {
    parts.push("PRET_STOCK:oui");
    parts.push(`PRET_STOCK_DATE:${new Date().toISOString().slice(0, 10)}`);
  }

  return parts.join(" | ");
}

// Ne pose la date "entree dans ce statut"/sa date de transition QUE la
// premiere fois (token pas encore present) ou lors d'un vrai changement de
// bucket (voir statutBucket) - jamais a chaque simple resauvegarde
// (redispatch FIFO, edition du formulaire) de la meme commande deja dans ce
// bucket, sinon "Statistique livraison" (le delai "hors stand" se mesure
// depuis DATE_TRANSITION_STAND_ENCOURS) se retrouve faussee a chaque fois
// que la commande est retouchee.
function stampStatusDatesIfNeeded(
  existingCommentaire: string | null | undefined,
  previousStatut: string | null | undefined,
  nextStatut: string
) {
  const isRealTransition = statutBucket(previousStatut) !== statutBucket(nextStatut);
  const alreadyStamped = Boolean(extractStatusDateValue(existingCommentaire, statusDateKeyFor(nextStatut)));

  if (!isRealTransition && alreadyStamped) {
    return existingCommentaire || "";
  }

  return applyTransitionDateComment(applyStatusDateComment(existingCommentaire, nextStatut), nextStatut);
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
  const rows: ReservedArticleRow[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, le stock reserve au-dela de la
  // 1000e ligne etait ignore, ce qui pouvait entrainer une survente.
  while (true) {
    let query = supabaseServer
      .from("fifo_resultats")
      .select("article_id, quantite_chargee, commandes!inner(statut)")
      .neq("commandes.statut", "LIVREE")
      // Sans ordre explicite, la pagination range() peut sauter des lignes
      // entre 2 pages sur une table active (meme correctif que dans
      // app/commandes/[id]/page.tsx, confirme responsable d'un stock
      // "disponible" affiche a tort) - ici ca pourrait faire calculer un
      // stock reserve trop bas et donc surallouer du stock au dispatch FIFO.
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (excludeCommandeId) {
      query = query.neq("commande_id", excludeCommandeId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const chunk = (data as ReservedArticleRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const reservedMap = new Map<number, number>();

  for (const row of rows) {
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
    // d'age differentes. TOUTES les autres colonnes "d'identite" du lot
    // (id, numero_lot, chambre, code_pays...) suivent ce MEME choix -
    // avant, elles venaient a tort de la DERNIERE ligne vue quelle que soit
    // sa date (souvent une ligne de sortie/mouvement ulterieure du meme
    // code), ce qui faisait pointer fifo_resultats.lot_stock_id (rempli au
    // Dispatch avec cet id) vers cette ligne de sortie au lieu de la vraie
    // ligne d'entree - "Enregistrer tout" (stock_override_fifo_result, qui
    // resout son propre lot cible independamment) recalculait alors une
    // disponibilite incoherente avec ce que le Dispatch venait d'assigner.
    // A EGALITE de date_fabrication (tres frequent : l'entree et ses
    // sorties ulterieures du meme lot partagent souvent la meme date de
    // fabrication, seule leur date_jour differe) - l'id le plus petit
    // gagne, meme convention de departage que stock_override_fifo_result
    // cote SQL ("order by date_fabrication asc nulls last, id asc").
    const rowHasDate = Boolean(row.date_fabrication);
    const previousHasDate = Boolean(previous?.date_fabrication);
    let useRowAsRepresentative: boolean;
    if (!previous) {
      useRowAsRepresentative = true;
    } else if (rowHasDate && !previousHasDate) {
      useRowAsRepresentative = true;
    } else if (!rowHasDate && previousHasDate) {
      useRowAsRepresentative = false;
    } else if (rowHasDate && previousHasDate) {
      const rowTime = new Date(row.date_fabrication as string).getTime();
      const previousTime = new Date(previous.date_fabrication as string).getTime();
      useRowAsRepresentative = rowTime !== previousTime ? rowTime < previousTime : row.id < previous.id;
    } else {
      useRowAsRepresentative = row.id < previous.id;
    }
    const representative = useRowAsRepresentative ? row : previous!;

    latestByLot.set(lotKey, {
      id: representative.id,
      article_id: row.article_id,
      numero_lot: String(representative.numero_lot || representative.code_normalise || "").trim(),
      code_normalise: String(representative.code_normalise || representative.numero_lot || "").trim().toUpperCase(),
      date_jour: representative.date_jour,
      chambre: representative.chambre,
      date_fabrication: representative.date_fabrication,
      code_pays: representative.code_pays,
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

// Le formulaire commande n'offre que 3 valeurs pour mode_chargement :
// "CAMION", "TC20", "TC40" (voir app/commandes/nouvelle/page.tsx) - jamais
// le mot "conteneur"/"container" en toutes lettres. Les anciens tests sur
// ces mots ne matchaient donc jamais aucune vraie commande, empechant la
// regle FIFO conteneur de se declencher.
function isContainerMode(modeChargement: string | null | undefined) {
  const value = (modeChargement || "").toUpperCase();
  return (
    value.startsWith("TC") ||
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

async function fetchAllArticlesForCreateManualCommande() {
  const rows: { id: number; nom_article: string; article_normalise: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les articles au-dela du 1000e
  // etaient introuvables lors de la creation manuelle d'une commande.
  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, article_normalise")
      .range(from, from + pageSize - 1);

    if (error) return { data: rows, error };

    const chunk = (data ?? []) as { id: number; nom_article: string; article_normalise: string }[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
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

  const { data: articlesData, error: articlesError } = await fetchAllArticlesForCreateManualCommande();

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

  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "Commandes",
    action: "creation",
    cible: numeroProforma,
    resume: `Commande ${numeroProforma} creee (${client}, ${nombreCamion} camion${nombreCamion > 1 ? "s" : ""})`,
    apres: {
      numero_proforma: numeroProforma,
      client,
      mode_chargement: modeChargement || null,
      statut: statut || "EN_COURS",
      lignes,
    },
  });

  revalidateCommandeDependentPages();
  redirect("/commandes");
}

async function fetchAllArticlesForUpdateManualCommande() {
  const rows: { id: number; article_normalise: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les articles au-dela du 1000e
  // etaient introuvables lors de la modification d'une commande.
  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, article_normalise")
      .range(from, from + pageSize - 1);

    if (error) return { data: rows, error };

    const chunk = (data ?? []) as { id: number; article_normalise: string }[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
}

export async function updateManualCommandeAction(formData: FormData) {
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  try {
  await requireCommandesEditAccess();
  const numeroProforma = String(formData.get("numero_proforma") || "").trim();
  const client = String(formData.get("client") || "").trim();
  const statut = String(formData.get("statut") || "").trim().toUpperCase();
  const modeChargement = String(formData.get("mode_chargement") || "").trim();
  const typeTc = String(formData.get("type_tc") || "").trim();
  const rawLines = String(formData.get("lignes") || "").trim();

  if (!commandeId || !numeroProforma || !client || !rawLines) {
    throw new Error("Commande, numero proforma, client et lignes sont obligatoires.");
  }

  const { data: existingCommande, error: existingCommandeError } = await supabaseServer
    .from("commandes")
    .select("statut, commentaire, numero_proforma, client, mode_chargement, type_tc, commande_lignes(quantite_demandee, articles(nom_article))")
    .eq("id", commandeId)
    .single();

  if (existingCommandeError || !existingCommande) {
    throw new Error(existingCommandeError?.message || "Commande introuvable.");
  }

  // Snapshot "avant" (proforma/client/lignes lisibles) pour le diff affiche
  // sur la page Historique - capture avant tout DELETE/UPDATE plus bas.
  const avantModification = {
    numero_proforma: existingCommande.numero_proforma,
    client: existingCommande.client,
    mode_chargement: existingCommande.mode_chargement,
    type_tc: existingCommande.type_tc,
    statut: existingCommande.statut,
    lignes: (existingCommande.commande_lignes ?? []).map((ligne) => {
      const articleRelation = ligne.articles as
        | { nom_article?: string | null }
        | { nom_article?: string | null }[]
        | null
        | undefined;
      const nomArticle = Array.isArray(articleRelation) ? articleRelation[0]?.nom_article : articleRelation?.nom_article;
      return { article: nomArticle || "?", quantite: ligne.quantite_demandee };
    }),
  };

  // Une fois livree, le stock est deja sorti - la modifier (lignes,
  // statut...) apres coup creerait un decalage avec le stock reel.
  if ((existingCommande.statut || "").toUpperCase() === "LIVREE") {
    throw new Error("Commande deja livree : modification desactivee.");
  }

  const lignes = parseLines(rawLines);

  const { data: articlesData, error: articlesError } = await fetchAllArticlesForUpdateManualCommande();

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

  // Save sans avoir change le menu statut (meme bucket qu'avant) : garde le
  // statut technique existant (FIFO_CALCULE...) au lieu de l'ecraser par
  // "EN_COURS" juste parce que c'est ce que le select affichait.
  const finalStatut =
    statutBucket(statut) === statutBucket(existingCommande.statut)
      ? existingCommande.statut || "EN_COURS"
      : statut || "EN_COURS";

  const { error: updateCommandeError } = await supabaseServer
    .from("commandes")
    .update({
      numero_proforma: numeroProforma,
      client,
      mode_chargement: modeChargement || null,
      type_tc: typeTc || null,
      statut: finalStatut,
      commentaire: stampStatusDatesIfNeeded(existingCommande.commentaire, existingCommande.statut, finalStatut),
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

  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "Commandes",
    action: "modification",
    cible: numeroProforma,
    resume: `Commande ${numeroProforma} (${client}) modifiee`,
    avant: avantModification,
    apres: {
      numero_proforma: numeroProforma,
      client,
      mode_chargement: modeChargement || null,
      type_tc: typeTc || null,
      statut: finalStatut,
      lignes,
    },
  });

  revalidateCommandeDependentPages(commandeId);
  } catch (err) {
    commandeErreurRedirect(commandeId, err);
  }
}

async function fetchAllReservedLotsExcludingCommande(commandeId: number) {
  const rows: { lot_stock_id: number | null; quantite_chargee: number }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les lots reserves au-dela de la
  // 1000e ligne etaient ignores lors du calcul FIFO.
  while (true) {
    const { data, error } = await supabaseServer
      .from("fifo_resultats")
      .select("lot_stock_id, quantite_chargee, commandes!inner(statut)")
      .neq("commande_id", commandeId)
      // fifo_resultats n'est jamais nettoye apres une livraison (garde
      // comme historique) - une commande LIVREE ne represente donc plus une
      // vraie reservation "en attente" (sa consommation est deja reelle,
      // deja deduite du stock brut via qte_sortie au moment de la
      // livraison). Sans ce filtre (meme principe que getReservedByArticle
      // plus haut), elle etait comptee en plus et double-comptait cette
      // quantite, faisant paraitre un lot comme deja pris alors qu'il etait
      // encore reellement disponible pour une nouvelle commande.
      .neq("commandes.statut", "LIVREE")
      // Meme correctif d'ordre stable que getReservedByArticle plus haut -
      // sans ca, le calcul FIFO ("Despatcher") pouvait sous-compter des
      // reservations existantes et donc surallouer le meme lot 2 fois.
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: rows, error };

    const chunk =
      (data as { lot_stock_id: number | null; quantite_chargee: number }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
}

export async function calculateFifoForCommandeAction(formData: FormData) {
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  try {
  await requireCommandesEditAccess();

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  // Toute la logique metier (verrouillage stock, regles FIFO, ecriture
  // fifo_resultats/commande_lignes/commandes) vit desormais dans le RPC
  // stock_run_fifo (scripts/sql/stock_locking_functions.sql), execute sous
  // verrou pg_advisory_xact_lock par article - seul l'ordre d'affichage des
  // lignes (sortLignesByFamily, tri pur sans acces disque) reste calcule
  // ici et transmis au RPC.
  const { data: commande, error: commandeError } = await supabaseServer
    .from("commandes")
    .select("id, commande_lignes(id, articles(nom_article, gamme))")
    .eq("id", commandeId)
    .single();

  if (commandeError || !commande) {
    throw new Error(commandeError?.message || "Commande introuvable.");
  }

  // Meme ordre que la page detail de la commande (sortCommandeLignesByFamily)
  // - le Despatcher traite les lignes dans cet ordre, donc ordre_ligne des
  // resultats FIFO qui en decoule suit le meme ordre.
  const lignes = sortLignesByFamily(commande.commande_lignes ?? []);

  const { error } = await supabaseServer.rpc("stock_run_fifo", {
    p_commande_id: commandeId,
    p_ordered_ligne_ids: lignes.map((ligne) => ligne.id),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeDependentPages(commandeId);
  } catch (err) {
    commandeErreurRedirect(commandeId, err);
  }
}

// Les erreurs "throw new Error(...)" d'une Server Action appelee
// directement depuis du JS client (pas via <form action>, ex: dans
// startTransition) sont redigees en un message generique par Next.js en
// production, MEME pour un message propre ecrit a la main - confirme en
// comparant le texte affiche cote client aux vrais logs Vercel (le digest
// montrait le vrai message, le client un texte generique). Une valeur de
// retour normale ({ error: "..." }) n'est elle jamais redigee (ce n'est
// pas une exception), donc updateAllFifoResultsAction et
// addFifoLigneForNewArticleAction renvoient desormais leurs erreurs au
// lieu de les lancer, pour que le vrai message arrive enfin jusqu'a
// l'utilisateur sans avoir besoin de checker les logs Vercel a chaque fois.
export type FifoActionResult = { error: string } | undefined;

// Pour les actions encore appelees via <form action={...}> classique (pas
// de JS client autour pour attraper l'erreur) : au lieu de laisser
// l'exception remonter jusqu'a app/error.tsx (page de crash complete,
// message toujours redige en production - meme constat que ci-dessus),
// on redirige vers la meme page avec le vrai message en query string,
// exactement comme le fait deja saveTestLaboAction. La page le lit et
// l'affiche dans un bandeau rouge au lieu de planter.
function commandeErreurRedirect(commandeId: number, err: unknown): never {
  const message = err instanceof Error ? err.message : "Erreur inconnue.";
  redirect(`/commandes/${commandeId || ""}?erreur=${encodeURIComponent(message)}`);
}

// Ajoute manuellement un lot propose (hors fenetre <= 2 mois pour un
// article clarifiant/container) comme ligne FIFO supplementaire, quand
// l'utilisateur clique "Confirmer" sur une des dates les plus proches
// proposees dans "Articles manquants".
export async function addManualFifoLotAction(formData: FormData) {
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  try {
  await requireCommandesEditAccess();
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
  // que d'autres commandes NON LIVREES ont deja charge dessus) plutot que de
  // faire confiance a une quantite affichee cote client, potentiellement
  // perimee. Une commande LIVREE doit etre exclue (meme principe que
  // fetchAllReservedLotsExcludingCommande) : sa sortie de stock est deja
  // reellement comptabilisee dans qte_sortie du lot (via stock_deliver_commande),
  // donc soustraire EN PLUS son fifo_resultats.quantite_chargee revenait a
  // decompter la meme quantite livree 2 fois - un lot partiellement livre
  // sur plusieurs commandes apparaissait alors a tort a 0 disponible.
  const [{ data: lotRows, error: lotRowsError }, { data: reservedRows, error: reservedError }] =
    await Promise.all([
      supabaseServer
        .from("lots_stock")
        .select("qte_entree, qte_sortie")
        .eq("article_id", lot.article_id)
        .eq("code_normalise", lot.code_normalise || lot.numero_lot),
      supabaseServer
        .from("fifo_resultats")
        .select("quantite_chargee, commandes!inner(statut)")
        .eq("lot_stock_id", lotStockId)
        .neq("commandes.statut", "LIVREE"),
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
  } catch (err) {
    commandeErreurRedirect(commandeId, err);
  }
}

// Annule un batch FIFO deja despatche : supprime la reservation
// (fifo_resultats) et remet la commande a l'etat "pas encore calcule".
// Impossible une fois LIVREE - a ce stade le stock a deja ete physiquement
// sorti, annuler la reservation n'a plus de sens.
export async function cancelFifoBatchAction(formData: FormData) {
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  try {
  await requireCommandesEditAccess();

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

  // Ne pas faire regresser un statut deja avance (Stand/BL transforme) vers
  // "En cours" juste parce que le batch FIFO est annule - meme principe que
  // calculateFifoForCommandeAction/updateManualCommandeAction (statutBucket).
  const finalStatus =
    statutBucket(commande.statut) === "EN_COURS" ? "EN_COURS" : commande.statut || "EN_COURS";

  const { error: updateError } = await supabaseServer
    .from("commandes")
    .update({
      statut: finalStatus,
      commentaire: `${commande.commentaire ? `${commande.commentaire} | ` : ""}Batch FIFO annule manuellement`,
    })
    .eq("id", commandeId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateCommandeDependentPages(commandeId);
  } catch (err) {
    commandeErreurRedirect(commandeId, err);
  }
}

export async function deleteCommandeAction(formData: FormData) {
  await requireCommandesDeleteAccess();
  const commandeId = Number(String(formData.get("commande_id") || "0"));

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const { data: commandeAvantSuppression } = await supabaseServer
    .from("commandes")
    .select("*, commande_lignes(*)")
    .eq("id", commandeId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("commandes")
    .delete()
    .eq("id", commandeId);

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "Commandes",
    action: "suppression",
    cible: commandeAvantSuppression?.numero_proforma || `#${commandeId}`,
    resume: `Commande ${commandeAvantSuppression?.numero_proforma || `#${commandeId}`}${commandeAvantSuppression?.client ? ` (${commandeAvantSuppression.client})` : ""} supprimee`,
    avant: commandeAvantSuppression ? { commandes: [splitCommandeSnapshot(commandeAvantSuppression)] } : null,
  });

  revalidateCommandeDependentPages();
}

// Reduire le nombre de camions d'une commande existante (ex: 3 -> 2) revient
// a supprimer UNE des commandes-camion qui partagent la meme numero_proforma
// de base (voir createManualCommandeAction) - jamais la derniere, sinon
// utilise "Supprimer" sur la liste pour effacer toute la commande.
export async function deleteCommandeTruckAction(formData: FormData) {
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  const currentViewedId = Number(String(formData.get("current_viewed_id") || "0"));
  let nextRedirectTarget: string | null = null;

  try {
  await requireCommandesDeleteAccess();

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const { data: commande, error: fetchError } = await supabaseServer
    .from("commandes")
    .select("*, commande_lignes(*)")
    .eq("id", commandeId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!commande) {
    throw new Error("Commande introuvable.");
  }

  const baseProforma = commande.numero_proforma.replace(/-\d+$/, "");

  const { data: siblings, error: siblingsError } = await supabaseServer
    .from("commandes")
    .select("id")
    .or(`numero_proforma.eq.${baseProforma},numero_proforma.like.${baseProforma}-%`);

  if (siblingsError) {
    throw new Error(siblingsError.message);
  }

  if ((siblings?.length ?? 0) <= 1) {
    throw new Error(
      "Impossible de supprimer le dernier camion - utilise Supprimer sur la liste des commandes pour effacer toute la commande."
    );
  }

  const { error } = await supabaseServer.from("commandes").delete().eq("id", commandeId);

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "Commandes",
    action: "suppression",
    cible: commande.numero_proforma,
    resume: `Camion ${commande.numero_proforma} supprime`,
    avant: { commandes: [splitCommandeSnapshot(commande)] },
  });

  revalidateCommandeDependentPages();

  if (currentViewedId && currentViewedId === commandeId) {
    const nextId = siblings?.find((row) => row.id !== commandeId)?.id;
    nextRedirectTarget = nextId ? `/commandes/${nextId}` : "/commandes";
  }
  } catch (err) {
    commandeErreurRedirect(commandeId, err);
  }

  if (nextRedirectTarget) {
    redirect(nextRedirectTarget);
  }
}

export async function deleteProformaGroupAction(formData: FormData) {
  await requireCommandesDeleteAccess();
  const numeroProforma = String(formData.get("numero_proforma") || "").trim();

  if (!numeroProforma) {
    throw new Error("Proforma invalide.");
  }

  const { data: groupeAvantSuppression } = await supabaseServer
    .from("commandes")
    .select("*, commande_lignes(*)")
    .or(`numero_proforma.eq.${numeroProforma},numero_proforma.like.${numeroProforma}-%`);

  // Sibling trucks are stored as "<proforma>-2", "<proforma>-3"... to satisfy
  // the unique constraint on numero_proforma - match those too.
  const { error } = await supabaseServer
    .from("commandes")
    .delete()
    .or(`numero_proforma.eq.${numeroProforma},numero_proforma.like.${numeroProforma}-%`);

  if (error) {
    throw new Error(error.message);
  }

  const nombreCamions = groupeAvantSuppression?.length ?? 0;
  const client = groupeAvantSuppression?.[0]?.client;

  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "Commandes",
    action: "suppression",
    cible: numeroProforma,
    resume: `Commande ${numeroProforma}${client ? ` (${client})` : ""} supprimee entierement (${nombreCamions} camion${nombreCamions > 1 ? "s" : ""})`,
    avant: { commandes: (groupeAvantSuppression ?? []).map(splitCommandeSnapshot) },
  });

  revalidateCommandeDependentPages();
}

// Coche/decoche "Pret dans le stock" pour TOUTE la proforma d'un coup
// (tous les camions freres) - c'est un etat global de la commande, pas par
// camion, meme regroupement que deleteProformaGroupAction ci-dessus. Le
// commentaire de chaque camion garde ses propres marqueurs existants
// (STATUT_DATE_, DATE_TRANSITION_...), donc chaque ligne est mise a jour
// individuellement plutot qu'avec un seul .update() en masse.
export async function togglePretStockAction(formData: FormData) {
  await requireCommandesChangeStatusAccess();
  const numeroProforma = String(formData.get("numero_proforma") || "").trim();
  const checked = formData.get("pret_stock") === "on";

  if (!numeroProforma) {
    throw new Error("Proforma invalide.");
  }

  const { data: rows, error } = await supabaseServer
    .from("commandes")
    .select("id, commentaire")
    .or(`numero_proforma.eq.${numeroProforma},numero_proforma.like.${numeroProforma}-%`);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (rows as { id: number; commentaire: string | null }[] | null) ?? []) {
    const { error: updateError } = await supabaseServer
      .from("commandes")
      .update({ commentaire: upsertPretStockComment(row.commentaire, checked) })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
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
    .select("id, statut, commentaire, numero_proforma")
    .eq("id", commandeId)
    .single();

  if (commandeError || !commande) {
    throw new Error(commandeError?.message || "Commande introuvable.");
  }

  // Une fois livree, le stock est deja sorti - changer le statut ensuite
  // (y compris re-selectionner "Livree" par erreur, ce qui redeclencherait
  // deliverCommandeAction) creerait un decalage avec le stock reel.
  if ((commande.statut || "").toUpperCase() === "LIVREE") {
    throw new Error("Commande deja livree : le statut ne peut plus etre change.");
  }

  // Save sans avoir change le menu (meme bucket qu'avant) : ne touche a
  // rien, pour ne jamais ecraser un statut technique (FIFO_CALCULE...) par
  // "EN_COURS" juste parce que c'est ce que le select affichait.
  if (statutBucket(statut) === statutBucket(commande.statut)) {
    return;
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

  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "Commandes",
    action: "modification",
    cible: commande.numero_proforma,
    resume: `Commande ${commande.numero_proforma} : statut change de ${commande.statut || "-"} a ${statut}`,
    avant: { statut: commande.statut },
    apres: { statut },
  });

  revalidateCommandeDependentPages(commandeId);
}

// Ecritures Vente (Debit Client / Credit Ventes) + Cout de la vente (Debit
// Variation de stock PF / Credit Stock PF) au moment reel de la livraison
// (deliverCommandeAction) - le seul moment ou une commande devient une vraie
// sortie de stock. Quantite livree par article = fifo_resultats.quantite_chargee
// (deja la source de verite du stock reellement sorti par stock_deliver_commande,
// jamais recalculee autrement). 2 ecritures separees et independantes : le
// prix de vente (article.prix_vente ou prix_vente_speciaux si ce client en a
// un) et le cout de revient (fetchCoutsParCartonProduitsFinis) peuvent
// chacun etre connus ou non independamment de l'autre - jamais un montant
// devine, un article sans prix/cout connu est juste exclu de l'ecriture
// correspondante (jamais un total partiel traite comme complet). Try/catch
// qui n'interrompt jamais la livraison elle-meme si la comptabilite echoue.
// Exportee (au-dela du seul usage a la livraison) pour pouvoir etre
// rappelee directement quand le prix d'un lot MP deja utilise ici est
// corrige apres coup (voir lib/ecriture-recompute.ts) - ne depend d'aucune
// valeur de formulaire, tout vient de fifo_resultats/commandes deja
// enregistres, donc rejouable a l'identique a tout moment.
export async function creerEcritureVente(commandeId: number, currentUser: string | null) {
  try {
    const sourceIdVente = `${commandeId}`;
    await supprimerEcriturePourSource("commande_vente", sourceIdVente);
    await supprimerEcriturePourSource("commande_cout_vente", sourceIdVente);

    const { data: commande } = await supabaseServer
      .from("commandes")
      .select("client, numero_proforma")
      .eq("id", commandeId)
      .maybeSingle();
    if (!commande) return;

    const { data: fifoRows } = await supabaseServer
      .from("fifo_resultats")
      .select("article_id, quantite_chargee")
      .eq("commande_id", commandeId);

    const quantiteParArticle = new Map<number, number>();
    for (const row of (fifoRows ?? []) as { article_id: number | null; quantite_chargee: number }[]) {
      if (!row.article_id) continue;
      quantiteParArticle.set(
        row.article_id,
        (quantiteParArticle.get(row.article_id) ?? 0) + Number(row.quantite_chargee ?? 0)
      );
    }
    if (quantiteParArticle.size === 0) return;

    const articleIds = [...quantiteParArticle.keys()];
    const clientId = await resoudreOuCreerClient(commande.client || "");

    const [{ data: articlesData }, { data: speciauxData }, coutsParArticle] = await Promise.all([
      supabaseServer.from("articles").select("id, prix_vente").in("id", articleIds),
      clientId
        ? supabaseServer.from("prix_vente_speciaux").select("article_id, prix").eq("client_id", clientId).in("article_id", articleIds)
        : Promise.resolve({ data: [] as { article_id: number; prix: number }[] }),
      fetchCoutsParCartonProduitsFinis(articleIds, quantiteParArticle),
    ]);

    const prixStandardByArticle = new Map(
      ((articlesData ?? []) as { id: number; prix_vente: number | null }[]).map((a) => [a.id, a.prix_vente])
    );
    const prixSpecialByArticle = new Map(
      ((speciauxData ?? []) as { article_id: number; prix: number }[]).map((s) => [s.article_id, s.prix])
    );

    // Date de la LIVRAISON (aujourd'hui), pas la date de creation de la
    // commande (date_commande) - la vente comptable a lieu au moment reel ou
    // le stock sort, pas au moment ou la commande a ete passee.
    const dateEcriture = new Date().toISOString().slice(0, 10);

    let montantVente = 0;
    for (const [articleId, quantite] of quantiteParArticle) {
      const prix = prixSpecialByArticle.get(articleId) ?? prixStandardByArticle.get(articleId) ?? null;
      if (prix === null || prix <= 0) continue;
      montantVente += prix * quantite;
    }

    if (montantVente > 0 && clientId) {
      await creerEcriture({
        dateEcriture,
        pieceReference: commande.numero_proforma || null,
        libelle: `Vente - ${commande.numero_proforma || `#${commandeId}`} - ${commande.client || ""}`,
        sourceType: "commande_vente",
        sourceId: sourceIdVente,
        createdBy: currentUser,
        lignes: [
          { compteCode: COMPTE_CLIENTS, debit: montantVente, credit: 0 },
          { compteCode: COMPTE_VENTES, debit: 0, credit: montantVente },
        ],
      });
    }

    let montantCout = 0;
    const lotsUtilisesCout: LotUtiliseInfo[] = [];
    for (const [articleId, quantite] of quantiteParArticle) {
      const coutInfo = coutsParArticle.get(articleId);
      if (!coutInfo || coutInfo.coutParCarton === null) continue;
      montantCout += coutInfo.coutParCarton * quantite;
      lotsUtilisesCout.push(...coutInfo.lotsUtilises);
    }

    if (montantCout > 0) {
      const ecritureId = await creerEcriture({
        dateEcriture,
        pieceReference: commande.numero_proforma || null,
        libelle: `Cout de vente - ${commande.numero_proforma || `#${commandeId}`}`,
        sourceType: "commande_cout_vente",
        sourceId: sourceIdVente,
        createdBy: currentUser,
        lignes: [
          { compteCode: COMPTE_VARIATION_STOCK_PF, debit: montantCout, credit: 0 },
          { compteCode: COMPTE_STOCK_PRODUIT_FINI, debit: 0, credit: montantCout },
        ],
      });
      await enregistrerLotsUtilisesPourEcriture(ecritureId, lotsUtilisesCout);
    }
  } catch (comptaError) {
    console.error("Ecriture comptable vente echouee:", comptaError);
  }
}

export async function deliverCommandeAction(formData: FormData) {
  const commandeId = Number(String(formData.get("commande_id") || "0"));
  try {
  await requireCommandesEditAccess();

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const currentUser = await getCurrentStockUser();
  const numeroBl = String(formData.get("numero_bl") || "").trim();

  const { data: commandeAvantLivraison } = await supabaseServer
    .from("commandes")
    .select("numero_proforma, statut")
    .eq("id", commandeId)
    .maybeSingle();

  const { error } = await supabaseServer.rpc("stock_deliver_commande", {
    p_commande_id: commandeId,
    p_utilisateur: currentUser || "",
    p_numero_bl: numeroBl,
  });

  if (error) {
    throw new Error(error.message);
  }

  await creerEcritureVente(commandeId, currentUser);

  await logAudit({
    utilisateur: currentUser,
    module: "Commandes",
    action: "modification",
    cible: commandeAvantLivraison?.numero_proforma || `#${commandeId}`,
    resume: `Commande ${commandeAvantLivraison?.numero_proforma || `#${commandeId}`} livree${numeroBl ? ` (BL ${numeroBl})` : ""}`,
    avant: { statut: commandeAvantLivraison?.statut ?? null },
    apres: { statut: "LIVREE", numero_bl: numeroBl || null },
  });

  revalidateCommandeDependentPages(commandeId);
  revalidatePath("/stock");
  revalidatePath("/stock-dormant");
  } catch (err) {
    commandeErreurRedirect(commandeId, err);
  }

  // Retourne sur la liste des commandes une fois la livraison reussie -
  // rester sur le detail n'avait plus grand interet, le stock vient de
  // sortir. Place APRES le try/catch (jamais dedans) : redirect() lance
  // en interne une exception speciale que Next.js reconnait pour naviguer
  // - si elle etait a l'interieur du try, le catch juste au-dessus
  // l'attraperait par erreur et la traiterait comme un vrai echec.
  redirect("/commandes");
}

// Supprime une ligne du dispatch FIFO (sans toucher au stock - le lot
// n'a jamais ete sorti tant que la commande n'est pas Livree). Recalcule
// ensuite le manque de la ligne de commande touchee, meme logique que la
// fin de stock_override_fifo_result. Partagee par updateAllFifoResultsAction
// pour les lignes marquees "a supprimer" au moment de l'Enregistrer.
async function deleteOneFifoResult(fifoId: number, commandeId: number) {
  const { data: fifoRow, error: fifoRowError } = await supabaseServer
    .from("fifo_resultats")
    .select("commande_ligne_id")
    .eq("id", fifoId)
    .eq("commande_id", commandeId)
    .single();

  if (fifoRowError || !fifoRow) {
    throw new Error(fifoRowError?.message || "Ligne FIFO introuvable (deja supprimee ?).");
  }

  const { error: deleteError } = await supabaseServer.from("fifo_resultats").delete().eq("id", fifoId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (fifoRow.commande_ligne_id) {
    const [{ data: ligneData }, { data: remainingFifo }] = await Promise.all([
      supabaseServer
        .from("commande_lignes")
        .select("quantite_demandee")
        .eq("id", fifoRow.commande_ligne_id)
        .single(),
      supabaseServer
        .from("fifo_resultats")
        .select("quantite_chargee")
        .eq("commande_ligne_id", fifoRow.commande_ligne_id),
    ]);

    const charged = ((remainingFifo as { quantite_chargee: number | null }[] | null) ?? []).reduce(
      (sum, row) => sum + Number(row.quantite_chargee ?? 0),
      0
    );
    const shortage = Math.max(0, Number(ligneData?.quantite_demandee ?? 0) - charged);

    const { error: shortageError } = await supabaseServer
      .from("commande_lignes")
      .update({ qt_non_dispo_total: shortage })
      .eq("id", fifoRow.commande_ligne_id);

    if (shortageError) {
      throw new Error(shortageError.message);
    }
  }
}

// Appelee directement depuis FifoResultsTable (pas via <form action>) :
// code/quantite/preparateur ET les suppressions ne sont que du state local
// cote client jusqu'a ce bouton - rien n'est ecrit en base avant "Enregistrer
// tout", donc quitter sans enregistrer annule aussi bien les modifications
// que les suppressions. Etant appelee directement (comme une fonction JS
// normale, pas un submit de formulaire), une erreur ici rejette simplement
// la promesse et est attrapee cote client - plus besoin de rediriger avec
// un message d'erreur en query string.
//
// Sequentiel (pas Promise.all) : chaque appel relit/reecrit
// commandes.commentaire (valeur de secours), un envoi en parallele
// risquerait de faire perdre l'ecriture d'un appel par un autre.
export async function updateAllFifoResultsAction(formData: FormData): Promise<FifoActionResult> {
  try {
    await requireCommandesEditAccess();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }

  const commandeId = Number(String(formData.get("commande_id") || "0"));
  const fifoIds = formData
    .getAll("fifo_ids")
    .map((value) => Number(value))
    .filter(Boolean);
  const deletedFifoIds = formData
    .getAll("deleted_fifo_ids")
    .map((value) => Number(value))
    .filter(Boolean);

  if (!commandeId || (fifoIds.length === 0 && deletedFifoIds.length === 0)) {
    return { error: "Commande invalide." };
  }

  try {
    for (const fifoId of deletedFifoIds) {
      await deleteOneFifoResult(fifoId, commandeId);
    }

    for (const fifoId of fifoIds) {
      const numeroLot = String(formData.get(`numero_lot_${fifoId}`) || "").trim();
      const preparateur = String(formData.get(`preparateur_${fifoId}`) || "").trim();
      const quantiteChargee = Number(
        String(formData.get(`quantite_chargee_${fifoId}`) || "0").replace(",", ".")
      );

      if (!numeroLot) {
        return { error: "Le code / numero de lot est obligatoire sur chaque ligne." };
      }

      if (Number.isNaN(quantiteChargee) || quantiteChargee <= 0) {
        return { error: "La quantite chargee doit etre superieure a zero sur chaque ligne." };
      }

      const { error: rpcError } = await supabaseServer.rpc("stock_override_fifo_result", {
        p_fifo_id: fifoId,
        p_commande_id: commandeId,
        p_numero_lot: numeroLot,
        p_preparateur: preparateur,
        p_quantite_chargee: quantiteChargee,
      });

      if (rpcError) {
        return { error: rpcError.message };
      }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }

  revalidateCommandeDependentPages(commandeId);
}

// "Ajouter une ligne" sur le Resultat FIFO : dispatcher un produit qui
// n'a jamais ete demande dans cette commande (contrairement a
// addManualFifoLotAction, qui ne fait que combler le manque d'une ligne
// DEJA presente). Cree la ligne "demandee" correspondante (pour que ce
// produit se comporte normalement partout ailleurs : manque, impression...)
// puis un resultat FIFO qu'on resout immediatement via le meme RPC que le
// Save normal, pour ne pas dupliquer sa logique de validation du lot/stock.
export async function addFifoLigneForNewArticleAction(
  formData: FormData
): Promise<FifoActionResult> {
  try {
    await requireCommandesEditAccess();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue." };
  }

  const commandeId = Number(String(formData.get("commande_id") || "0"));
  const articleId = Number(String(formData.get("article_id") || "0"));
  const numeroLot = String(formData.get("numero_lot") || "").trim();
  const preparateur = String(formData.get("preparateur") || "").trim();
  const quantiteChargee = Number(String(formData.get("quantite_chargee") || "0").replace(",", "."));

  if (!commandeId || !articleId) {
    return { error: "Commande ou article invalide." };
  }

  if (!numeroLot) {
    return { error: "Le code / numero de lot est obligatoire." };
  }

  if (Number.isNaN(quantiteChargee) || quantiteChargee <= 0) {
    return { error: "La quantite doit etre superieure a zero." };
  }

  // Verifie le stock reel AVANT de creer quoi que ce soit : le picker
  // affiche parfois un chiffre perime (page ouverte depuis un moment,
  // stock change entretemps par une autre commande/tentative) - sans ce
  // garde-fou, la ligne de commande + la ligne FIFO etaient creees quand
  // meme puis abandonnees en l'etat (orphelines) des que le RPC rejetait
  // le code juste apres, faute de stock reel (voir commande_lignes 9180 /
  // fifo_resultats 3880, nettoyees manuellement le 2026-08-11).
  const { data: stockRows, error: stockError } = await supabaseServer
    .from("lots_stock")
    .select("qte_entree, qte_sortie")
    .eq("article_id", articleId)
    .or(`numero_lot.eq.${numeroLot},code_normalise.eq.${numeroLot}`);

  if (stockError) {
    return { error: stockError.message };
  }

  const rawStock = (stockRows ?? []).reduce(
    (sum, row) => sum + Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0),
    0
  );

  // Une commande LIVREE ne compte pas comme "reservee" : sa sortie de stock
  // est deja reellement comptabilisee dans qte_sortie (rawStock ci-dessus)
  // - la compter en plus ici revenait a decompter la meme quantite 2 fois
  // et affichait a tort "stock insuffisant" sur un lot partiellement
  // livre sur plusieurs commandes (meme principe que
  // fetchAllReservedLotsExcludingCommande / stock_run_fifo).
  const { data: reservedRows, error: reservedError } = await supabaseServer
    .from("fifo_resultats")
    .select("quantite_chargee, commandes!inner(statut)")
    .eq("article_id", articleId)
    .eq("numero_lot", numeroLot)
    .neq("commandes.statut", "LIVREE");

  if (reservedError) {
    return { error: reservedError.message };
  }

  const alreadyReserved = (reservedRows ?? []).reduce(
    (sum, row) => sum + Number(row.quantite_chargee ?? 0),
    0
  );

  const reallyAvailable = rawStock - alreadyReserved;

  if (reallyAvailable < quantiteChargee) {
    return {
      error: `Stock insuffisant pour le code ${numeroLot} : ${Math.max(0, reallyAvailable)} disponible reellement (la page affichait peut-etre un chiffre perime - recharge la page pour voir le stock a jour).`,
    };
  }

  // Cet article peut deja etre demande sur cette commande (ex: FIFO deja
  // dispatche sur 2 codes qui couvrent tout le besoin, et on veut juste
  // ajouter/remplacer un lot supplementaire) - dans ce cas, on rattache le
  // nouveau resultat FIFO a la ligne EXISTANTE au lieu d'en creer une 2eme,
  // sans jamais toucher a sa quantite_demandee (le "commande" doit rester
  // ce qui a vraiment ete demande, quel que soit ce qui est ajoute ensuite
  // en resultat FIFO - sinon 200 demandes + 100 ajoutes affichait a tort
  // 300 de demande au lieu de 200 demandes / 300 charges).
  const { data: existingLigne, error: existingLigneError } = await supabaseServer
    .from("commande_lignes")
    .select("id")
    .eq("commande_id", commandeId)
    .eq("article_id", articleId)
    .maybeSingle();

  if (existingLigneError) {
    return { error: existingLigneError.message };
  }

  let ligneId = existingLigne?.id as number | undefined;
  // Le rollback plus bas ne doit jamais supprimer une ligne qui existait
  // deja AVANT cet appel (elle appartient a la commande, pas a cet ajout).
  const createdNewLigne = !ligneId;

  if (!ligneId) {
    const { data: newLigne, error: ligneError } = await supabaseServer
      .from("commande_lignes")
      .insert({ commande_id: commandeId, article_id: articleId, quantite_demandee: quantiteChargee })
      .select("id")
      .single();

    if (ligneError || !newLigne) {
      return { error: ligneError?.message || "Erreur pendant la creation de la ligne." };
    }

    ligneId = newLigne.id;
  }

  const newLigne = { id: ligneId };

  const { data: maxOrdreRow } = await supabaseServer
    .from("fifo_resultats")
    .select("ordre_ligne")
    .eq("commande_id", commandeId)
    .order("ordre_ligne", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrdre = Number(maxOrdreRow?.ordre_ligne ?? 0) + 1;

  const { data: newFifo, error: fifoError } = await supabaseServer
    .from("fifo_resultats")
    .insert({
      commande_id: commandeId,
      commande_ligne_id: newLigne.id,
      article_id: articleId,
      // numero_lot est NOT NULL en base - mis au code choisi tout de suite
      // (le RPC juste apres le remplace de toute facon par la valeur exacte
      // du lot trouve). Sans ca, cet insert echouait toujours (constraint
      // violation), avant meme d'atteindre le RPC.
      numero_lot: numeroLot,
      // Idem pour quantite_chargee : la contrainte ck_fifo_quantite_chargee
      // interdit 0 en base - mis a la quantite reellement demandee tout de
      // suite (deja validee > 0 plus haut), le RPC la recalcule de toute
      // facon juste apres avec la valeur exacte validee. Sans ca, cet
      // insert echouait toujours (meme constraint violation).
      quantite_chargee: quantiteChargee,
      ordre_ligne: nextOrdre,
    })
    .select("id")
    .single();

  if (fifoError || !newFifo) {
    // La ligne de commande n'est retiree que si elle vient d'etre creee par
    // CET appel (jamais une ligne qui existait deja avant, meme si l'ajout
    // de son resultat FIFO supplementaire echoue).
    if (createdNewLigne) {
      await supabaseServer.from("commande_lignes").delete().eq("id", newLigne.id);
    }
    return { error: fifoError?.message || "Erreur pendant la creation de la ligne FIFO." };
  }

  const { error: rpcError } = await supabaseServer.rpc("stock_override_fifo_result", {
    p_fifo_id: newFifo.id,
    p_commande_id: commandeId,
    p_numero_lot: numeroLot,
    p_preparateur: preparateur,
    p_quantite_chargee: quantiteChargee,
  });

  if (rpcError) {
    // Le RPC a rejete le code (ex: plus de stock reel) - le resultat FIFO
    // cree juste avant est retire pour ne pas laisser de donnee orpheline
    // pointant vers un code sans stock. La ligne de commande n'est retiree
    // que si elle vient d'etre creee par CET appel (jamais une ligne
    // preexistante).
    await supabaseServer.from("fifo_resultats").delete().eq("id", newFifo.id);
    if (createdNewLigne) {
      await supabaseServer.from("commande_lignes").delete().eq("id", newLigne.id);
    }
    return { error: rpcError.message };
  }

  revalidateCommandeDependentPages(commandeId);
}
