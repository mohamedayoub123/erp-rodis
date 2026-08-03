"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

export async function deleteProgrammeLigneRapportAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionRapportEcarts"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette ligne.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("programme_lignes").delete().eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/rapport/ecarts");
  revalidatePath("/production/suivi-production");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
}
