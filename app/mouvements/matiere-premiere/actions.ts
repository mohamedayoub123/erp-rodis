"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchCoutsReelsMpDepotB } from "@/lib/prix-revient";
import { COMPTE_PERTES_STOCK, COMPTE_STOCK_MP, creerEcriture } from "@/lib/comptabilite";

// Supprime une ligne de detail puis, si c'etait la derniere ligne de son
// mouvement (groupe), renvoie vers la liste au lieu de laisser la page
// detail se rafraichir sur un groupe qui n'existe plus plus (notFound()).
async function deleteMpDetailLineAndRedirectIfEmpty(lotId: number) {
  const { data: lotRow } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("mouvement_groupe_id")
    .eq("id", lotId)
    .maybeSingle();

  const groupeId = (lotRow as { mouvement_groupe_id: number | null } | null)?.mouvement_groupe_id ?? null;

  const { error } = await supabaseServer.rpc("stock_mp_delete_lot", { p_lot_id: lotId });

  if (error) {
    throw new Error(error.message);
  }

  revalidateMouvementsMpPages();

  if (groupeId) {
    const { count } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select("id", { count: "exact", head: true })
      .eq("mouvement_groupe_id", groupeId);

    if (!count) {
      redirect("/mouvements/matiere-premiere");
    }
  }
}

type PendingEntreeMpRow = {
  article_id: number;
  date_reception: string;
  quantite: number;
  unite?: string;
  numero_lot: string;
  date_fabrication?: string;
  date_expiration?: string;
  fournisseur?: string;
  n_doss_erp?: string;
  n_doss_4d?: string;
  emplacement?: string;
  note?: string;
};

type PendingSortieMpRow = {
  article_id: number;
  numero_lot: string;
  date_sortie: string;
  quantite: number;
  client?: string;
  n_doss_erp?: string;
  n_doss_4d?: string;
  note?: string;
  admin?: boolean;
};

async function requireMouvementsMpEntreeWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiereEntree"))) {
    throw new Error("Cet utilisateur ne peut pas saisir des mouvements matiere premiere.");
  }

  return currentUser;
}

async function requireMouvementsMpSortieWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiereSortie"))) {
    throw new Error("Cet utilisateur ne peut pas saisir des mouvements matiere premiere.");
  }

  return currentUser;
}

async function requireMouvementsMpSortieAdminWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiereSortieAdmin"))) {
    throw new Error("Cet utilisateur n'a pas l'autorisation Sortie Admin (stock force).");
  }

  return currentUser;
}

function revalidateMouvementsMpPages() {
  revalidatePath("/stock/matiere-premiere/stock");
  revalidatePath("/mouvements/matiere-premiere");
  revalidatePath("/dashboard");
}

