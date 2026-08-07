"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function revalidateSuiviPages() {
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
}

// Insere le code precis dans production_code_termine plutot que de mettre a
// jour un flag ligne entiere - une ligne decoupee en plusieurs codes (voir
// numero_lot_detail) doit pouvoir terminer UN SEUL de ses codes sans cacher
// les autres du Dashboard (bug corrige : Terminer un code y cachait avant
// tous les codes freres, puisque le flag etait au niveau de la ligne).
async function markCodeTermine(formData: FormData, stage: "vrac" | "carton" | "emballage") {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  if (!ligneId || !code) {
    throw new Error("Ligne ou code invalide.");
  }

  const { error } = await supabaseServer
    .from("production_code_termine")
    .upsert([{ programme_ligne_id: ligneId, code, stage }], {
      onConflict: "programme_ligne_id,code,stage",
    });

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

export async function markVracTermineAction(formData: FormData) {
  await markCodeTermine(formData, "vrac");
}

// Fin programme independante par colonne du Dashboard : fermer Fabrication
// ne ferme plus Conditionnement/Emballage (et inversement) - chaque etape a
// son propre flag "termine".
export async function markCartonTermineAction(formData: FormData) {
  await markCodeTermine(formData, "carton");
}

export async function markEmballageTermineAction(formData: FormData) {
  await markCodeTermine(formData, "emballage");
}

export async function addCartonEntryAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
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

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
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

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
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
