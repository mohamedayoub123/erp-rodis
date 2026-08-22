"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "productionPlastique"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les recettes plastique.");
  }
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
