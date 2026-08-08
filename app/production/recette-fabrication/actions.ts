"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Une seule table recettes_pf pour Fabrication (article PF nature=vrac) et
// Conditionnement (nature=fini) - la nature de l'article PF determine sur
// quelle page la recette apparait, les actions elles-memes sont identiques.
async function requireRecetteWriteAccess(pageKey: "recetteFabrication" | "recetteConditionnement") {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, pageKey))) {
    throw new Error("Cet utilisateur ne peut pas modifier les recettes.");
  }
}

function parseQuantite(formData: FormData) {
  const raw = String(formData.get("quantite") || "").trim().replace(",", ".");
  const value = Number(raw);
  return Number.isNaN(value) ? 0 : value;
}

function revalidateRecettePages(articlePfId: number) {
  revalidatePath("/production/recette-fabrication");
  revalidatePath(`/production/recette-fabrication/${articlePfId}`);
  revalidatePath("/production/recette-conditionnement");
  revalidatePath(`/production/recette-conditionnement/${articlePfId}`);
}

export async function addRecetteLigneAction(formData: FormData) {
  const pageKey = String(formData.get("page_key") || "recetteFabrication") as
    | "recetteFabrication"
    | "recetteConditionnement";
  await requireRecetteWriteAccess(pageKey);

  const articlePfId = Number(formData.get("article_pf_id") || "0");
  // ProduitPickerField (composant partage) ecrit toujours son champ cache
  // sous le nom "article_id", pas "article_mp_id".
  const articleMpId = Number(formData.get("article_id") || "0");
  const quantite = parseQuantite(formData);

  if (!articlePfId || !articleMpId) {
    throw new Error("Article MP invalide.");
  }

  const { error } = await supabaseServer
    .from("recettes_pf")
    .upsert(
      { article_pf_id: articlePfId, article_mp_id: articleMpId, quantite },
      { onConflict: "article_pf_id,article_mp_id" }
    );

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePages(articlePfId);
}

export async function updateRecetteLigneAction(formData: FormData) {
  const pageKey = String(formData.get("page_key") || "recetteFabrication") as
    | "recetteFabrication"
    | "recetteConditionnement";
  await requireRecetteWriteAccess(pageKey);

  const ligneId = Number(formData.get("ligne_id") || "0");
  const articlePfId = Number(formData.get("article_pf_id") || "0");
  const quantite = parseQuantite(formData);

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("recettes_pf")
    .update({ quantite })
    .eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePages(articlePfId);
}

export async function deleteRecetteLigneAction(formData: FormData) {
  const pageKey = String(formData.get("page_key") || "recetteFabrication") as
    | "recetteFabrication"
    | "recetteConditionnement";
  await requireRecetteWriteAccess(pageKey);

  const ligneId = Number(formData.get("ligne_id") || "0");
  const articlePfId = Number(formData.get("article_pf_id") || "0");

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("recettes_pf").delete().eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePages(articlePfId);
}
