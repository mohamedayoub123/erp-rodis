"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  CATEGORIES_PLASTIQUE,
  computeCoutPlastiqueParPiece,
  DEPOT_PLASTIQUE_DEST_DEFAULT,
  DEPOT_PLASTIQUE_SOURCE_DEFAULT,
  type RecettePlastiqueLigne,
} from "./shared";
import { createTransferOrder, approveTransferOrder, postTransferOrderToInvoice } from "@/app/depots/transfer-order/actions";
import { validateInvoiceOrder } from "@/app/depots/invoice-order/actions";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "productionPlastique"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les recettes plastique.");
  }
  return currentUser;
}

function parsePourcentage(formData: FormData) {
  const raw = String(formData.get("pourcentage") || "").trim().replace(",", ".");
  const value = Number(raw);
  return Number.isNaN(value) ? 0 : value;
}

function revalidateRecettePlastiquePages(articleProduitId: number) {
  revalidatePath("/production-plastique/recettes");
  revalidatePath(`/production-plastique/recettes/${articleProduitId}`);
}

export async function addRecettePlastiqueLigneAction(formData: FormData) {
  await requireWriteAccess();

  const articleProduitId = Number(formData.get("article_produit_id") || "0");
  // ProduitPickerField (composant partage) ecrit toujours son champ cache
  // sous le nom "article_id".
  const articleMatiereId = Number(formData.get("article_id") || "0");
  const pourcentage = parsePourcentage(formData);

  if (!articleProduitId || !articleMatiereId) {
    throw new Error("Article invalide.");
  }
  if (articleMatiereId === articleProduitId) {
    throw new Error("Un article ne peut pas etre sa propre matiere.");
  }

  const { error } = await supabaseServer
    .from("recettes_plastique")
    .upsert(
      { article_produit_id: articleProduitId, article_matiere_id: articleMatiereId, pourcentage },
      { onConflict: "article_produit_id,article_matiere_id" }
    );

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePlastiquePages(articleProduitId);
}

export async function updateRecettePlastiqueLigneAction(formData: FormData) {
  await requireWriteAccess();

  const ligneId = Number(formData.get("ligne_id") || "0");
  const articleProduitId = Number(formData.get("article_produit_id") || "0");
  const pourcentage = parsePourcentage(formData);

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("recettes_plastique")
    .update({ pourcentage })
    .eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePlastiquePages(articleProduitId);
}

export async function deleteRecettePlastiqueLigneAction(formData: FormData) {
  await requireWriteAccess();

  const ligneId = Number(formData.get("ligne_id") || "0");
  const articleProduitId = Number(formData.get("article_produit_id") || "0");

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("recettes_plastique").delete().eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePlastiquePages(articleProduitId);
}

export async function updatePoidsNetAction(formData: FormData) {
  await requireWriteAccess();

  const articleProduitId = Number(formData.get("article_produit_id") || "0");
  if (!articleProduitId) {
    throw new Error("Article invalide.");
  }

  const raw = String(formData.get("poids_net") || "").trim().replace(",", ".");
  const poidsNet = raw ? Number(raw) : null;

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ poids_net: Number.isNaN(poidsNet) ? null : poidsNet })
    .eq("id", articleProduitId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePlastiquePages(articleProduitId);
}

type PendingProgrammePlastiqueRow = {
  article_id: number;
  quantite: number;
  numero_lot?: string;
};

