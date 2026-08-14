"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { STATUT_DOSSIER_MP_OPTIONS } from "../commande/constants";

type PendingBcLigne = {
  article: string;
  quantite: number;
};

// Cle de correspondance article: recalculee ici depuis nom_article des deux
// cotes (pas depuis la colonne article_normalise stockee, dont le format a
// diverge selon l'origine des donnees - import initial en masse vs saisie
// via ce formulaire) - sinon la resolution rate silencieusement pour la
// majorite des articles et la ligne BC finit avec article_id null.
function normalizeArticle(value: string) {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

async function fetchAllArticlesMp() {
  const rows: { id: number; nom_article: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data as { id: number; nom_article: string }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
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

async function requireDeleteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "commandeBcMp"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer les commandes.");
  }

  return currentUser;
}

function revalidateCommandeBcMpPages() {
  revalidatePath("/stock/matiere-premiere/bc");
  revalidatePath("/stock/matiere-premiere/commande");
  revalidatePath("/stock/matiere-premiere/stock");
  revalidatePath("/stock/matiere-premiere/alerte");
  revalidatePath("/mouvements/matiere-premiere");
  revalidatePath("/dashboard");
}

type ImportEvenementForCleanup = {
  bc_ligne_id: number;
  lot_stock_id: number | null;
};

// Une ligne de commande peut avoir ete receptionnee (Reception depuis le
// detail d'un dossier Import), ce qui a credite une ligne de stock reelle -
// a appeler avant de supprimer des lignes de commande, sinon ce stock reste
// credite alors que la commande qui l'a genere n'existe plus.
async function releaseStockForBcLignes(bcLigneIds: number[]) {
  if (bcLigneIds.length === 0) return;

  const { data: importRows } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("bc_ligne_id, lot_stock_id")
    .in("bc_ligne_id", bcLigneIds);

  const lotIds = ((importRows ?? []) as ImportEvenementForCleanup[])
    .map((row) => row.lot_stock_id)
    .filter((id): id is number => id !== null);

  if (lotIds.length > 0) {
    const { error } = await supabaseServer.from("lots_stock_matiere_premiere").delete().in("id", lotIds);
    if (error) throw new Error(error.message);
  }
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

  const articleRows = await fetchAllArticlesMp();

  const articleByNormalise = new Map(
    articleRows.map((row) => [
      normalizeArticle(row.nom_article),
      row,
    ])
  );

  const nDoss4d = parseOptionalText(formData, "n_doss_4d");
  const nDossErp = parseOptionalText(formData, "n_doss_erp");
  const dateJour = parseOptionalText(formData, "date_jour");
  // Le fournisseur d'un BC est presque toujours le meme pour tous ses
  // articles - un seul champ, rempli une fois, applique a chaque ligne
  // (meme principe que n_doss_4d/n_doss_erp ci-dessus).
  const fournisseur = parseOptionalText(formData, "fournisseur");

  const rowsToInsert = lignes
    .map((ligne) => {
      const articleName = String(ligne.article || "").trim();
      const quantite = Number(ligne.quantite);
      if (!articleName || !quantite || quantite <= 0) return null;

      const articleRow = articleByNormalise.get(normalizeArticle(articleName));

      return {
        article_id: articleRow?.id ?? null,
        article_label: articleRow?.nom_article ?? articleName,
        quantite,
        n_doss_4d: nDoss4d,
        n_doss_erp: nDossErp,
        fournisseur,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rowsToInsert.length === 0) {
    throw new Error("Aucun article valide a enregistrer.");
  }

  // Le calcul du prochain code BC (BC1, BC2...) et l'insertion se font
  // ensemble, dans une seule transaction verrouillee cote base - sinon deux
  // creations lancees a quelques millisecondes d'ecart peuvent toutes les
  // deux compter le meme nombre de BC existants et recevoir le meme code
  // (voir stock_bc_mp_create_batch). date_jour par defaut a aujourd'hui
  // cote SQL si non fournie.
  const { data, error } = await supabaseServer.rpc("stock_bc_mp_create_batch", {
    p_lignes: rowsToInsert,
    p_date_jour: dateJour,
  });

  if (error) {
    throw new Error(error.message);
  }

  const code = (data as { code: string }).code;

  revalidateCommandeBcMpPages();

  return { ok: true, code };
}

// Ajoute un article de plus a un BC deja existant - copie le dossier
// (n_doss_4d/n_doss_erp), le fournisseur et la date de la commande depuis
// une ligne existante du meme code, pour rester coherent avec le reste du
// BC sans redemander ces informations.
export async function addArticleToCommandeBcAction(formData: FormData) {
  await requireEditAccess();

  const code = String(formData.get("code") || "").trim();
  const articleName = String(formData.get("article") || "").trim();
  const quantite = Number(String(formData.get("quantite") || "").replace(",", "."));

  if (!code) {
    throw new Error("Commande invalide.");
  }

  if (!articleName || !quantite || quantite <= 0) {
    throw new Error("Choisis un article et une quantite valide.");
  }

  const { data: existingLigne, error: existingError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("n_doss_4d, n_doss_erp, fournisseur, date_jour")
    .eq("code", code)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError || !existingLigne) {
    throw new Error("Commande introuvable.");
  }

  const articleRows = await fetchAllArticlesMp();
  const articleByNormalise = new Map(articleRows.map((row) => [normalizeArticle(row.nom_article), row]));
  const articleRow = articleByNormalise.get(normalizeArticle(articleName));

  const { error } = await supabaseServer.from("bons_commande_matiere_premiere").insert([
    {
      code,
      article_id: articleRow?.id ?? null,
      article_label: articleRow?.nom_article ?? articleName,
      quantite,
      n_doss_4d: (existingLigne as { n_doss_4d: string | null }).n_doss_4d,
      n_doss_erp: (existingLigne as { n_doss_erp: string | null }).n_doss_erp,
      fournisseur: (existingLigne as { fournisseur: string | null }).fournisseur,
      date_jour: (existingLigne as { date_jour: string | null }).date_jour,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}

// Numero interne auto-genere par declaration d'import (IM.<annee>.<sequence>,
// remise a 1 chaque nouvelle annee) - distinct des Doss. 4D/ERP, references
// externes reelles toujours saisies a la main. Simple requete MAX+1 (pas de
// verrou dedie) : coherent avec le reste de cette fonctionnalite, usage
// interne a faible concurrence.
async function nextNumeroImport(): Promise<string> {
  const prefix = `IM.${new Date().getFullYear()}.`;

  const { data } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("numero_import")
    .like("numero_import", `${prefix}%`);

  let maxSeq = 0;
  for (const row of (data ?? []) as { numero_import: string | null }[]) {
    const seq = Number(row.numero_import?.slice(prefix.length));
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${maxSeq + 1}`;
}

// Enregistre un NOUVEL evenement d'import pour une ligne (pas d'ecrasement -
// un article commande en une fois peut arriver en plusieurs fois, chacune
// avec son propre dossier). Volontairement libre : peut depasser la
// quantite commandee, et reste utilisable meme apres que la ligne soit
// passee "Termine" (arrivage supplementaire, correction...).
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

  const nDoss4dImport = parseOptionalText(formData, "n_doss_4d_import");
  const nDossErpImport = parseOptionalText(formData, "n_doss_erp_import");
  const numeroImport = await nextNumeroImport();

  const { error } = await supabaseServer.from("bons_commande_mp_imports").insert([
    {
      bc_ligne_id: bcLigneId,
      quantite_importee: quantiteImportee,
      n_doss_4d_import: nDoss4dImport,
      n_doss_erp_import: nDossErpImport,
      numero_import: numeroImport,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  // 1ere declaration d'un dossier -> statut initial "Fabrication"
  // automatique, sur demande explicite (avant, Fabrication n'etait qu'un
  // repli d'affichage cote page - jamais persiste). N'ecrase jamais un
  // dossier deja suivi (ex: un 2eme article ajoute plus tard au meme
  // dossier, deja passe a "Depart" entre-temps).
  if (nDoss4dImport || nDossErpImport) {
    let dossierQuery = supabaseServer.from("dossiers_import_mp_statut").select("id");
    dossierQuery = nDoss4dImport
      ? dossierQuery.eq("n_doss_4d", nDoss4dImport)
      : dossierQuery.is("n_doss_4d", null);
    dossierQuery = nDossErpImport
      ? dossierQuery.eq("n_doss_erp", nDossErpImport)
      : dossierQuery.is("n_doss_erp", null);
    const { data: existingStatut } = await dossierQuery.maybeSingle();

    if (!existingStatut) {
      await supabaseServer.from("dossiers_import_mp_statut").insert([
        { n_doss_4d: nDoss4dImport, n_doss_erp: nDossErpImport, statut: STATUT_DOSSIER_MP_OPTIONS[0] },
      ]);
    }
  }

  revalidateCommandeBcMpPages();
}

// Change les dossiers 4D/ERP d'un evenement d'import deja enregistre (pas la
// quantite : pour corriger une quantite, supprimer puis recreer, ce qui
// remet correctement a jour le "reste" de la ligne). Le filtre
// lot_stock_id null protege un evenement issu d'une Reception (credite du
// stock reel) qui ne doit jamais passer par cette action legere.
export async function updateImportEvenementAction(formData: FormData) {
  await requireEditAccess();

  const importId = Number(String(formData.get("import_id") || "0"));

  if (!importId) {
    throw new Error("Evenement d'import invalide.");
  }

  const { error } = await supabaseServer
    .from("bons_commande_mp_imports")
    .update({
      n_doss_4d_import: parseOptionalText(formData, "n_doss_4d_import"),
      n_doss_erp_import: parseOptionalText(formData, "n_doss_erp_import"),
    })
    .eq("id", importId)
    .is("lot_stock_id", null);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}

// Modifie la quantite commandee et les dossiers 4D/ERP d'UNE ligne BC
// (contrairement a updateCommandeBcGroupAction, qui n'ecrit que le dossier
// et pour toutes les lignes du meme code).
export async function updateCommandeBcLigneAction(formData: FormData) {
  await requireEditAccess();

  const bcId = Number(String(formData.get("bc_id") || "0"));

  if (!bcId) {
    throw new Error("Ligne invalide.");
  }

  const quantiteRaw = String(formData.get("quantite") || "").trim().replace(",", ".");
  const quantite = quantiteRaw ? Number(quantiteRaw) : null;

  if (quantite === null || Number.isNaN(quantite) || quantite <= 0) {
    throw new Error("Quantite invalide.");
  }

  const { error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({
      quantite,
      n_doss_4d: parseOptionalText(formData, "n_doss_4d"),
      n_doss_erp: parseOptionalText(formData, "n_doss_erp"),
    })
    .eq("id", bcId);

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
  redirect("/stock/matiere-premiere/bc");
}

// Force le statut d'une ligne BC a "Termine" a la main, meme s'il reste une
// quantite a importer - independant du statut "Receptionne" pose par le
// cote Import (voir computeStatutBc : ce dernier n'influence plus le statut
// affiche ici, le statut de Commande MP ne depend plus que de la quantite
// importee ou de ce bouton).
export async function markCommandeBcLigneTermineAction(formData: FormData) {
  await requireEditAccess();

  const bcId = Number(String(formData.get("bc_id") || "0"));

  if (!bcId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({ statut: "Termine" })
    .eq("id", bcId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}

export async function deleteCommandeBcLigneAction(formData: FormData) {
  await requireDeleteAccess();

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

  await releaseStockForBcLignes([bcId]);

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

// Supprime tout un BC (toutes les lignes/articles qui partagent le meme
// code), avec le stock deja credite par une eventuelle reception.
export async function deleteCommandeBcGroupAction(formData: FormData) {
  await requireDeleteAccess();

  const code = String(formData.get("code") || "").trim();

  if (!code) {
    throw new Error("Commande invalide.");
  }

  const { data: lignes, error: fetchError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id")
    .eq("code", code);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const bcIds = ((lignes ?? []) as { id: number }[]).map((row) => row.id);

  await releaseStockForBcLignes(bcIds);

  const { error } = await supabaseServer.from("bons_commande_matiere_premiere").delete().eq("code", code);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeBcMpPages();
}
