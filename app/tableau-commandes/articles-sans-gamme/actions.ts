"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

export async function reassignArticlesGammeAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  // "tableauCommandes" est une page en lecture seule (hasWrite: false dans
  // page-registry.ts) - modifier la gamme d'un article est une edition de
  // fiche produit, donc on reutilise le droit d'ecriture "produit" (meme
  // permission que la page /produit/[type]/[id]) plutot que d'en creer un
  // nouveau juste pour cet outil.
  if (!(await canWritePageUser(currentUser, "produit"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les gammes.");
  }

  const articleIds = formData
    .getAll("article_id")
    .map((value) => Number(value))
    .filter((id) => id > 0);

  const nouvelleGamme = String(formData.get("nouvelle_gamme") || "").trim();
  const gammeExistante = String(formData.get("gamme_existante") || "").trim();
  const targetGamme = nouvelleGamme || gammeExistante;

  if (articleIds.length === 0) {
    throw new Error("Choisis au moins un article.");
  }
  if (!targetGamme) {
    throw new Error("Choisis une gamme existante ou tape le nom d'une nouvelle gamme.");
  }

  const { error } = await supabaseServer.from("articles").update({ gamme: targetGamme }).in("id", articleIds);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/tableau-commandes");
  revalidatePath("/tableau-commandes/articles-sans-gamme");
}