// Enregistre un lot de production plastique (article/qte/lot par ligne, lot
// optionnel) en une seule action : 1) entre le stock dans le depot source
// (prix auto depuis la recette, comme Entree MP - ces articles sont
// fabriques en interne, jamais achetes) 2) cree un Transfer Order vers le
// depot destination et l'approuve/poste/valide immediatement (demande
// explicite : "si je fais save ca part directement", le stock doit deja
// etre dans le depot destination a la fin, pas juste "en attente"). Verifie
// uniquement la permission "productionPlastique" - jamais "depots" - pour
// que cette action reste utilisable par qui gere le plastique sans lui
// donner acces au module Depots entier.
export async function saveProgrammePlastiqueAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const depotSourceId = Number(formData.get("depot_source_id") || "0") || DEPOT_PLASTIQUE_SOURCE_DEFAULT;
  const depotDestinationId = Number(formData.get("depot_destination_id") || "0") || DEPOT_PLASTIQUE_DEST_DEFAULT;
  const dateJour = new Date().toISOString().slice(0, 10);

  const rawPayload = String(formData.get("payload") || "").trim();
  if (!rawPayload) {
    throw new Error("Aucune ligne a enregistrer.");
  }

  let rows: PendingProgrammePlastiqueRow[] = [];
  try {
    rows = JSON.parse(rawPayload) as PendingProgrammePlastiqueRow[];
  } catch {
    throw new Error("Le contenu du programme est invalide.");
  }

  const lignes = rows
    .map((row) => ({
      articleId: Number(row.article_id),
      quantite: Number(row.quantite),
      numeroLot: String(row.numero_lot || "").trim(),
    }))
    .filter((row) => row.articleId > 0 && row.quantite > 0);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins un article avec une quantite.");
  }

  const articleIds = [...new Set(lignes.map((l) => l.articleId))];
  const { data: articlesData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article, categorie, poids_net, unite")
    .in("id", articleIds);
  const articles = (articlesData ?? []) as {
    id: number;
    nom_article: string;
    categorie: string | null;
    poids_net: number | null;
    unite: string | null;
  }[];
  const articleById = new Map(articles.map((a) => [a.id, a]));

  const plastiqueIds = articles
    .filter((a) => (CATEGORIES_PLASTIQUE as readonly string[]).includes(a.categorie || ""))
    .map((a) => a.id);

  const { data: recettesData } = await supabaseServer
    .from("recettes_plastique")
    .select("id, article_produit_id, article_matiere_id, pourcentage")
    .in("article_produit_id", plastiqueIds.length > 0 ? plastiqueIds : [0]);
  const recettes = (recettesData ?? []) as RecettePlastiqueLigne[];
  const lignesParArticle = new Map<number, RecettePlastiqueLigne[]>();
  for (const ligne of recettes) {
    const list = lignesParArticle.get(ligne.article_produit_id) ?? [];
    list.push(ligne);
    lignesParArticle.set(ligne.article_produit_id, list);
  }

  const prixAutoByArticleId = new Map<number, number>();
  for (const articleId of plastiqueIds) {
    const article = articleById.get(articleId);
    const recetteLignes = lignesParArticle.get(articleId) ?? [];
    const { coutParPiece } = await computeCoutPlastiqueParPiece(article?.poids_net ?? null, recetteLignes);
    if (coutParPiece !== null) {
      prixAutoByArticleId.set(articleId, coutParPiece);
    }
  }

  const payload = lignes.map((ligne, index) => {
    const article = articleById.get(ligne.articleId);
    const numeroLot = ligne.numeroLot || `PROG.${dateJour.replace(/-/g, "")}.${index + 1}`;

    return {
      article_id: ligne.articleId,
      date_jour: dateJour,
      date_reception: dateJour,
      numero_lot: numeroLot,
      code_normalise: numeroLot.toUpperCase(),
      qte_entree: ligne.quantite,
      qte_sortie: 0,
      unite: article?.unite ?? null,
      depot_id: depotSourceId,
      prix_unitaire: prixAutoByArticleId.get(ligne.articleId) ?? null,
      devise: "FCFA",
      utilisateur: currentUser,
      source_import: "web:programme-plastique",
    };
  });

  const { error: insertError } = await supabaseServer.from("lots_stock_matiere_premiere").insert(payload);
  if (insertError) {
    throw new Error(insertError.message);
  }

  const transferOrderId = await createTransferOrder({
    depotSourceId,
    depotDestinationId,
    dateJour,
    creePar: currentUser,
    remarque: "Programme plastique",
    lignes: lignes.map((ligne) => ({ articleType: "MP" as const, articleId: ligne.articleId, quantiteDemandee: ligne.quantite })),
  });

  await approveTransferOrder(transferOrderId);
  const invoiceOrderId = await postTransferOrderToInvoice(transferOrderId, currentUser);
  await validateInvoiceOrder(invoiceOrderId, currentUser);

  revalidatePath("/production-plastique/programme");
  revalidatePath("/stock/matiere-premiere/stock");
  revalidatePath("/mouvements/matiere-premiere");
  revalidatePath("/depots/transfer-order");

  return { ok: true, transferOrderId };
}
