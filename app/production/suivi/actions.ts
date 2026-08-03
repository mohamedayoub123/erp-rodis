"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function revalidateSuiviPages() {
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
}

export async function markVracTermineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "productionSuiviDashboard")) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("programme_lignes")
    .update({ vrac_termine: true, vrac_termine_date: new Date().toISOString().slice(0, 10) })
    .eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

export async function unmarkVracTermineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "productionSuiviDashboard")) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("programme_lignes")
    .update({ vrac_termine: false, vrac_termine_date: null })
    .eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

// Fin programme independante par colonne du Dashboard : fermer Fabrication
// ne ferme plus Conditionnement/Emballage (et inversement) - chaque etape a
// son propre flag "termine".
export async function markCartonTermineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "productionSuiviDashboard")) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("programme_lignes")
    .update({ carton_termine: true, carton_termine_date: new Date().toISOString().slice(0, 10) })
    .eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

export async function markEmballageTermineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "productionSuiviDashboard")) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("programme_lignes")
    .update({ emballage_termine: true, emballage_termine_date: new Date().toISOString().slice(0, 10) })
    .eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

export async function addCartonEntryAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "productionSuiviDashboard")) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const quantite = Number(String(formData.get("quantite") || "0").replace(",", "."));
  const dateJour = String(formData.get("date_jour") || "").trim() || new Date().toISOString().slice(0, 10);

  if (!ligneId || !quantite || quantite <= 0) {
    throw new Error("Quantite invalide.");
  }

  const { error } = await supabaseServer.from("production_carton_entries").insert([
    {
      programme_ligne_id: ligneId,
      quantite,
      date_jour: dateJour,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

export async function addEmballageEntryAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "productionSuiviDashboard")) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const quantite = Number(String(formData.get("quantite") || "0").replace(",", "."));

  if (!ligneId || !quantite || quantite <= 0) {
    throw new Error("Quantite invalide.");
  }

  const { error } = await supabaseServer.from("production_emballage_entries").insert([
    { programme_ligne_id: ligneId, quantite },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

export async function deleteCartonEntryAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "productionSuiviDashboard")) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const entryId = Number(String(formData.get("entry_id") || "0"));

  if (!entryId) {
    throw new Error("Entree invalide.");
  }

  const { error } = await supabaseServer.from("production_carton_entries").delete().eq("id", entryId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}
