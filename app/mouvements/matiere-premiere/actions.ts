"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

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
};

type PendingSortieMpRow = {
  lot_id: number;
  quantite: number;
  client?: string;
  n_doss_erp?: string;
  n_doss_4d?: string;
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
      utilisateur: currentUser,
      source_import: "web:entree-mp",
    };
  });

  const { data, error } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .insert(payload)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  const insertedIds = ((data as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .update({ mouvement_groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupError) {
    throw new Error(groupError.message);
  }

  revalidateMouvementsMpPages();

  return { ok: true, groupe_id: groupeId };
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

  const { error } = await supabaseServer.rpc("stock_mp_delete_lot", { p_lot_id: lotId });

  if (error) {
    throw new Error(error.message);
  }

  revalidateMouvementsMpPages();
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

  const { error } = await supabaseServer.rpc("stock_mp_delete_lot", { p_lot_id: lotId });

  if (error) {
    throw new Error(error.message);
  }

  revalidateMouvementsMpPages();
}
