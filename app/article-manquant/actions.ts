"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Supprime pour de vrai les lignes famille_besoins liees a une commande en
// statut Stand (base proforma + suffixes -2/-3 pour les camions freres), a
// la demande explicite de l'utilisateur - ces commandes "en attente" ne
// doivent plus compter dans le calcul "Article manquant".
export async function deleteStandFamilleBesoinsAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "articleManquant")) {
    throw new Error("Cet utilisateur ne peut pas supprimer ces lignes.");
  }

  const { data: standCommandes, error: standError } = await supabaseServer
    .from("commandes")
    .select("numero_proforma")
    .eq("statut", "STAND");

  if (standError) {
    throw new Error(standError.message);
  }

  const baseProformas = [
    ...new Set(
      ((standCommandes as { numero_proforma: string | null }[] | null) ?? [])
        .map((row) => (row.numero_proforma || "").replace(/-\d+$/, "").trim())
        .filter((value) => value.length > 0 && !value.includes(",") && !value.includes(")"))
    ),
  ];

  if (baseProformas.length === 0) {
    return;
  }

  const orFilter = baseProformas
    .map((proforma) => `numero_proforma.eq.${proforma},numero_proforma.like.${proforma}-%`)
    .join(",");

  const { error: deleteError } = await supabaseServer
    .from("famille_besoins")
    .delete()
    .or(orFilter);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  revalidatePath("/article-manquant");
  revalidatePath("/tableau-commandes");
}
