"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

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
  lot_id: number;
  quantite: number;
  client?: string;
  n_doss_erp?: string;
  n_doss_4d?: string;
  note?: string;
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
      date_jour: new Date().toISOString().slice(0, 10),
      date_reception: dateReception,
      numero_lot: numeroLot,
      code_normalise: numeroLot.toUpperCase(),
      date_fabrication: String(row.date_fabrication || "").trim() || null,
      date_expiration: String(row.date_expiration || "").trim() || null,
      qte_entree: quantite,
      qte_sortie: 0,
      unite: String(row.unite || "").trim() || null,
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
  const currentUser = await requireMouvementsMpSortieWriteAccess();

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

  const lignes = rows.map((row) => {
    const lotId = Number(row.lot_id);
    const quantite = Number(row.quantite);

    if (!lotId || !quantite || quantite <= 0) {
      throw new Error("Une sortie est incomplete ou invalide.");
    }

    return {
      lot_stock_id: lotId,
      quantite,
      client: String(row.client || "").trim(),
      n_doss_erp: String(row.n_doss_erp || "").trim(),
      n_doss_4d: String(row.n_doss_4d || "").trim(),
      note: String(row.note || "").trim(),
      utilisateur: currentUser || "",
    };
  });

  const { error } = await supabaseServer.rpc("stock_mp_record_sortie_batch", {
    p_lignes: lignes,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateMouvementsMpPages();

  return { ok: true };
}

// Supprime tout un mouvement TE/TS matiere premiere (toutes ses lignes).
export async function deleteMouvementMpGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiere"))) {
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

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiereEntreeDetail"))) {
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

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiereSortieDetail"))) {
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

export async function updateLotFromEntreeMpDetailAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsMatierePremiereEntreeDetail"))) {
    throw new Error("Cet utilisateur ne peut pas modifier une ligne.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));
  const quantite = parseOptionalNumber(formData, "quantite");

  if (!lotId || quantite === null || quantite <= 0) {
    throw new Error("Ligne stock matiere premiere invalide.");
  }

  const { error } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .update({
      qte_entree: quantite,
      numero_lot: parseOptionalText(formData, "numero_lot"),
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

  const { error } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .update({
      qte_sortie: quantite,
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
