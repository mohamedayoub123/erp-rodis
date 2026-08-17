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

export async function savePrixCarburantAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "chargesHub"))) {
    throw new Error("Cet utilisateur ne peut pas saisir les prix carburant.");
  }

  const annee = Number(String(formData.get("annee") || "0"));
  const mois = Number(String(formData.get("mois") || "0"));

  if (!annee || !mois || mois < 1 || mois > 12) {
    throw new Error("Annee et mois sont obligatoires.");
  }

  const { error } = await supabaseServer.from("prix_carburant").upsert(
    {
      annee,
      mois,
      prix_gaz: toNumberOrNull(formData.get("prix_gaz")),
      prix_essence: toNumberOrNull(formData.get("prix_essence")),
      prix_gasoil: toNumberOrNull(formData.get("prix_gasoil")),
      utilisateur: currentUser,
      date_saisie: new Date().toISOString(),
    },
    { onConflict: "annee,mois" }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/charges/prix");
  revalidatePath("/charges");
}

export async function deletePrixCarburantAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "chargesHub"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer un prix carburant.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!id) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("prix_carburant").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/charges/prix");
  revalidatePath("/charges");
}