export async function createEntreeMpBatchAction(formData: FormData) {
  const currentUser = await requireMouvementsMpEntreeWriteAccess();

  const rawPayload = String(formData.get("payload") || "").trim();

  if (!rawPayload) {
    throw new Error("Aucune entree a approuver.");
  }

  let rows: PendingEntreeMpRow[] = [];

  try {
    rows = JSON.parse(rawPayload) as PendingEntreeMpRow[];
  } catch {
    throw new Error("Le contenu des entrees est invalide.");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Aucune entree a approuver.");
  }

  // Sans depot, l'entree est invisible dans les colonnes "Disponible Depot"
  // (Verifier Stock, TO/TI) et le filtre Depot de Stock MP - meme si la
  // quantite existe bien en base.
  const articleIds = [...new Set(rows.map((row) => Number(row.article_id)).filter(Boolean))];
  const { data: articleDepotRows } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, depot_id")
    .in("id", articleIds);
  const depotIdByArticleId = new Map(
    ((articleDepotRows as { id: number; depot_id: number | null }[] | null) ?? []).map((row) => [row.id, row.depot_id])
  );

  const payload = rows.map((row) => {
    const articleId = Number(row.article_id);
    const quantite = Number(row.quantite);
    const numeroLot = String(row.numero_lot || "").trim();
    const dateReception = String(row.date_reception || "").trim();

    if (!articleId || !numeroLot || !dateReception || !quantite || quantite <= 0) {
      throw new Error("Une entree est incomplete ou invalide.");
    }

    return {
      article_id: articleId,
      date_jour: dateReception,
      date_reception: dateReception,
      numero_lot: numeroLot,
      code_normalise: numeroLot.toUpperCase(),
      date_fabrication: String(row.date_fabrication || "").trim() || null,
      date_expiration: String(row.date_expiration || "").trim() || null,
      qte_entree: quantite,
      qte_sortie: 0,
      unite: String(row.unite || "").trim() || null,
      depot_id: depotIdByArticleId.get(articleId) ?? null,
      fournisseur: String(row.fournisseur || "").trim() || null,
      n_doss_erp: String(row.n_doss_erp || "").trim() || null,
      n_doss_4d: String(row.n_doss_4d || "").trim() || null,
      emplacement: String(row.emplacement || "").trim() || null,
      note: String(row.note || "").trim() || null,
      utilisateur: currentUser,
      source_import: "web:entree-mp",
    };
  });

  const { data, error } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .insert(payload)
    .select("id, n_doss_erp, n_doss_4d");

  if (error) {
    throw new Error(error.message);
  }

  // Un seul TE par dossier (Doss ERP + Doss 4D) au sein de ce meme lot
  // d'approbation - pas globalement dans le temps : si des lignes validees
  // ensemble ont des dossiers differents, elles forment plusieurs TE
  // distincts plutot qu'un seul TE melangeant plusieurs dossiers.
  const insertedRows = (data ?? []) as { id: number; n_doss_erp: string | null; n_doss_4d: string | null }[];
  const idsByDossier = new Map<string, number[]>();
  for (const row of insertedRows) {
    const key = `${row.n_doss_erp ?? ""}|||${row.n_doss_4d ?? ""}`;
    const list = idsByDossier.get(key) ?? [];
    list.push(row.id);
    idsByDossier.set(key, list);
  }

  const groupeIds: number[] = [];
  for (const ids of idsByDossier.values()) {
    const groupeId = Math.min(...ids);
    groupeIds.push(groupeId);
    const { error: groupError } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .update({ mouvement_groupe_id: groupeId })
      .in("id", ids);

    if (groupError) {
      throw new Error(groupError.message);
    }
  }

  revalidateMouvementsMpPages();

  return { ok: true, groupe_ids: groupeIds };
}

