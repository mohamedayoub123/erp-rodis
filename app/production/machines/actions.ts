"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function toNumberOrNull(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createMachineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter de machine.");
  }

  const nom = String(formData.get("nom") || "").trim();
  if (!nom) {
    throw new Error("Le nom de la machine est obligatoire.");
  }

  const { error } = await supabaseServer.from("machines").insert({
    nom,
    zone: String(formData.get("zone") || "").trim() || null,
    type: String(formData.get("type") || "").trim() || null,
    capacite: toNumberOrNull(formData.get("capacite")),
    capacite_min: toNumberOrNull(formData.get("capacite_min")),
    capacite_max: toNumberOrNull(formData.get("capacite_max")),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/machines");
}

export async function deleteMachineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de machine.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!id) {
    throw new Error("Machine introuvable.");
  }

  const { error } = await supabaseServer.from("machines").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/machines");
}
