"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteLotStockCore } from "@/lib/lot-stock-delete";

type PendingEntreeRow = {
  article_id: number;
  numero_lot: string;
  date_fabrication: string;
  quantite: number;
  chambre?: string;
  code_pays?: string;
  note?: string;
};

type PendingSortieRow = {
  lot_id: number;
  quantite: number;
  code?: string;
  livre_pour?: string;
  numero_bl?: string;
  preparateur?: string;
};

async function requireMouvementsEntreeWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "mouvementsEntree")) {
    throw new Error("Cet utilisateur ne peut pas saisir des mouvements.");
  }
}

async function requireMouvementsSortieWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "mouvementsSortie")) {
    throw new Error("Cet utilisateur ne peut pas saisir des mouvements.");
  }
}

function revalidateMovementPages() {
  revalidatePath("/stock");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/dashboard");
}

export async function createEntreeStockAction(formData: FormData) {
  const formPayload = new FormData();
  formPayload.set(
    "payload",
    JSON.stringify([
      {
        article_id: Number(String(formData.get("article_id") || "0")),
        numero_lot: String(formData.get("numero_lot") || "").trim(),
        date_fabrication: String(formData.get("date_fabrication") || "").trim(),
        quantite: Number(String(formData.get("quantite") || "0").replace(",", ".")),
        chambre: String(formData.get("chambre") || "").trim(),
        code_pays: String(formData.get("code_pays") || "").trim(),
        note: String(formData.get("note") || "").trim(),
      },
    ])
  );

  await createEntreeStockBatchAction(formPayload);
}

export async function createSortieStockAction(formData: FormData) {
  const formPayload = new FormData();
  formPayload.set(
    "payload",
    JSON.stringify([
      {
        lot_id: Number(String(formData.get("lot_id") || "0")),
        quantite: Number(String(formData.get("quantite") || "0").replace(",", ".")),
        code: String(formData.get("code") || "").trim(),
        livre_pour: String(formData.get("livre_pour") || "").trim(),
        numero_bl: String(formData.get("numero_bl") || "").trim(),
        preparateur: String(formData.get("preparateur") || "").trim(),
      },
    ])
  );

  await createSortieStockBatchAction(formPayload);
}

export async function createEntreeStockBatchAction(formData: FormData) {
  await requireMouvementsEntreeWriteAccess();

  const rawPayload = String(formData.get("payload") || "").trim();

  if (!rawPayload) {
    throw new Error("Aucune entree a approuver.");
  }

  let rows: PendingEntreeRow[] = [];

  try {
    rows = JSON.parse(rawPayload) as PendingEntreeRow[];
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
    const dateFabrication = String(row.date_fabrication || "").trim();
    const chambre = String(row.chambre || "").trim();
    const codePays = String(row.code_pays || "").trim();
    const note = String(row.note || "").trim();

    if (!articleId || !numeroLot || !dateFabrication || !quantite || quantite <= 0) {
      throw new Error("Une entree est incomplete ou invalide.");
    }

    return {
      article_id: articleId,
      date_jour: new Date().toISOString().slice(0, 10),
      numero_lot: numeroLot,
      code_normalise: numeroLot.toUpperCase(),
      date_fabrication: dateFabrication,
      qte_entree: quantite,
      qte_sortie: 0,
      chambre: chambre || null,
      code_pays: codePays || null,
      source_import: "web:entree",
      note: note || null,
    };
  });

  const { data, error } = await supabaseServer.from("lots_stock").insert(payload).select("id");

  if (error) {
    throw new Error(error.message);
  }

  const insertedIds = ((data as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupError } = await supabaseServer
    .from("lots_stock")
    .update({ mouvement_groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupError) {
    throw new Error(groupError.message);
  }

  revalidateMovementPages();

  return { ok: true, groupe_id: groupeId };
}

export async function createSortieStockBatchAction(formData: FormData) {
  await requireMouvementsSortieWriteAccess();

  const rawPayload = String(formData.get("payload") || "").trim();

  if (!rawPayload) {
    throw new Error("Aucune sortie a approuver.");
  }

  let rows: PendingSortieRow[] = [];

  try {
    rows = JSON.parse(rawPayload) as PendingSortieRow[];
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
      code: String(row.code || "").trim(),
      livre_pour: String(row.livre_pour || "").trim(),
      numero_bl: String(row.numero_bl || "").trim(),
      preparateur: String(row.preparateur || "").trim(),
    };
  });

  const { error } = await supabaseServer.rpc("stock_record_sortie_batch", {
    p_lignes: lignes,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateMovementPages();

  return { ok: true };
}

// Supprime totalement un mouvement TE/TS (toutes ses lignes lots_stock, pas
// juste une seule ligne). Refuse si une des lignes est deja utilisee dans
// une commande FIFO (meme garde-fou que la suppression ligne par ligne).
export async function deleteMouvementGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "mouvementsProduitFini")) {
    throw new Error("Cet utilisateur ne peut pas supprimer un mouvement.");
  }

  const groupeId = Number(String(formData.get("groupe_id") || "0"));

  if (!groupeId) {
    throw new Error("Mouvement invalide.");
  }

  const { error } = await supabaseServer.rpc("stock_delete_lot_group", { p_groupe_id: groupeId });

  if (error) {
    throw new Error(error.message);
  }

  revalidateMovementPages();
  revalidatePath("/stock-dormant");
  revalidatePath("/stock-dormant-sans-commande");
  revalidatePath("/fifo");
  revalidatePath("/admin");
}

export async function deleteLotFromEntreeDetailAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "mouvementsEntreeDetail")) {
    throw new Error("Cet utilisateur ne peut pas supprimer une ligne.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));

  await deleteLotStockCore(lotId);
}

export async function deleteLotFromSortieDetailAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "mouvementsSortieDetail")) {
    throw new Error("Cet utilisateur ne peut pas supprimer une ligne.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));

  await deleteLotStockCore(lotId);
}
