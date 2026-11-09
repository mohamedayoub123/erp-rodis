"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { conditionnementMpDisponible, contenanceMpDisponible, lireConditionnement, lireContenance } from "@/lib/contenance-mp";
import { logAudit } from "@/lib/audit-log";

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

  return currentUser;
}

async function requireEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "articlesMatierePremiere"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les articles.");
  }

  return currentUser;
}

async function requireDeleteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "articlesMatierePremiere"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer les articles.");
  }

  return currentUser;
}

// Contenance habituelle de l'article : nombre (kg, ou pieces pour un article compte a la piece) + type (Sac, Fut,
// Barrique, Carton), facultatifs ici (ils sont demandes a
// chaque reception d'import). Les deux vont ensemble : tous les deux remplis, ou tous les deux vides. Chaque partie est
// ignoree tant que son SQL (add_contenance_mp.sql, add_conditionnement_mp.sql) n'est pas execute.
async function lireContenanceArticle(formData: FormData): Promise<Record<string, number | string | null>> {
  const [avecContenance, avecType] = await Promise.all([contenanceMpDisponible(), conditionnementMpDisponible()]);
  const champs: Record<string, number | string | null> = {};
  if (!avecContenance) return champs;

  const contenance = lireContenance(formData.get("contenance"));
  if (contenance !== null && contenance <= 0) {
    throw new Error("La contenance doit etre superieure a 0 (ex : 25 kg, ou 1000 pieces).");
  }
  champs.contenance = contenance;

  if (avecType) {
    const conditionnement = lireConditionnement(formData.get("conditionnement"));
    if ((contenance !== null) !== (conditionnement !== null)) {
      throw new Error("Renseigne la contenance (kg ou pieces) ET le type (Sac, Fut, Barrique, Carton, Bidon), ou laisse les deux vides.");
    }
    champs.conditionnement = conditionnement;
  }
  return champs;
}

// Si la categorie saisie est une categorie deja utilisee a la majuscule / aux espaces pres, on enregistre l'ecriture EXISTANTE :
// la categorie est du texte libre, et un article plastique ecrit "Article de conditionnement plastique" ne serait sinon pas
// reconnu comme "ARTICLE DE CONDITIONNEMENT PLASTIQUE" donc absent de Statistique Article Plastique (E3).
async function categorieCanonique(saisie: string): Promise<string> {
  const texte = saisie.replace(/\s+/g, " ").trim();
  if (!texte) return "";
  const { data } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("categorie")
    .ilike("categorie", texte.replace(/[\\%_]/g, "\\$&"))
    .limit(1);
  return (data as { categorie: string | null }[] | null)?.[0]?.categorie ?? texte;
}

// Noms lisibles des champs dans le resume du journal (Historique) : jamais les noms de colonnes de la base.
const LIBELLES_CHAMPS_ARTICLE_MP: Record<string, string> = {
  nom_article: "nom",
  categorie: "categorie",
  sous_famille: "sous-famille",
  unite: "unite",
  gamme: "gamme",
  gamme_statistique: "gamme statistique",
  utilisation: "utilisation",
  min_stock: "stock min",
  max_stock: "stock max",
  depot_id: "depot",
  contenance: "contenance",
  conditionnement: "conditionnement",
};

function revalidateArticlesMpPages() {
  revalidatePath("/articles/matiere-premiere");
  revalidatePath("/stock/matiere-premiere");
  revalidatePath("/");
}

export async function createArticleMpAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const nomArticle = String(formData.get("nom_article") || "").trim();
  const categorie = await categorieCanonique(String(formData.get("categorie") || ""));
  const sousFamille = String(formData.get("sous_famille") || "").trim();
  const unite = String(formData.get("unite") || "").trim();
  const gamme = String(formData.get("gamme") || "").trim();
  const gammeStatistique = String(formData.get("gamme_statistique") || "").trim();
  const utilisation = String(formData.get("utilisation") || "").trim();
  const minStock = parseOptionalNumber(formData, "min_stock");
  const maxStock = parseOptionalNumber(formData, "max_stock");
  const depotIdRaw = String(formData.get("depot_id") || "").trim();
  const depotId = depotIdRaw ? Number(depotIdRaw) : null;
  const contenance = await lireContenanceArticle(formData);

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

  const { data: cree, error } = await supabaseServer.from("articles_matiere_premiere").insert([
    {
      nom_article: nomArticle,
      article_normalise: articleNormalise,
      categorie: categorie || null,
      sous_famille: sousFamille || null,
      unite: unite || null,
      gamme: gamme || null,
      gamme_statistique: gammeStatistique || null,
      utilisation: utilisation || null,
      min_stock: minStock,
      max_stock: maxStock,
      depot_id: depotId,
      ...contenance,
    },
  ]).select().single();

  if (error) {
    throw new Error(error.message);
  }

  await logAudit({
    utilisateur: currentUser,
    module: "ArticlesMp",
    action: "creation",
    cible: nomArticle,
    resume: `Article MP ${nomArticle} cree`,
    apres: cree,
  });

  revalidateArticlesMpPages();
}

