"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

// Cree une recette complete en un seul envoi : article PF choisi en haut du
// formulaire (champ cache "article_pf_id", ecrit par ProduitPickerField),
// suivi d'autant de lignes MP que l'utilisateur en a ajoutees - chaque ligne
// ecrit sous les memes noms "mp_article_id"/"quantite_ligne", getAll() les
// relit dans l'ordre du DOM (les deux tableaux se correspondent par index).
export async function createRecetteCompleteAction(formData: FormData) {
  const pageKey = String(formData.get("page_key") || "recetteFabrication") as
    | "recetteFabrication"
    | "recetteConditionnement";
  await requireRecetteWriteAccess(pageKey);

  const articlePfId = Number(formData.get("article_pf_id") || "0");
  if (!articlePfId) {
    throw new Error("Choisis un article dans la liste (clique une suggestion).");
  }

  const quantiteBaseRaw = String(formData.get("quantite_recette_base") || "").trim().replace(",", ".");
  const quantiteBase = quantiteBaseRaw ? Number(quantiteBaseRaw) : null;
  const vracArticleIdRaw = Number(formData.get("vrac_article_id") || "0");
  const vracArticleId = vracArticleIdRaw > 0 ? vracArticleIdRaw : null;

  const mpIds = formData.getAll("mp_article_id").map((value) => Number(value));
  const quantites = formData.getAll("quantite_ligne").map((value) => {
    const parsed = Number(String(value).trim().replace(",", "."));
    return Number.isNaN(parsed) ? 0 : parsed;
  });

  const lignes = mpIds
    .map((articleMpId, index) => ({
      article_pf_id: articlePfId,
      article_mp_id: articleMpId,
      quantite: quantites[index] ?? 0,
    }))
    .filter((ligne) => ligne.article_mp_id > 0);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins un article MP a la recette.");
  }

  const { error } = await supabaseServer
    .from("recettes_pf")
    .upsert(lignes, { onConflict: "article_pf_id,article_mp_id" });

  if (error) {
    throw new Error(error.message);
  }

  const articleFields: Record<string, unknown> = {};
  if (quantiteBase !== null && !Number.isNaN(quantiteBase)) {
    articleFields.quantite_recette_base = quantiteBase;
  }
  if (pageKey === "recetteConditionnement") {
    articleFields.vrac_article_id = vracArticleId;
  }

  if (Object.keys(articleFields).length > 0) {
    const { error: articleError } = await supabaseServer
      .from("articles")
      .update(articleFields)
      .eq("id", articlePfId);

    if (articleError) {
      throw new Error(articleError.message);
    }
  }

  revalidateRecettePages(articlePfId);
  redirect(
    pageKey === "recetteFabrication"
      ? `/production/recette-fabrication/${articlePfId}`
      : `/production/recette-conditionnement/${articlePfId}`
  );
}

export async function updateQuantiteBaseAction(formData: FormData) {
  const pageKey = String(formData.get("page_key") || "recetteFabrication") as
    | "recetteFabrication"
    | "recetteConditionnement";
  await requireRecetteWriteAccess(pageKey);

  const articlePfId = Number(formData.get("article_pf_id") || "0");
  if (!articlePfId) {
    throw new Error("Article invalide.");
  }

  const raw = String(formData.get("quantite_recette_base") || "").trim().replace(",", ".");
  const quantiteBase = raw ? Number(raw) : null;

  const articleFields: Record<string, unknown> = {
    quantite_recette_base: Number.isNaN(quantiteBase) ? null : quantiteBase,
  };
  if (pageKey === "recetteConditionnement") {
    const vracArticleIdRaw = Number(formData.get("vrac_article_id") || "0");
    articleFields.vrac_article_id = vracArticleIdRaw > 0 ? vracArticleIdRaw : null;
  }

  const { error } = await supabaseServer
    .from("articles")
    .update(articleFields)
    .eq("id", articlePfId);

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
