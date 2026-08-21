"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canDeletePageUser,
  canWritePageUser,
  getCurrentStockUser,
} from "@/lib/stock-auth";

function normalizeFournisseur(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

async function requireFournisseursWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "fournisseurs"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter des fournisseurs.");
  }
}

async function requireFournisseursEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "fournisseurs"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les fournisseurs.");
  }
}

async function requireFournisseursDeleteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "fournisseurs"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer les fournisseurs.");
  }
}

export async function createFournisseurAction(formData: FormData) {
  await requireFournisseursWriteAccess();

  const nomFournisseur = String(formData.get("nom_fournisseur") || "").trim();
  const pays = String(formData.get("pays") || "").trim();

  if (!nomFournisseur) {
    throw new Error("Le nom du fournisseur est obligatoire.");
  }

  const fournisseurNormalise = normalizeFournisseur(nomFournisseur);

  const { data: existingFournisseur } = await supabaseServer
    .from("fournisseurs")
    .select("id")
    .eq("fournisseur_normalise", fournisseurNormalise)
    .maybeSingle();

  if (existingFournisseur) {
    throw new Error(`Le fournisseur ${nomFournisseur} existe deja.`);
  }

  const { error } = await supabaseServer.from("fournisseurs").insert([
    {
      nom_fournisseur: nomFournisseur,
      fournisseur_normalise: fournisseurNormalise,
      pays: pays || null,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/fournisseurs");
}

export async function updateFournisseurAction(formData: FormData) {
  await requireFournisseursEditAccess();

  const fournisseurId = Number(String(formData.get("fournisseur_id") || "0"));
  const nomFournisseur = String(formData.get("nom_fournisseur") || "").trim();
  const pays = String(formData.get("pays") || "").trim();

  if (!fournisseurId || !nomFournisseur) {
    throw new Error("Fournisseur invalide.");
  }

  const fournisseurNormalise = normalizeFournisseur(nomFournisseur);

  const { data: duplicateFournisseur } = await supabaseServer
    .from("fournisseurs")
    .select("id")
    .eq("fournisseur_normalise", fournisseurNormalise)
    .neq("id", fournisseurId)
    .maybeSingle();

  if (duplicateFournisseur) {
    throw new Error(`Un autre fournisseur existe deja avec ce nom: ${nomFournisseur}`);
  }

  const { error } = await supabaseServer
    .from("fournisseurs")
    .update({
      nom_fournisseur: nomFournisseur,
      fournisseur_normalise: fournisseurNormalise,
      pays: pays || null,
    })
    .eq("id", fournisseurId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/fournisseurs");
}

export async function deleteFournisseurAction(formData: FormData) {
  await requireFournisseursDeleteAccess();

  const fournisseurId = Number(String(formData.get("fournisseur_id") || "0"));

  if (!fournisseurId) {
    throw new Error("Fournisseur invalide.");
  }

  const { error } = await supabaseServer.from("fournisseurs").delete().eq("id", fournisseurId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/fournisseurs");
}