// Refuse (contrainte de cle etrangere) si l'article a deja des lots/
// mouvements de stock, des lignes de BC, etc. lies - evite de supprimer
// silencieusement un article encore utilise dans l'historique.
export async function deleteArticleMpAction(formData: FormData) {
  const currentUser = await requireDeleteAccess();

  const articleId = Number(String(formData.get("article_id") || "0"));

  if (!articleId) {
    throw new Error("Article invalide.");
  }

  // Ligne complete gardee dans le journal (Historique) : on y voit ce qui a ete supprime et on peut le restaurer.
  const { data: avant } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("*")
    .eq("id", articleId)
    .maybeSingle<Record<string, unknown>>();

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

  if (avant) {
    await logAudit({
      utilisateur: currentUser,
      module: "ArticlesMp",
      action: "suppression",
      cible: String(avant.nom_article ?? `Article #${articleId}`),
      resume: `Article MP ${String(avant.nom_article ?? articleId)} supprime`,
      avant,
    });
  }

  revalidateArticlesMpPages();
}

export async function updateArticleMpAction(formData: FormData) {
  const currentUser = await requireEditAccess();

  const articleId = Number(String(formData.get("article_id") || "0"));
  const nomArticle = String(formData.get("nom_article") || "").trim();
  const categorie = await categorieCanonique(String(formData.get("categorie") || ""));
  const sousFamille = String(formData.get("sous_famille") || "").trim();
  const unite = String(formData.get("unite") || "").trim();
  const gamme = String(formData.get("gamme") || "").trim();
  const gammeStatistique = String(formData.get("gamme_statistique") || "").trim();
  const utilisation = String(formData.get("utilisation") || "").trim();
  const minStock = parseOptionalNumber(formData, "min_stock");
  const maxStock = parseOptionalNumber(formData, "max_stock");
  const depotIdRaw = String(formData.get("depot_id") || "").trim();
  const depotId = depotIdRaw ? Number(depotIdRaw) : null;
  const contenance = await lireContenanceArticle(formData);

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

  const { data: avant } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("*")
    .eq("id", articleId)
    .maybeSingle<Record<string, unknown>>();

  const changements: Record<string, string | number | null> = {
    nom_article: nomArticle,
    article_normalise: articleNormalise,
    categorie: categorie || null,
    sous_famille: sousFamille || null,
    unite: unite || null,
    gamme: gamme || null,
    gamme_statistique: gammeStatistique || null,
    utilisation: utilisation || null,
    min_stock: minStock,
    max_stock: maxStock,
    depot_id: depotId,
    ...contenance,
  };

  const { error } = await supabaseServer.from("articles_matiere_premiere").update(changements).eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  // Journal (Historique) : seulement si quelque chose a vraiment change ; avant / apres = la ligne complete.
  const champsModifies = Object.keys(changements).filter(
    (champ) => JSON.stringify(avant?.[champ] ?? null) !== JSON.stringify(changements[champ] ?? null)
  );
  if (avant && champsModifies.length > 0) {
    await logAudit({
      utilisateur: currentUser,
      module: "ArticlesMp",
      action: "modification",
      cible: nomArticle,
      resume: `Article MP ${String(avant.nom_article)} modifie (${champsModifies
        .filter((champ) => champ !== "article_normalise")
        .map((champ) => LIBELLES_CHAMPS_ARTICLE_MP[champ] ?? champ)
        .join(", ")})`,
      avant,
      apres: { ...avant, ...changements },
    });
  }

  revalidateArticlesMpPages();
}