export async function createSortieMpBatchAction(formData: FormData) {
  const rawPayload = String(formData.get("payload") || "").trim();

  if (!rawPayload) {
    throw new Error("Aucune sortie a approuver.");
  }

  let rows: PendingSortieMpRow[] = [];

  try {
    rows = JSON.parse(rawPayload) as PendingSortieMpRow[];
  } catch {
    throw new Error("Le contenu des sorties est invalide.");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Aucune sortie a approuver.");
  }

  // L'autorisation "Sortie Admin" est distincte et separee de la sortie
  // normale - un lot avec au moins une ligne admin exige le droit admin,
  // meme si l'utilisateur a par ailleurs le droit de sortie normale.
  const hasAdminRows = rows.some((row) => Boolean(row.admin));
  const currentUser = hasAdminRows
    ? await requireMouvementsMpSortieAdminWriteAccess()
    : await requireMouvementsMpSortieWriteAccess();

  const lignes = rows.map((row) => {
    const articleId = Number(row.article_id);
    const numeroLot = String(row.numero_lot || "").trim();
    const quantite = Number(row.quantite);
    const dateSortie = String(row.date_sortie || "").trim();

    if (!articleId || !numeroLot || !quantite || quantite <= 0 || !dateSortie) {
      throw new Error("Une sortie est incomplete ou invalide.");
    }

    return {
      article_id: articleId,
      numero_lot: numeroLot,
      code_normalise: numeroLot.toUpperCase(),
      date_sortie: dateSortie,
      quantite,
      client: String(row.client || "").trim(),
      n_doss_erp: String(row.n_doss_erp || "").trim(),
      n_doss_4d: String(row.n_doss_4d || "").trim(),
      note: String(row.note || "").trim(),
      utilisateur: currentUser || "",
      admin: Boolean(row.admin),
    };
  });

  const { data: rpcResult, error } = await supabaseServer.rpc("stock_mp_record_sortie_batch", {
    p_lignes: lignes,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Ecriture comptable automatique (Perte sur stock) - une Sortie MP saisie
  // ici n'est jamais liee a une vraie consommation de production (celle-la
  // passe par la reservation Salle de pesage/conditionnement, deja
  // comptabilisee ailleurs) : par definition, cette matiere premiere quitte
  // le stock sans jamais devenir un produit, donc sans contrepartie -
  // demande explicite : toujours une perte, pas de case a cocher. Jamais
  // generee si le prix n'est pas connu (jamais un montant devine). Try/catch
  // qui n'interrompt pas la sortie si la comptabilite echoue.
  try {
    const parArticle = new Map<number, { quantite: number; lots: Set<string> }>();
    for (const l of lignes) {
      const g = parArticle.get(l.article_id) ?? { quantite: 0, lots: new Set<string>() };
      g.quantite += l.quantite;
      g.lots.add(l.numero_lot);
      parArticle.set(l.article_id, g);
    }

    const articleIds = [...parArticle.keys()];
    const [couts, { data: articlesData }] = await Promise.all([
      fetchCoutsReelsMpDepotB(
        [...parArticle.entries()].map(([articleId, info]) => ({ articleMpId: articleId, quantite: info.quantite }))
      ),
      supabaseServer.from("articles_matiere_premiere").select("id, nom_article").in("id", articleIds),
    ]);
    const nomById = new Map(((articlesData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article]));
    const dateEcriture = new Date().toISOString().slice(0, 10);
    const batchRef = (rpcResult as { groupes?: number[] } | null)?.groupes?.[0] ?? Date.now();

    for (const [articleId, info] of parArticle) {
      const montant = couts.get(articleId)?.coutFcfa;
      if (montant === undefined || montant <= 0) continue;

      const lotsTexte = [...info.lots].join(", ");
      await creerEcriture({
        dateEcriture,
        pieceReference: lotsTexte,
        libelle: `Perte MP - ${nomById.get(articleId) ?? `#${articleId}`} - ${lotsTexte}`,
        sourceType: "perte_mp_sortie",
        sourceId: `${batchRef}-${articleId}`,
        createdBy: lignes[0]?.utilisateur || null,
        lignes: [
          { compteCode: COMPTE_PERTES_STOCK, debit: montant, credit: 0 },
          { compteCode: COMPTE_STOCK_MP, debit: 0, credit: montant },
        ],
      });
    }
  } catch (comptaError) {
    console.error("Ecriture comptable perte MP (Sortie MP) echouee:", comptaError);
  }

  revalidateMouvementsMpPages();

  return { ok: true };
}

// Supprime tout un mouvement TE/TS matiere premiere (toutes ses lignes).
export async function deleteMouvementMpGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "mouvementsMatierePremiere"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer un mouvement.");
  }

  const groupeId = Number(String(formData.get("groupe_id") || "0"));

  if (!groupeId) {
    throw new Error("Mouvement invalide.");
  }

  const { error } = await supabaseServer.rpc("stock_mp_delete_lot_group", { p_groupe_id: groupeId });

  if (error) {
    throw new Error(error.message);
  }

  revalidateMouvementsMpPages();
}

export async function deleteLotFromEntreeMpDetailAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "mouvementsMatierePremiereEntreeDetail"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer une ligne.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));

  if (!lotId) {
    throw new Error("Ligne stock matiere premiere invalide.");
  }

  await deleteMpDetailLineAndRedirectIfEmpty(lotId);
}

export async function deleteLotFromSortieMpDetailAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "mouvementsMatierePremiereSortieDetail"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer une ligne.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));

  if (!lotId) {
    throw new Error("Ligne stock matiere premiere invalide.");
  }

  await deleteMpDetailLineAndRedirectIfEmpty(lotId);
}

function parseOptionalNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

