"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";

// Corrige la date de prise d'echantillon d'un Test labo deja enregistre -
// ce champ pilote l'attribution au mois dans Rapport Test Labo ET les
// indicateurs PR4 (voir fetchTestLaboMonthly), une erreur ici fausse les 2 a
// la fois. Demande explicite de l'utilisateur pour pouvoir corriger une
// date saisie de travers sans repasser par la fiche Test labo complete.
// Reserve aux comptes admin, meme regle que l'historique Fin programme
// (Fabrication/Conditionnement) voisin - jamais utilise avant, donc aucun
// compte n'avait de permission "ecriture" specifique configuree pour cette
// page (le systeme de permissions granulaire par page suppose un droit deja
// accorde explicitement, pas un acces admin implicite).
export async function updateDatePriseEchantillonAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!isAdminUser(currentUser)) {
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
