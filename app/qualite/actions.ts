"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function parseOptionalNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

export async function upsertArticleSpecQualiteAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteSpecs"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les specs qualite.");
  }

  const articleId = Number(formData.get("article_id"));

  if (!articleId) {
    throw new Error("Choisis un article.");
  }

  const { error } = await supabaseServer.from("articles_specs_qualite").upsert(
    {
      article_id: articleId,
      ph_min: parseOptionalNumber(formData, "ph_min"),
      ph_max: parseOptionalNumber(formData, "ph_max"),
      viscosite_min: parseOptionalNumber(formData, "viscosite_min"),
      viscosite_max: parseOptionalNumber(formData, "viscosite_max"),
      densite_min: parseOptionalNumber(formData, "densite_min"),
      densite_max: parseOptionalNumber(formData, "densite_max"),
      degre_alcool_min: parseOptionalNumber(formData, "degre_alcool_min"),
      degre_alcool_max: parseOptionalNumber(formData, "degre_alcool_max"),
      stabilite: parseOptionalText(formData, "stabilite"),
      couleur: parseOptionalText(formData, "couleur"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "article_id" }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/specs");
}

export async function deleteArticleSpecQualiteAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "qualiteSpecs"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette spec qualite.");
  }

  const articleId = Number(formData.get("article_id"));

  if (!articleId) {
    throw new Error("Article invalide.");
  }

  const { error } = await supabaseServer
    .from("articles_specs_qualite")
    .delete()
    .eq("article_id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/specs");
}
