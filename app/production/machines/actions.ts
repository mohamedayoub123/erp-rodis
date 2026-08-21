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

// Plusieurs types de produit possibles par machine (checkboxes, meme nom de
// champ "type_produit" repete) - tableau vide range en NULL, pas en [].
function toTypeProduitsArray(formData: FormData) {
  const values = formData.getAll("type_produit").map((v) => String(v).trim()).filter(Boolean);
  return values.length > 0 ? values : null;
}

// Une machine peut dependre de plusieurs machines Energie a la fois (meme
// convention que type_produit ci-dessus - checkboxes, meme nom de champ
// repete).
function toEnergieMachineIdsArray(formData: FormData) {
  const values = formData
    .getAll("energie_machine_ids")
    .map((v) => Number(String(v).trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
  return values.length > 0 ? values : null;
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
    type_produit: toTypeProduitsArray(formData),
    consommation_electrique_kw: toNumberOrNull(formData.get("consommation_electrique_kw")),
    consommation_gaz_litres_heure: toNumberOrNull(formData.get("consommation_gaz_litres_heure")),
    consommation_gasoil_litres_heure: toNumberOrNull(formData.get("consommation_gasoil_litres_heure")),
    energie_machine_ids: toEnergieMachineIdsArray(formData),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/machines");
}

export async function updateMachineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas modifier de machine.");
  }

  const id = Number(String(formData.get("id") || "0"));
  const nom = String(formData.get("nom") || "").trim();

  if (!id || !nom) {
    throw new Error("Machine invalide.");
  }

  const { error } = await supabaseServer
    .from("machines")
    .update({
      nom,
      zone: String(formData.get("zone") || "").trim() || null,
      type: String(formData.get("type") || "").trim() || null,
      type_produit: toTypeProduitsArray(formData),
      consommation_electrique_kw: toNumberOrNull(formData.get("consommation_electrique_kw")),
      consommation_gaz_litres_heure: toNumberOrNull(formData.get("consommation_gaz_litres_heure")),
      consommation_gasoil_litres_heure: toNumberOrNull(formData.get("consommation_gasoil_litres_heure")),
      energie_machine_ids: toEnergieMachineIdsArray(formData),
    })
    .eq("id", id);

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
    // Code Postgres 23503 = violation de cle etrangere - une machine deja
    // citee dans un programme (machine_fabrication_id/conditionnement_id/
    // emballage_id, voir create_programmes.sql) ne peut pas etre supprimee
    // sans casser cet historique. Message clair au lieu de laisser
    // l'erreur brute Postgres remonter jusqu'a l'ecran d'erreur generique.
    if (error.code === "23503") {
      throw new Error(
        "Cette machine est deja utilisee dans un ou plusieurs programmes de production - impossible de la supprimer."
      );
    }
    throw new Error(error.message);
  }

  revalidatePath("/production/machines");
}

export async function addMachineProduitAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter de produit.");
  }

  const machineId = Number(String(formData.get("machine_id") || "0"));
  const articleId = Number(String(formData.get("article_id") || "0"));

  if (!machineId || !articleId) {
    throw new Error("Choisis un produit avant d'ajouter.");
  }

  const { error } = await supabaseServer.from("machine_produits").upsert(
    {
      machine_id: machineId,
      article_id: articleId,
      temps_minutes: toNumberOrNull(formData.get("temps_minutes")),
      capacite: toNumberOrNull(formData.get("capacite")),
      capacite_min: toNumberOrNull(formData.get("capacite_min")),
      capacite_max: toNumberOrNull(formData.get("capacite_max")),
    },
    { onConflict: "machine_id,article_id" }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/production/machines/${machineId}`);
}

export async function deleteMachineProduitAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "machines"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de produit.");
  }

  const id = Number(String(formData.get("id") || "0"));
  const machineId = Number(String(formData.get("machine_id") || "0"));

  if (!id) {
    throw new Error("Produit introuvable.");
  }

  const { error } = await supabaseServer.from("machine_produits").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/production/machines/${machineId}`);
}
