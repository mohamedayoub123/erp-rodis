"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { MANUEL_FIELDS } from "./fields";

function toNumberOrNull(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function savePr4ManuelAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteRevueProcessus"))) {
    throw new Error("Cet utilisateur ne peut pas saisir les indicateurs PR4.");
  }

  const annee = Number(String(formData.get("annee") || "0"));
  const mois = Number(String(formData.get("mois") || "0"));

  if (!annee || !mois || mois < 1 || mois > 12) {
    throw new Error("Annee et mois sont obligatoires.");
  }

  const payload: Record<string, unknown> = { annee, mois, utilisateur: currentUser, date_saisie: new Date().toISOString() };
  for (const field of MANUEL_FIELDS) {
    payload[field.key] = toNumberOrNull(formData.get(field.key));
  }

  const { error } = await supabaseServer.from("pr4_indicateurs_manuel").upsert(payload, { onConflict: "annee,mois" });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/revue-processus/pr4");
}

export async function deletePr4ManuelAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "qualiteRevueProcessus"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer une ligne PR4.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!id) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("pr4_indicateurs_manuel").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/revue-processus/pr4");
}
