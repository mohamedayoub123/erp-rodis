"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function normalizeArticle(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
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
    },
  ]);

  if (error) {
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
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateArticlesMpPages();
}
