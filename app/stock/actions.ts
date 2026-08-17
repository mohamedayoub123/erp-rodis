"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canDeletePageUser,
  canEditStockUser,
  clearStockSession,
  createStockSession,
  getCurrentStockUser,
  verifyStockPassword,
} from "@/lib/stock-auth";
import { deleteLotStockCore } from "@/lib/lot-stock-delete";
import { logAudit } from "@/lib/audit-log";

export async function loginStockEditAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();

  if (!(await verifyStockPassword(username, password))) {
    throw new Error("Utilisateur ou mot de passe incorrect.");
  }

  await createStockSession(username as "mayob" | "david");
  revalidatePath("/stock");
}

export async function logoutStockEditAction() {
  await clearStockSession();
  revalidatePath("/stock");
}

export async function updateLotStockAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!currentUser) {
    throw new Error("Connexion obligatoire pour modifier une ligne.");
  }

  if (!(await canEditStockUser(currentUser))) {
    throw new Error("Tu n'as pas le droit de modifier le stock.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));
  const numeroLot = String(formData.get("numero_lot") || "").trim();
  const dateFabrication = String(formData.get("date_fabrication") || "").trim();
  const qteEntree = Number(String(formData.get("qte_entree") || "0").replace(",", "."));
  const qteSortie = Number(String(formData.get("qte_sortie") || "0").replace(",", "."));
  const chambre = String(formData.get("chambre") || "").trim();
  const codePays = String(formData.get("code_pays") || "").trim();
  const note = String(formData.get("note") || "").trim();

  if (!lotId || !numeroLot || !dateFabrication) {
    throw new Error("Lot, date fabrication et identifiant sont obligatoires.");
  }

  if (Number.isNaN(qteEntree) || qteEntree < 0) {
    throw new Error("La quantite entree est invalide.");
  }

  if (Number.isNaN(qteSortie) || qteSortie < 0) {
    throw new Error("La quantite sortie est invalide.");
  }

  if (qteEntree <= 0 && qteSortie <= 0) {
    throw new Error("Il faut au moins une entree ou une sortie superieure a zero.");
  }

  const { error } = await supabaseServer.rpc("stock_edit_lot", {
    p_lot_id: lotId,
    p_numero_lot: numeroLot,
    p_date_fabrication: dateFabrication,
    p_qte_entree: qteEntree,
    p_qte_sortie: qteSortie,
    p_chambre: chambre || null,
    p_code_pays: codePays || null,
    p_note: note || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({
    utilisateur: currentUser,
    module: "Stock",
    action: "modification",
    cible: numeroLot,
    resume: `Lot ${numeroLot} modifie (entree ${qteEntree}, sortie ${qteSortie})`,
  });

  revalidatePath("/stock");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/dashboard");
  revalidatePath("/stock-dormant");
  revalidatePath("/stock-dormant-sans-commande");
  revalidatePath("/fifo");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function deleteLotStockAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!currentUser) {
    throw new Error("Connexion obligatoire pour supprimer une ligne.");
  }

  if (!(await canDeletePageUser(currentUser, "stock"))) {
    throw new Error("Tu n'as pas le droit de supprimer une ligne.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));

  await deleteLotStockCore(lotId);
}
