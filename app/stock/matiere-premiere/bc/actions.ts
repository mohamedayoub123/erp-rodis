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
  revalidatePath("/stock/matiere-premiere/commande");
}

// Un seul BC peut regrouper plusieurs articles (une ligne par article, tous
// avec le meme code/doss/date) - meme principe que les groupes TE/TS/PD/MB
// ailleurs dans l'appli.
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

// Enregistre un NOUVEL evenement d'import pour une ligne (pas d'ecrasement -
// un article commande en une fois peut arriver en plusieurs fois, chacune
// avec son propre dossier). Refuse si la quantite depasse ce qu'il reste a
// importer.
export async function createImportEvenementAction(formData: FormData) {
  await requireEditAccess();

  const bcLigneId = Number(String(formData.get("bc_ligne_id") || "0"));
  const quantiteRaw = String(formData.get("quantite_importee") || "").trim().replace(",", ".");
  const quantiteImportee = quantiteRaw ? Number(quantiteRaw) : null;

  if (!bcLigneId || quantiteImportee === null || Number.isNaN(quantiteImportee) || quantiteImportee <= 0) {
    throw new Error("Quantite importee invalide.");
  }

  const { data: ligneRow, error: ligneError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("quantite")
    .eq("id", bcLigneId)
    .maybeSingle();

  if (ligneError || !ligneRow) {
    throw new Error("Ligne de commande introuvable.");
  }

  const { data: existingImports } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("quantite_importee")
    .eq("bc_ligne_id", bcLigneId);

  const dejaImporte = ((existingImports ?? []) as { quantite_importee: number }[]).reduce(
    (sum, row) => sum + Number(row.quantite_importee ?? 0),
    0
  );

  const quantiteCommandee = Number((ligneRow as { quantite: number }).quantite ?? 0);
  const reste = quantiteCommandee - dejaImporte;

  if (quantiteImportee > reste) {
    throw new Error(`Quantite trop grande : il ne reste que ${reste} a importer.`);
  }

  const { error } = await supabaseServer.from("bons_commande_mp_imports").insert([
    {
      bc_ligne_id: bcLigneId,
      quantite_importee: quantiteImportee,
      n_doss_4d_import: parseOptionalText(formData, "n_doss_4d_import"),
      n_doss_erp_import: parseOptionalText(formData, "n_doss_erp_import"),
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}

// Modifie le dossier de commande pour TOUTES les lignes qui partagent le
// meme code.
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
