"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { MOIS_FIELD_KEYS } from "./fields";

export async function saveFormationRowAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteRevueProcessus"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le plan de formation.");
  }

  const id = Number(String(formData.get("id") || "0")) || null;
  const annee = Number(String(formData.get("annee") || "0"));
  const categorie = String(formData.get("categorie") || "").trim() || null;
  const formation = String(formData.get("formation") || "").trim();
  const ordre = Number(String(formData.get("ordre") || "0")) || 0;
  const estBilan = formData.get("est_bilan") === "on";

  if (!annee || !formation) {
    throw new Error("Annee et formation sont obligatoires.");
  }

  const payload: Record<string, unknown> = {
    annee,
    categorie,
    formation,
    ordre,
    est_bilan: estBilan,
    updated_at: new Date().toISOString(),
  };
  for (const { planifieKey, dateKey } of MOIS_FIELD_KEYS) {
    payload[planifieKey] = formData.get(planifieKey) === "on";
    payload[dateKey] = String(formData.get(dateKey) || "").trim() || null;
  }

  const { error } = id
    ? await supabaseServer.from("pr4_formation_plan").update(payload).eq("id", id)
    : await supabaseServer.from("pr4_formation_plan").insert(payload);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/revue-processus/pr4/formation");
}

export async function deleteFormationRowAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "qualiteRevueProcessus"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer une ligne du plan de formation.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!id) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("pr4_formation_plan").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/revue-processus/pr4/formation");
}
