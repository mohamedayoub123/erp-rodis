import { supabaseServer } from "@/lib/supabase-server";

// Le vrac fabrique (Fabrication) doit toujours crediter/consommer l'article
// VRAC, jamais l'article fini/emballage. La plupart des lignes de programme
// fabriquent un produit FINI, dont l'article a son propre vrac renseigne via
// articles.vrac_article_id - mais certaines lignes fabriquent directement un
// article DEJA de nature "vrac" (aucun conditionnement prevu, ex: vente de
// vrac en l'etat) : dans ce cas articleId EST deja le bon id, et chercher
// vrac_article_id dessus renvoie toujours null (un vrac n'a pas de "vrac du
// vrac"), ce qui faisait passer a cote du stock reel ET de la spec labo deja
// enregistree pour ces lignes.
export async function resolveVracArticleId(articleId: number | null): Promise<number | null> {
  if (!articleId) return null;

  const { data } = await supabaseServer
    .from("articles")
    .select("nature, vrac_article_id")
    .eq("id", articleId)
    .maybeSingle();

  const article = data as { nature: string | null; vrac_article_id: number | null } | null;
  if (!article) return null;
  if (article.nature === "vrac") return articleId;
  return article.vrac_article_id ?? null;
}

export async function resolveVracArticleIdForLigne(ligneId: number): Promise<number | null> {
  const { data } = await supabaseServer
    .from("programme_lignes")
    .select("article_id")
    .eq("id", ligneId)
    .maybeSingle();
  const articleId = (data as { article_id: number | null } | null)?.article_id ?? null;
  return resolveVracArticleId(articleId);
}
