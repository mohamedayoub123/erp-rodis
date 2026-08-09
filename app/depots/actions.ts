"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

export async function createDepotAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les depots.");
  }

  const nom = String(formData.get("nom") || "").trim();
  if (!nom) {
    throw new Error("Nom du depot obligatoire.");
  }

  const { error } = await supabaseServer.from("depots").insert({ nom });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/depots");
}

// Le depot n'est qu'un champ sur chaque article (depot_id, voir Articles
// Produit Fini / Articles Matiere Premiere) - le detacher des articles avant
// de supprimer, sinon la contrainte de cle etrangere bloque la suppression
// des qu'au moins un article y est rattache.
export async function deleteDepotAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de depot.");
  }

  const depotId = Number(formData.get("depot_id") || "0");
  if (!depotId) {
    throw new Error("Depot invalide.");
  }

  const [{ error: unlinkPfError }, { error: unlinkMpError }] = await Promise.all([
    supabaseServer.from("articles").update({ depot_id: null }).eq("depot_id", depotId),
    supabaseServer.from("articles_matiere_premiere").update({ depot_id: null }).eq("depot_id", depotId),
  ]);

  if (unlinkPfError) {
    throw new Error(unlinkPfError.message);
  }
  if (unlinkMpError) {
    throw new Error(unlinkMpError.message);
  }

  const { error } = await supabaseServer.from("depots").delete().eq("id", depotId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/depots");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/articles/matiere-premiere");
}
