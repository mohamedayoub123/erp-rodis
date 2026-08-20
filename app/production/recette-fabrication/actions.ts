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

// Empeche le total des lignes MP d'une recette de depasser la quantite
// totale du lot declaree (articles.quantite_recette_base, = 100% du lot) -
// pas de verification si cette base n'est pas renseignee (rien a comparer).
// Uniquement pour Fabrication : quantite_recette_base y est le poids (kg) du
// lot de vrac, et chaque ligne MP est une part de ce meme poids (somme <=
// 100% a du sens). En Conditionnement, quantite_recette_base est un nombre
// de CARTONS et chaque ligne est un nombre de PIECES d'emballage par carton
// (SLEEVE, CARTON, ETIQUETTE...) - des grandeurs sans rapport, la somme des
// lignes n'a aucune raison de rester sous quantite_recette_base.
async function ensureTotalWithinBase(
  pageKey: "recetteFabrication" | "recetteConditionnement",
  articlePfId: number,
  quantiteAjoutee: number,
  options: { excludeLigneId?: number; excludeMpArticleId?: number } = {}
) {
  if (pageKey !== "recetteFabrication") return;

  const { data: articleRow } = await supabaseServer
    .from("articles")
    .select("quantite_recette_base")
    .eq("id", articlePfId)
    .maybeSingle();

  const quantiteBase = (articleRow as { quantite_recette_base: number | null } | null)?.quantite_recette_base;
  if (!quantiteBase || quantiteBase <= 0) return;

  const { data: lignesRows } = await supabaseServer
    .from("recettes_pf")
    .select("id, article_mp_id, quantite")
    .eq("article_pf_id", articlePfId);

  const autresLignes = ((lignesRows ?? []) as { id: number; article_mp_id: number; quantite: number }[]).filter(
    (ligne) =>
      ligne.id !== options.excludeLigneId && ligne.article_mp_id !== options.excludeMpArticleId
  );
  const sommeAutres = autresLignes.reduce((total, ligne) => total + Number(ligne.quantite ?? 0), 0);
  const nouveauTotal = sommeAutres + quantiteAjoutee;

  if (nouveauTotal > quantiteBase + 0.0001) {
    const pct = ((nouveauTotal / quantiteBase) * 100).toFixed(1);
    throw new Error(
      `Le total de la recette depasserait 100% du lot (${nouveauTotal.toFixed(3)} / ${quantiteBase} = ${pct}%).`
    );
  }
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

  await ensureTotalWithinBase(pageKey, articlePfId, quantite, { excludeMpArticleId: articleMpId });

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

// Formulaire "Ajouter un article a la formule" (page detail Conditionnement)
// qui propose dans UNE MEME liste les articles MP et le vrac (nature=vrac) -
// ProduitCombinePickerField encode le vrac en id negatif cote client (meme
// convention que RecetteConditionnementFormulaire pour la page "nouvelle").
// Id positif -> ligne recettes_pf classique. Id negatif -> met a jour
// articles.vrac_article_id (un seul vrac par recette, pas de ligne dediee).
export async function addRecetteOuVracAction(formData: FormData) {
  const pageKey = String(formData.get("page_key") || "recetteFabrication") as
    | "recetteFabrication"
    | "recetteConditionnement";
  await requireRecetteWriteAccess(pageKey);

  const articlePfId = Number(formData.get("article_pf_id") || "0");
  const combinedId = Number(formData.get("article_id") || "0");

  if (!articlePfId || !combinedId) {
    throw new Error("Choisis un article dans la liste (clique une suggestion).");
  }

  if (combinedId < 0) {
    if (pageKey !== "recetteConditionnement") {
      throw new Error("Le vrac n'existe que pour la recette Conditionnement.");
    }

    const quantiteVrac = parseQuantite(formData);
    const { error } = await supabaseServer
      .from("articles")
      .update({ vrac_article_id: -combinedId, vrac_quantite_recette: quantiteVrac || null })
      .eq("id", articlePfId);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const quantite = parseQuantite(formData);
    await ensureTotalWithinBase(pageKey, articlePfId, quantite, { excludeMpArticleId: combinedId });
    const { error } = await supabaseServer
      .from("recettes_pf")
      .upsert(
        { article_pf_id: articlePfId, article_mp_id: combinedId, quantite },
        { onConflict: "article_pf_id,article_mp_id" }
      );

    if (error) {
      throw new Error(error.message);
    }
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
  const vracQuantiteRaw = String(formData.get("vrac_quantite") || "").trim().replace(",", ".");
  const vracQuantite = vracQuantiteRaw ? Number(vracQuantiteRaw) : null;

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
    articleFields.vrac_quantite_recette = vracArticleId && !Number.isNaN(vracQuantite) ? vracQuantite : null;
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
    const vracArticleId = vracArticleIdRaw > 0 ? vracArticleIdRaw : null;
    articleFields.vrac_article_id = vracArticleId;
    // Le vrac est retire (bouton "Retirer", vrac_article_id absent du
    // formulaire) - la quantite qui lui etait propre n'a plus de sens.
    if (!vracArticleId) {
      articleFields.vrac_quantite_recette = null;
    }
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

// Quantite de vrac necessaire a la recette - editable independamment du
// reste (contrairement aux lignes MP classiques, le vrac n'a pas de ligne
// dediee dans recettes_pf, juste articles.vrac_quantite_recette).
export async function updateVracQuantiteAction(formData: FormData) {
  await requireRecetteWriteAccess("recetteConditionnement");

  const articlePfId = Number(formData.get("article_pf_id") || "0");
  if (!articlePfId) {
    throw new Error("Article invalide.");
  }

  const quantite = parseQuantite(formData);

  const { error } = await supabaseServer
    .from("articles")
    .update({ vrac_quantite_recette: quantite || null })
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

  await ensureTotalWithinBase(pageKey, articlePfId, quantite, { excludeLigneId: ligneId });

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
