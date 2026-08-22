"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { supprimerToutesTracesProductionPourLigne } from "../../suivi-production/actions";

// Retourne { ok:false, message } au lieu de "throw" - Next reduit le message
// d'un throw depuis une Server Action au texte generique en production,
// meme attrape cote client.
export async function deleteProgrammeLigneRapportAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string }> {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "productionRapportEcarts"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas supprimer cette ligne." };
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    return { ok: false, message: "Ligne invalide." };
  }

  const { error: cleanupError } = await supprimerToutesTracesProductionPourLigne(ligneId, currentUser);
  if (cleanupError) {
    return { ok: false, message: cleanupError };
  }

  const { error } = await supabaseServer.from("programme_lignes").delete().eq("id", ligneId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/production/rapport/ecarts");
  revalidatePath("/production/suivi-production");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
  return { ok: true };
}
