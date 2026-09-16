"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canQualiteLabOverwriteLotUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Contrairement a Code par article (Production), ce module ne touche jamais
// articles.code_auto/code_manu (utilises par Ravitailleur par ligne) - ses
// propres colonnes (lab_code_auto/lab_code_manu), et aucune propagation vers
// les articles "cousins" de la meme famille (demande explicite : totalement
// independant, ne doit reagir avec rien d'autre).
export async function updateArticleLabCodeAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteLab"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les codes Lab.");
  }

  const articleId = Number(String(formData.get("article_id") || "0"));
  const field = String(formData.get("field") || "");

  if (!articleId) {
    throw new Error("Article invalide.");
  }
  if (field !== "lab_code_auto" && field !== "lab_code_manu") {
    throw new Error("Champ invalide.");
  }

  const nextValue = String(formData.get("value") || "").trim() || null;

  const { data: currentRow, error: currentError } = await supabaseServer
    .from("articles")
    .select(field)
    .eq("id", articleId)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message);
  }

  const currentValue = (currentRow as Record<string, string | null> | null)?.[field] ?? null;

  // Vide -> tout le monde avec l'acces ecriture peut ecrire. Deja rempli ->
  // seuls les utilisateurs coches "Modifier un code deja rempli" (Admin) le
  // peuvent - demande explicite. Reecrire exactement la meme valeur n'est
  // jamais bloque (ce n'est pas un vrai changement).
  if (currentValue && currentValue !== nextValue && !(await canQualiteLabOverwriteLotUser(currentUser))) {
    throw new Error("Ce code est deja rempli - seul un utilisateur autorise peut le modifier.");
  }

  const { error } = await supabaseServer
    .from("articles")
    .update({ [field]: nextValue })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/lab");
}
