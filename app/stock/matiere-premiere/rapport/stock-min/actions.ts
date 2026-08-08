"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Applique le nouveau Stock min propose par le Rapport Rotation - ne
// touche que ce champ, contrairement a updateArticleMpAction (page
// Articles MP) qui exige aussi nom_article/categorie/unite/gamme.
export async function applyProposedMinStockAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "articlesMatierePremiere"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les articles.");
  }

  const articleId = Number(String(formData.get("article_id") || "0"));
  const nouveauMin = Number(String(formData.get("nouveau_min") || ""));

  if (!articleId || !Number.isFinite(nouveauMin) || nouveauMin < 0) {
    throw new Error("Proposition de stock min invalide.");
  }

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ min_stock: nouveauMin })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/stock/matiere-premiere/rapport/stock-min");
  revalidatePath("/articles/matiere-premiere");
  revalidatePath("/stock/matiere-premiere/alerte");
}
