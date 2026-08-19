"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function toNumberOrNull(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateProduitDimensionsAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "produit"))) {
    throw new Error("Cet utilisateur ne peut pas modifier ce produit.");
  }

  const type = String(formData.get("type") || "");
  const articleId = Number(String(formData.get("article_id") || "0"));

  if (type !== "mp" && type !== "pf") {
    throw new Error("Type de produit invalide.");
  }
  if (!articleId) {
    throw new Error("Produit invalide.");
  }

  const table = type === "mp" ? "articles_matiere_premiere" : "articles";

  const { error } = await supabaseServer
    .from(table)
    .update({
      longueur: toNumberOrNull(formData.get("longueur")),
      largeur: toNumberOrNull(formData.get("largeur")),
      hauteur: toNumberOrNull(formData.get("hauteur")),
      poids_net: toNumberOrNull(formData.get("poids_net")),
      poids_brut: toNumberOrNull(formData.get("poids_brut")),
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/produit/${type}/${articleId}`);
}
