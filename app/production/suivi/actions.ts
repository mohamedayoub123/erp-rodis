"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";

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

// Correction manuelle du numero de lot d'un code deja dispatche (ex: typo
// venu du Dispatcher) - reservee aux comptes admin (isAdminUser), pas au
// simple droit d'ecriture du Dashboard deja accorde a plusieurs employes
// pour la saisie de production. Renomme en cascade tout ce qui est deja
// rattache a l'ancien code SUR CETTE MEME LIGNE (programme_ligne_id) :
// sinon les saisies deja enregistrees (vrac/carton/emballage, Fin
// programme, rapports/tests labo) resteraient invisibles sous le nouveau
// code affiche.
export async function renameLotCodeAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!isAdminUser(currentUser)) {
    throw new Error("Seul un compte administrateur peut modifier le numero de lot.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const oldCode = String(formData.get("old_code") || "").trim();
  const newCode = String(formData.get("new_code") || "").trim();

  if (!ligneId || !oldCode || !newCode || oldCode === newCode) return;

  const { data: ligneData, error: ligneError } = await supabaseServer
    .from("programme_lignes")
    .select("id, numero_lot, numero_lot_detail")
    .eq("id", ligneId)
    .maybeSingle();

  if (ligneError || !ligneData) {
    throw new Error(ligneError?.message || "Ligne introuvable.");
  }

  const ligne = ligneData as {
    id: number;
    numero_lot: string | null;
    numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
  };

  const codes = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!codes.includes(oldCode)) {
    throw new Error("Ce code n'existe plus sur cette ligne (page pas a jour, recharge-la).");
  }
  if (codes.includes(newCode)) {
    throw new Error("Ce numero de lot est deja utilise sur cette meme ligne.");
  }

  const newNumeroLot = codes.map((c) => (c === oldCode ? newCode : c)).join(", ");
  const newDetail = Array.isArray(ligne.numero_lot_detail)
    ? ligne.numero_lot_detail.map((entry) => (entry.code === oldCode ? { ...entry, code: newCode } : entry))
    : ligne.numero_lot_detail;

  const { error: updateLigneError } = await supabaseServer
    .from("programme_lignes")
    .update({ numero_lot: newNumeroLot, numero_lot_detail: newDetail })
    .eq("id", ligneId);
  if (updateLigneError) {
    throw new Error(updateLigneError.message);
  }

  await Promise.all([
    supabaseServer
      .from("production_carton_entries")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
    supabaseServer
      .from("production_vrac_entries")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
    supabaseServer
      .from("production_emballage_entries")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
    supabaseServer
      .from("production_code_termine")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
    supabaseServer
      .from("production_rapports")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
  ]);

  revalidateSuiviPages();
}
