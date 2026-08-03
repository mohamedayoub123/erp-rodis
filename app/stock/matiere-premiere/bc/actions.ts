"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

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

function parseOptionalNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim().replace(",", ".");
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isNaN(value) ? 0 : value;
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

  return currentUser;
}

function revalidateCommandeBcMpPages() {
  revalidatePath("/stock/matiere-premiere/bc");
}

// Un seul BC peut regrouper plusieurs articles (une ligne par article, tous
// avec le meme code/doss/date) - meme principe que les groupes TE/TS/PD/MB
// ailleurs dans l'appli. Le statut n'est plus saisi ici : il se calcule
// depuis quantite/quantite_importee (toujours 0 a la creation).
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
      quantite_importee: parseOptionalNumber(formData, "quantite_importee"),
      n_doss_4d_import: parseOptionalText(formData, "n_doss_4d_import"),
      n_doss_erp_import: parseOptionalText(formData, "n_doss_erp_import"),
    })
    .eq("id", bcId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}

// Modifie le dossier de commande (pas le statut, calcule automatiquement)
// pour TOUTES les lignes qui partagent le meme code.
export async function updateCommandeBcGroupAction(formData: FormData) {
  await requireEditAccess();

  const code = String(formData.get("code") || "").trim();

  if (!code) {
    throw new Error("Commande invalide.");
  }

  const { error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
    })
    .eq("code", code);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}

export async function deleteCommandeBcLigneAction(formData: FormData) {
  await requireEditAccess();

  const bcId = Number(String(formData.get("bc_id") || "0"));

  if (!bcId) {
    throw new Error("Ligne invalide.");
  }

  const { data: ligneRow } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("code")
    .eq("id", bcId)
    .maybeSingle();

  const code = (ligneRow as { code: string } | null)?.code ?? null;

  const { error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .delete()
    .eq("id", bcId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();

  if (code) {
    const { count } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select("id", { count: "exact", head: true })
      .eq("code", code);

    if (!count) {
      redirect("/stock/matiere-premiere/bc");
    }
  }
}
