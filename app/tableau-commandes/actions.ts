"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// "tableauCommandes" est une page en lecture seule (hasWrite: false dans
// page-registry.ts) - la note est une edition de la commande elle-meme,
// donc on reutilise le droit d'ecriture "commandesDetail" (meme permission
// que /commandes/[id]) plutot que d'en creer un nouveau juste pour cette
// case - meme choix deja fait pour reassignArticlesGammeAction.
export async function updateCommandeNoteAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandesDetail"))) {
    throw new Error("Cet utilisateur ne peut pas modifier cette note.");
  }

  const commandeId = Number(String(formData.get("commande_id") || "0"));
  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const note = String(formData.get("note") || "").trim() || null;

  const { error } = await supabaseServer
    .from("commandes")
    .update({ note_tableau_commande: note })
    .eq("id", commandeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/tableau-commandes");
}