// Contrairement a la creation (stock_mp_record_sortie_batch verrouille et
// verifie le solde disponible avant d'inserer), ces deux actions de
// modification ecrivaient qte_entree/qte_sortie directement sans aucun
// controle - baisser une entree deja consommee ailleurs, ou augmenter une
// sortie au-dela du disponible, pouvait rendre le solde du lot negatif.
// Meilleur effort seulement (pas de verrou entre la lecture et l'ecriture,
// contrairement a la RPC de creation) - suffisant pour bloquer l'erreur de
// saisie ordinaire, pas concu pour resister a deux modifications strictement
// simultanees sur le meme lot.
async function assertLotBalanceStaysNonNegative(
  lotId: number,
  nextQteEntree: number,
  nextQteSortie: number
) {
  const { data: currentRow, error: currentRowError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("article_id, numero_lot, code_normalise, qte_entree, qte_sortie")
    .eq("id", lotId)
    .maybeSingle();

  if (currentRowError) {
    throw new Error(currentRowError.message);
  }

  if (!currentRow) {
    throw new Error("Ligne stock matiere premiere invalide.");
  }

  const row = currentRow as {
    article_id: number | null;
    numero_lot: string | null;
    code_normalise: string | null;
    qte_entree: number;
    qte_sortie: number;
  };

  const codeKey = (row.code_normalise || row.numero_lot || "").trim().toUpperCase();

  if (!row.article_id || !codeKey) {
    return;
  }

  const { data: groupRows, error: groupError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("qte_entree, qte_sortie, numero_lot, code_normalise")
    .eq("article_id", row.article_id);

  if (groupError) {
    throw new Error(groupError.message);
  }

  const currentBalance = ((groupRows ?? []) as { qte_entree: number; qte_sortie: number; numero_lot: string | null; code_normalise: string | null }[])
    .filter((line) => (line.code_normalise || line.numero_lot || "").trim().toUpperCase() === codeKey)
    .reduce((sum, line) => sum + Number(line.qte_entree ?? 0) - Number(line.qte_sortie ?? 0), 0);

  const oldRowNet = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
  const newRowNet = nextQteEntree - nextQteSortie;
  const nextBalance = currentBalance - oldRowNet + newRowNet;

  if (nextBalance < 0) {
    throw new Error(
      `Cette modification rendrait le stock du lot negatif (solde actuel disponible ailleurs sur ce lot : ${currentBalance - oldRowNet}).`
    );
  }
}

export async function updateLotFromEntreeMpDetailAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiereEntreeDetail"))) {
    throw new Error("Cet utilisateur ne peut pas modifier une ligne.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));
  const quantite = parseOptionalNumber(formData, "quantite");
  const numeroLot = parseOptionalText(formData, "numero_lot");

  if (!lotId || quantite === null || quantite <= 0) {
    throw new Error("Ligne stock matiere premiere invalide.");
  }

  await assertLotBalanceStaysNonNegative(lotId, quantite, 0);

  const { error } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .update({
      qte_entree: quantite,
      numero_lot: numeroLot,
      // code_normalise doit suivre numero_lot (meme convention qu'a la
      // creation, voir createEntreeMpBatchAction) - sans ca, corriger une
      // faute de frappe sur le numero de lot desynchronise cette ligne du
      // reste du meme lot physique pour le regroupement par code (Stock MP)
      // et le calcul de solde disponible en Sortie, qui restent sur
      // l'ancien code_normalise.
      code_normalise: numeroLot ? numeroLot.toUpperCase() : null,
      date_reception: parseOptionalText(formData, "date_reception"),
      date_fabrication: parseOptionalText(formData, "date_fabrication"),
      date_expiration: parseOptionalText(formData, "date_expiration"),
      fournisseur: parseOptionalText(formData, "fournisseur"),
      emplacement: parseOptionalText(formData, "emplacement"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      note: parseOptionalText(formData, "note"),
    })
    .eq("id", lotId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMouvementsMpPages();
}

export async function updateLotFromSortieMpDetailAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiereSortieDetail"))) {
    throw new Error("Cet utilisateur ne peut pas modifier une ligne.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));
  const quantite = parseOptionalNumber(formData, "quantite");

  if (!lotId || quantite === null || quantite <= 0) {
    throw new Error("Ligne stock matiere premiere invalide.");
  }

  const dateSortie = parseOptionalText(formData, "date_sortie");

  if (!dateSortie) {
    throw new Error("Date de sortie invalide.");
  }

  await assertLotBalanceStaysNonNegative(lotId, 0, quantite);

  const { error } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .update({
      qte_sortie: quantite,
      date_jour: dateSortie,
      client: parseOptionalText(formData, "client"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      note: parseOptionalText(formData, "note"),
    })
    .eq("id", lotId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMouvementsMpPages();
}
