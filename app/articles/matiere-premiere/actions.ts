"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function normalizeArticle(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

function parseOptionalNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "articlesMatierePremiereNouvelle"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter des articles.");
  }
}

async function requireEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "articlesMatierePremiere"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les articles.");
  }
}

async function requireDeleteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "articlesMatierePremiere"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer les articles.");
  }
}

function revalidateArticlesMpPages() {
  revalidatePath("/articles/matiere-premiere");
  revalidatePath("/stock/matiere-premiere");
  revalidatePath("/");
}

export async function createArticleMpAction(formData: FormData) {
  await requireWriteAccess();

  const nomArticle = String(formData.get("nom_article") || "").trim();
  const categorie = String(formData.get("categorie") || "").trim();
  const unite = String(formData.get("unite") || "").trim();
  const gamme = String(formData.get("gamme") || "").trim();
  const gammeStatistique = String(formData.get("gamme_statistique") || "").trim();
  const utilisation = String(formData.get("utilisation") || "").trim();
  const minStock = parseOptionalNumber(formData, "min_stock");
  const maxStock = parseOptionalNumber(formData, "max_stock");
  const depotIdRaw = String(formData.get("depot_id") || "").trim();
  const depotId = depotIdRaw ? Number(depotIdRaw) : null;

  if (!nomArticle) {
    throw new Error("Le nom de l'article est obligatoire.");
  }

  const articleNormalise = normalizeArticle(nomArticle);

  const { data: existingArticle } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id")
    .eq("article_normalise", articleNormalise)
    .maybeSingle();

  if (existingArticle) {
    throw new Error(`L'article ${nomArticle} existe deja.`);
  }

  const { error } = await supabaseServer.from("articles_matiere_premiere").insert([
    {
      nom_article: nomArticle,
      article_normalise: articleNormalise,
      categorie: categorie || null,
      unite: unite || null,
      gamme: gamme || null,
      gamme_statistique: gammeStatistique || null,
      utilisation: utilisation || null,
      min_stock: minStock,
      max_stock: maxStock,
      depot_id: depotId,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateArticlesMpPages();
}

// Refuse (contrainte de cle etrangere) si l'article a deja des lots/
// mouvements de stock, des lignes de BC, etc. lies - evite de supprimer
// silencieusement un article encore utilise dans l'historique.
export async function deleteArticleMpAction(formData: FormData) {
  await requireDeleteAccess();

  const articleId = Number(String(formData.get("article_id") || "0"));

  if (!articleId) {
    throw new Error("Article invalide.");
  }

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .delete()
    .eq("id", articleId);

  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "Impossible de supprimer : cet article a deja des mouvements de stock ou des commandes enregistres."
      );
    }
    throw new Error(error.message);
  }

  revalidateArticlesMpPages();
}

export async function updateArticleMpAction(formData: FormData) {
  await requireEditAccess();

  const articleId = Number(String(formData.get("article_id") || "0"));
  const nomArticle = String(formData.get("nom_article") || "").trim();
  const categorie = String(formData.get("categorie") || "").trim();
  const unite = String(formData.get("unite") || "").trim();
  const gamme = String(formData.get("gamme") || "").trim();
  const gammeStatistique = String(formData.get("gamme_statistique") || "").trim();
  const utilisation = String(formData.get("utilisation") || "").trim();
  const minStock = parseOptionalNumber(formData, "min_stock");
  const maxStock = parseOptionalNumber(formData, "max_stock");
  const depotIdRaw = String(formData.get("depot_id") || "").trim();
  const depotId = depotIdRaw ? Number(depotIdRaw) : null;

  if (!articleId || !nomArticle) {
    throw new Error("Article invalide.");
  }

  const articleNormalise = normalizeArticle(nomArticle);

  const { data: duplicateArticle } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id")
    .eq("article_normalise", articleNormalise)
    .neq("id", articleId)
    .maybeSingle();

  if (duplicateArticle) {
    throw new Error(`Un autre article existe deja avec ce nom: ${nomArticle}`);
  }

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({
      nom_article: nomArticle,
      article_normalise: articleNormalise,
      categorie: categorie || null,
      unite: unite || null,
      gamme: gamme || null,
      gamme_statistique: gammeStatistique || null,
      utilisation: utilisation || null,
      min_stock: minStock,
      max_stock: maxStock,
      depot_id: depotId,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateArticlesMpPages();
}
