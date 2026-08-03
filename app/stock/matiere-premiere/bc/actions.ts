"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { STATUT_BC_OPTIONS } from "./constants";

function normalizeArticle(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandeBcMpNouvelle"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter des commandes.");
  }
}

async function requireEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandeBcMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les commandes.");
  }
}

function revalidateCommandeBcMpPages() {
  revalidatePath("/stock/matiere-premiere/bc");
}

export async function createCommandeBcMpAction(formData: FormData) {
  await requireWriteAccess();

  const articleName = String(formData.get("article") || "").trim();
  const quantiteRaw = String(formData.get("quantite") || "").trim().replace(",", ".");
  const quantite = quantiteRaw ? Number(quantiteRaw) : null;

  if (!articleName) {
    throw new Error("L'article est obligatoire.");
  }

  const articleNormalise = normalizeArticle(articleName);

  const { data: articleRow } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article")
    .eq("article_normalise", articleNormalise)
    .maybeSingle();

  // Compte le nombre de bons deja crees pour generer le prochain code
  // (BC1, BC2...), meme principe que TE/TS/MB/PD ailleurs dans l'appli.
  const { count } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id", { count: "exact", head: true });

  const code = `BC${(count ?? 0) + 1}`;

  const { error } = await supabaseServer.from("bons_commande_matiere_premiere").insert([
    {
      code,
      article_id: articleRow?.id ?? null,
      article_label: articleRow?.nom_article ?? articleName,
      quantite: quantite === null || Number.isNaN(quantite) ? null : quantite,
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
      statut: STATUT_BC_OPTIONS[0],
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}

export async function updateCommandeBcMpAction(formData: FormData) {
  await requireEditAccess();

  const bcId = Number(String(formData.get("bc_id") || "0"));

  if (!bcId) {
    throw new Error("Commande invalide.");
  }

  const quantiteRaw = String(formData.get("quantite") || "").trim().replace(",", ".");
  const quantite = quantiteRaw ? Number(quantiteRaw) : null;
  const statut = String(formData.get("statut") || "").trim() || STATUT_BC_OPTIONS[0];

  const { error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({
      quantite: quantite === null || Number.isNaN(quantite) ? null : quantite,
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
      statut,
    })
    .eq("id", bcId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}
