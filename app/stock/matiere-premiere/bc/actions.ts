"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { STATUT_BC_OPTIONS } from "./constants";

type PendingBcLigne = {
  article: string;
  quantite: number;
};

function normalizeArticle(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
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

// Un seul BC peut regrouper plusieurs articles (une ligne par article, tous
// avec le meme code/doss/statut/date) - meme principe que les groupes
// TE/TS/PD/MB ailleurs dans l'appli.
export async function createCommandeBcBatchAction(formData: FormData) {
  await requireWriteAccess();

  const rawPayload = String(formData.get("payload") || "").trim();

  if (!rawPayload) {
    throw new Error("Aucun article a enregistrer.");
  }

  let lignes: PendingBcLigne[] = [];

  try {
    lignes = JSON.parse(rawPayload) as PendingBcLigne[];
  } catch {
    throw new Error("Le contenu de la commande est invalide.");
  }

  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new Error("Aucun article a enregistrer.");
  }

  const articleNames = lignes.map((ligne) => String(ligne.article || "").trim()).filter(Boolean);
  const articleNormalises = articleNames.map(normalizeArticle);

  const { data: articleRows } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article, article_normalise")
    .in("article_normalise", articleNormalises);

  const articleByNormalise = new Map(
    ((articleRows ?? []) as { id: number; nom_article: string; article_normalise: string }[]).map(
      (row) => [row.article_normalise, row]
    )
  );

  // Compte le nombre de BC deja crees (groupes distincts par code) pour
  // generer le prochain code (BC1, BC2...).
  const { data: existingCodes } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("code");

  const distinctCodes = new Set(((existingCodes ?? []) as { code: string }[]).map((row) => row.code));
  const code = `BC${distinctCodes.size + 1}`;

  const nDoss4d = parseOptionalText(formData, "n_doss_4d");
  const nDossErp = parseOptionalText(formData, "n_doss_erp");

  const rowsToInsert = lignes
    .map((ligne) => {
      const articleName = String(ligne.article || "").trim();
      const quantite = Number(ligne.quantite);
      if (!articleName || !quantite || quantite <= 0) return null;

      const articleRow = articleByNormalise.get(normalizeArticle(articleName));

      return {
        code,
        article_id: articleRow?.id ?? null,
        article_label: articleRow?.nom_article ?? articleName,
        quantite,
        n_doss_4d: nDoss4d,
        n_doss_erp: nDossErp,
        statut: STATUT_BC_OPTIONS[0],
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rowsToInsert.length === 0) {
    throw new Error("Aucun article valide a enregistrer.");
  }

  const { error } = await supabaseServer.from("bons_commande_matiere_premiere").insert(rowsToInsert);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();

  return { ok: true, code };
}

export async function updateCommandeBcLigneAction(formData: FormData) {
  await requireEditAccess();

  const bcId = Number(String(formData.get("bc_id") || "0"));

  if (!bcId) {
    throw new Error("Ligne invalide.");
  }

  const articleName = String(formData.get("article") || "").trim();
  const quantiteRaw = String(formData.get("quantite") || "").trim().replace(",", ".");
  const quantite = quantiteRaw ? Number(quantiteRaw) : null;

  if (!articleName || quantite === null || Number.isNaN(quantite) || quantite <= 0) {
    throw new Error("Article ou quantite invalide.");
  }

  const articleNormalise = normalizeArticle(articleName);
  const { data: articleRow } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article")
    .eq("article_normalise", articleNormalise)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({
      article_id: articleRow?.id ?? null,
      article_label: articleRow?.nom_article ?? articleName,
      quantite,
    })
    .eq("id", bcId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}

// Modifie le statut/dossier de TOUT le BC (toutes les lignes qui partagent
// le meme code) en une seule fois.
export async function updateCommandeBcGroupAction(formData: FormData) {
  await requireEditAccess();

  const code = String(formData.get("code") || "").trim();

  if (!code) {
    throw new Error("Commande invalide.");
  }

  const statut = String(formData.get("statut") || "").trim() || STATUT_BC_OPTIONS[0];

  const { error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
      statut,
    })
    .eq("code", code);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}
