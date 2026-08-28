"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Utilisee depuis Rapport MP (stockPlastiqueMp) ET Production Plastique
// (productionPlastique) - le composant est partage entre les 2, le droit
// d'ecriture accorde depuis L'UN OU L'AUTRE module suffit.
async function requireStatistiqueArticlePlastiqueWriteAccess() {
  const currentUser = await getCurrentStockUser();
  const canFromRapportMp = await canWritePageUser(currentUser, "stockPlastiqueMp");
  const canFromProduction = await canWritePageUser(currentUser, "productionPlastique");

  if (!canFromRapportMp && !canFromProduction) {
    throw new Error("Cet utilisateur ne peut pas modifier l'avis de fabrication.");
  }
}

export async function updateAvisFabricationAction(formData: FormData) {
  await requireStatistiqueArticlePlastiqueWriteAccess();

  const articleId = Number(formData.get("article_id"));
  if (!Number.isFinite(articleId) || articleId <= 0) {
    throw new Error("Article invalide.");
  }

  const avis = String(formData.get("avis_fabrication") || "").trim() || null;

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ avis_fabrication: avis })
    .eq("id", articleId);

  if (error) throw new Error(error.message);

  revalidatePath("/stock/matiere-premiere/rapport/plastique");
  revalidatePath("/production-plastique/statistique");
}
