"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canWritePageUser,
  getCurrentStockUser,
} from "@/lib/stock-auth";

function normalizeArticle(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

function parseOptionalNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

// Champs venant de la feuille "Data" du fichier GFPC-ENR-032 Fabrication et
// Conditionnement (parametres de production/emballage par article).
function parseProductionFields(formData: FormData) {
  return {
    volume_unitaire: parseOptionalNumber(formData, "volume_unitaire"),
    volume_stockage: parseOptionalNumber(formData, "volume_stockage"),
    cadence: parseOptionalNumber(formData, "cadence"),
    nb_carton_par_vrac: parseOptionalNumber(formData, "nb_carton_par_vrac"),
    max_production_vrac_8h: parseOptionalNumber(formData, "max_production_vrac_8h"),
    contenance: parseOptionalNumber(formData, "contenance"),
    nb_piece_par_max_vrac: parseOptionalNumber(formData, "nb_piece_par_max_vrac"),
    piece_par_carton: parseOptionalNumber(formData, "piece_par_carton"),
    min_vrac: parseOptionalNumber(formData, "min_vrac"),
    max_vrac_auto: parseOptionalNumber(formData, "max_vrac_auto"),
    vrac_max_manuel: parseOptionalNumber(formData, "vrac_max_manuel"),
    dispenseur_pcs_carton: parseOptionalNumber(formData, "dispenseur_pcs_carton"),
    besoin_pot_flacon: formData.get("besoin_pot_flacon") === "on",
    besoin_capsule: formData.get("besoin_capsule") === "on",
    besoin_sleeve: formData.get("besoin_sleeve") === "on",
    besoin_dispenseur: formData.get("besoin_dispenseur") === "on",
    besoin_carton: formData.get("besoin_carton") === "on",
    besoin_etiquette: formData.get("besoin_etiquette") === "on",
    besoin_etui: formData.get("besoin_etui") === "on",
    code_auto: String(formData.get("code_auto") || "").trim() || null,
    code_manu: String(formData.get("code_manu") || "").trim() || null,
  };
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
  const nature = String(formData.get("nature") || "fini").trim();
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
      nature: nature === "vrac" ? "vrac" : "fini",
      min_stock: Number.isNaN(minStock) ? 0 : minStock,
      max_stock: Number.isNaN(maxStock) ? 0 : maxStock,
      actif: true,
      ...parseProductionFields(formData),
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/articles/produit-fini");
  revalidatePath("/stock");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/tableau-commandes");
  revalidatePath("/production/recette-fabrication");
  revalidatePath("/production/recette-conditionnement");
  redirect("/articles/produit-fini");
}

export async function updateArticleAction(formData: FormData) {
  await requireArticlesEditAccess();

  const articleId = Number(String(formData.get("article_id") || "0"));
  const nomArticle = String(formData.get("nom_article") || "").trim();
  const typeArticle = String(formData.get("type_article") || "").trim();
  const marque = String(formData.get("marque") || "").trim();
  const gamme = String(formData.get("gamme") || "").trim();
  const nature = String(formData.get("nature") || "fini").trim();
  const depotIdRaw = String(formData.get("depot_id") || "").trim();
  const depotId = depotIdRaw ? Number(depotIdRaw) : null;
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
      nature: nature === "vrac" ? "vrac" : "fini",
      depot_id: depotId,
      min_stock: Number.isNaN(minStock) ? 0 : minStock,
      max_stock: Number.isNaN(maxStock) ? 0 : maxStock,
      ...parseProductionFields(formData),
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/articles/produit-fini");
  revalidatePath("/stock");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/tableau-commandes");
  revalidatePath("/production/recette-fabrication");
  revalidatePath("/production/recette-conditionnement");
}
