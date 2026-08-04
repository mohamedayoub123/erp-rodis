"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { computeArticleFamilyKey } from "@/lib/article-code-family";

async function fetchAllArticlesForFamilyLookup() {
  const rows: { id: number; nom_article: string; gamme: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les articles "cousins" au-dela du
  // 1000e n'etaient pas mis a jour avec le reste de leur famille.
  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data as { id: number; nom_article: string; gamme: string | null }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export async function updateArticleCodesAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "codeParArticle"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les codes articles.");
  }

  const articleId = Number(String(formData.get("article_id") || "0"));

  if (!articleId) {
    throw new Error("Article invalide.");
  }

  // Chaque code a son propre formulaire/bouton - on ne touche que le champ
  // reellement soumis, pour ne jamais effacer l'autre code par erreur.
  const updates: { code_auto?: string | null; code_manu?: string | null } = {};

  if (formData.has("code_auto")) {
    updates.code_auto = String(formData.get("code_auto") || "").trim() || null;
  }

  if (formData.has("code_manu")) {
    updates.code_manu = String(formData.get("code_manu") || "").trim() || null;
  }

  const { error } = await supabaseServer.from("articles").update(updates).eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  // Une correction manuelle doit s'appliquer a toute la famille (meme
  // gamme+forme - Lait/Creme/DSR/...) tout de suite, pas seulement a cet
  // article : sinon un article "cousin" avec un vieux code laisse trainer
  // un numero different, et la prochaine generation automatique peut
  // reprendre ce vieux code au lieu de celui qu'on vient de corriger ici.
  const { data: currentArticle } = await supabaseServer
    .from("articles")
    .select("nom_article, gamme")
    .eq("id", articleId)
    .maybeSingle();

  if (currentArticle) {
    const familyKey = computeArticleFamilyKey(currentArticle.nom_article, currentArticle.gamme);

    const allArticles = await fetchAllArticlesForFamilyLookup();

    const familyArticleIds = allArticles
      .filter((row) => row.id !== articleId && computeArticleFamilyKey(row.nom_article, row.gamme) === familyKey)
      .map((row) => row.id);

    if (familyArticleIds.length > 0) {
      const { error: familyError } = await supabaseServer
        .from("articles")
        .update(updates)
        .in("id", familyArticleIds);

      if (familyError) {
        throw new Error(familyError.message);
      }
    }
  }

  revalidatePath("/code-par-article");
  revalidatePath("/articles/produit-fini");
}
