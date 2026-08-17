"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function toNumberOrNull(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function saveChargesUsineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "chargesHub"))) {
    throw new Error("Cet utilisateur ne peut pas saisir les charges usine.");
  }

  const annee = Number(String(formData.get("annee") || "0"));
  const mois = Number(String(formData.get("mois") || "0"));

  if (!annee || !mois || mois < 1 || mois > 12) {
    throw new Error("Annee et mois sont obligatoires.");
  }

  // Upsert sur (annee, mois) : re-saisir le meme mois corrige la ligne
  // existante au lieu d'en creer une 2eme.
  const { error } = await supabaseServer.from("charges_usine").upsert(
    {
      annee,
      mois,
      electricite_plastique: toNumberOrNull(formData.get("electricite_plastique")),
      electricite_cosmetique: toNumberOrNull(formData.get("electricite_cosmetique")),
      gaz: toNumberOrNull(formData.get("gaz")),
      gasoil_plastique: toNumberOrNull(formData.get("gasoil_plastique")),
      gasoil_cosmetique: toNumberOrNull(formData.get("gasoil_cosmetique")),
      essence: toNumberOrNull(formData.get("essence")),
      salaire_journalier_cosmetique: toNumberOrNull(formData.get("salaire_journalier_cosmetique")),
      salaire_journalier_global: toNumberOrNull(formData.get("salaire_journalier_global")),
      salaire_cadre: toNumberOrNull(formData.get("salaire_cadre")),
      depense_usine: toNumberOrNull(formData.get("depense_usine")),
      utilisateur: currentUser,
      date_saisie: new Date().toISOString(),
    },
    { onConflict: "annee,mois" }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/charges");
}

export async function deleteChargesUsineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "chargesHub"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer une ligne de charges usine.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!id) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("charges_usine").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/charges");
}
