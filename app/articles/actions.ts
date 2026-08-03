"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canWritePageUser,
  getCurrentStockUser,
} from "@/lib/stock-auth";

function normalizeArticle(value: string) {
  return value.replace(/\u00a0/g, "").trim().toUpperCase();
}

async function requireArticlesWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "articlesProduitFiniNouvelle"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter des articles.");
  }
}

async function requireArticlesEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "articlesProduitFini"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les articles.");
  }
}

export async function createArticleAction(formData: FormData) {
  await requireArticlesWriteAccess();

  const nomArticle = String(formData.get("nom_article") || "").trim();
  const typeArticle = String(formData.get("type_article") || "").trim();
  const marque = String(formData.get("marque") || "").trim();
  const gamme = String(formData.get("gamme") || "").trim();
  const minStock = Number(String(formData.get("min_stock") || "0").replace(",", "."));
  const maxStock = Number(String(formData.get("max_stock") || "0").replace(",", "."));

  if (!nomArticle) {
    throw new Error("Le nom de l'article est obligatoire.");
  }

  const articleNormalise = normalizeArticle(nomArticle);

  const { data: existingArticle } = await supabaseServer
    .from("articles")
    .select("id")
    .eq("article_normalise", articleNormalise)
    .maybeSingle();

  if (existingArticle) {
    throw new Error(`L'article ${nomArticle} existe deja.`);
  }

  const { error } = await supabaseServer.from("articles").insert([
    {
      nom_article: nomArticle,
      article_normalise: articleNormalise,
      type_article: typeArticle || null,
      marque: marque || null,
      gamme: gamme || null,
      min_stock: Number.isNaN(minStock) ? 0 : minStock,
      max_stock: Number.isNaN(maxStock) ? 0 : maxStock,
      actif: true,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/articles");
  revalidatePath("/stock");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/tableau-commandes");
}

export async function updateArticleAction(formData: FormData) {
  await requireArticlesEditAccess();

  const articleId = Number(String(formData.get("article_id") || "0"));
  const nomArticle = String(formData.get("nom_article") || "").trim();
  const typeArticle = String(formData.get("type_article") || "").trim();
  const marque = String(formData.get("marque") || "").trim();
  const gamme = String(formData.get("gamme") || "").trim();
  const minStock = Number(String(formData.get("min_stock") || "0").replace(",", "."));
  const maxStock = Number(String(formData.get("max_stock") || "0").replace(",", "."));

  if (!articleId || !nomArticle) {
    throw new Error("Article invalide.");
  }

  const articleNormalise = normalizeArticle(nomArticle);

  const { data: duplicateArticle } = await supabaseServer
    .from("articles")
    .select("id")
    .eq("article_normalise", articleNormalise)
    .neq("id", articleId)
    .maybeSingle();

  if (duplicateArticle) {
    throw new Error(`Un autre article existe deja avec ce nom: ${nomArticle}`);
  }

  const { error } = await supabaseServer
    .from("articles")
    .update({
      nom_article: nomArticle,
      article_normalise: articleNormalise,
      type_article: typeArticle || null,
      marque: marque || null,
      gamme: gamme || null,
      min_stock: Number.isNaN(minStock) ? 0 : minStock,
      max_stock: Number.isNaN(maxStock) ? 0 : maxStock,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/articles");
  revalidatePath("/stock");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/tableau-commandes");
}
