"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Corrige la date de prise d'echantillon d'un Test labo deja enregistre -
// ce champ pilote l'attribution au mois dans Rapport Test Labo ET les
// indicateurs PR4 (voir fetchTestLaboMonthly), une erreur ici fausse les 2 a
// la fois. Demande explicite de l'utilisateur pour pouvoir corriger une
// date saisie de travers sans repasser par la fiche Test labo complete.
export async function updateDatePriseEchantillonAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteHistoriqueTestLabo"))) {
    throw new Error("Cet utilisateur ne peut pas modifier l'historique Test labo.");
  }

  const rapportId = Number(String(formData.get("rapport_id") || "0"));
  const newDate = String(formData.get("new_date") || "").trim();

  if (!rapportId) {
    throw new Error("Ligne invalide.");
  }

  if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    throw new Error("Date invalide.");
  }

  const { error } = await supabaseServer
    .from("production_rapports")
    .update({ date_prise_echantillon: newDate })
    .eq("id", rapportId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/historique-test-labo");
  revalidatePath("/qualite/rapport");
  revalidatePath("/qualite/revue-processus/pr4/indicateurs");
}
