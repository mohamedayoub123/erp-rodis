"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { STATUT_OPTIONS } from "./constants";

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandeMpNouvelle"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter des commandes.");
  }
}

async function requireEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandeMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les commandes.");
  }
}

function revalidateCommandeMpPages() {
  revalidatePath("/stock/matiere-premiere/commande");
}

export async function createCommandeMpAction(formData: FormData) {
  await requireWriteAccess();

  const statut = String(formData.get("statut") || "").trim() || STATUT_OPTIONS[0];

  const { error } = await supabaseServer.from("commandes_matiere_premiere").insert([
    {
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
      date_commande: parseOptionalText(formData, "date_commande"),
      fournisseur: parseOptionalText(formData, "fournisseur"),
      statut,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeMpPages();
}

export async function updateCommandeMpAction(formData: FormData) {
  await requireEditAccess();

  const commandeId = Number(String(formData.get("commande_id") || "0"));

  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const statut = String(formData.get("statut") || "").trim() || STATUT_OPTIONS[0];

  const { error } = await supabaseServer
    .from("commandes_matiere_premiere")
    .update({
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
      date_commande: parseOptionalText(formData, "date_commande"),
      fournisseur: parseOptionalText(formData, "fournisseur"),
      statut,
    })
    .eq("id", commandeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeMpPages();
}
