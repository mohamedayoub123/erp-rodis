"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { STATUT_DOSSIER_MP_OPTIONS } from "./constants";

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

// Meme cle de correspondance que bc/actions.ts (recalculee depuis
// nom_article, pas depuis la colonne article_normalise stockee dont le
// format a diverge selon l'origine des donnees) - utilisee ici pour
// re-resoudre a la volee les lignes de commande dont l'article_id est reste
// null (ancien bug de correspondance sur la creation de commande).
function normalizeArticle(value: string) {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

async function requireEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandeMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les imports.");
  }

  return currentUser;
}

function revalidateCommandeMpPages() {
  revalidatePath("/stock/matiere-premiere/bc");
  revalidatePath("/stock/matiere-premiere/commande");
  revalidatePath("/stock/matiere-premiere/stock");
  revalidatePath("/stock/matiere-premiere/alerte");
  revalidatePath("/mouvements/matiere-premiere");
  revalidatePath("/dashboard");
}

// Enregistre une reception (numero de lot, dates, quantite) pour une ligne
// de commande, depuis le detail d'un dossier Import. Contrairement a
// "Creer import" (bc/actions.ts), la quantite receptionnee peut etre plus
// petite OU plus grande que la quantite commandee - des qu'on receptionne,
// la ligne passe au statut "Receptionne" (vert), quel que soit l'ecart. La
// quantite receptionnee entre aussi reellement dans le stock MP (meme table
// lots_stock_matiere_premiere que les entrees classiques), sinon le Stock MP
// et le Stock Alert MP ne bougeraient jamais suite a une reception.
export async function createReceptionMpAction(formData: FormData) {
  const currentUser = await requireEditAccess();

  const bcLigneId = Number(String(formData.get("bc_ligne_id") || "0"));
  const quantiteRaw = String(formData.get("quantite_importee") || "").trim().replace(",", ".");
  const quantiteImportee = quantiteRaw ? Number(quantiteRaw) : null;
  const numeroLot = parseOptionalText(formData, "numero_lot");
  const dateFabrication = parseOptionalText(formData, "date_fabrication");
  const dateExpiration = parseOptionalText(formData, "date_expiration");
  const nDoss4dImport = parseOptionalText(formData, "n_doss_4d_import");
  const nDossErpImport = parseOptionalText(formData, "n_doss_erp_import");

  if (!bcLigneId || quantiteImportee === null || Number.isNaN(quantiteImportee) || quantiteImportee <= 0) {
    throw new Error("Quantite receptionnee invalide.");
  }

  if (!numeroLot) {
    throw new Error("Le numero de lot est obligatoire pour receptionner.");
  }

  const { data: ligneRow, error: ligneError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id, article_id, article_label")
    .eq("id", bcLigneId)
    .maybeSingle();

  if (ligneError || !ligneRow) {
    throw new Error("Ligne de commande introuvable.");
  }

  const ligne = ligneRow as { article_id: number | null; article_label: string | null };
  let articleId = ligne.article_id;

  // Certaines lignes de commande plus anciennes ont un article_id reste
  // null (bug de correspondance corrige depuis sur la creation de
  // commande) - on retente ici la resolution par nom avant d'abandonner,
  // pour ne pas bloquer la reception d'une commande deja existante.
  if (!articleId && ligne.article_label) {
    const target = normalizeArticle(ligne.article_label);
    const { data: allArticles } = await supabaseServer.from("articles_matiere_premiere").select("id, nom_article");
    const found = ((allArticles ?? []) as { id: number; nom_article: string }[]).find(
      (article) => normalizeArticle(article.nom_article) === target
    );

    if (found) {
      articleId = found.id;
      await supabaseServer
        .from("bons_commande_matiere_premiere")
        .update({ article_id: articleId })
        .eq("id", bcLigneId);
    }
  }

  if (!articleId) {
    throw new Error(
      "Cet article n'est pas reconnu dans Articles Matiere Premiere - impossible de l'ajouter au stock. Verifie l'orthographe de l'article sur la commande."
    );
  }

  const { data: articleRow } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("unite")
    .eq("id", articleId)
    .maybeSingle();

  const unite = (articleRow as { unite: string | null } | null)?.unite ?? null;

  const fournisseur = parseOptionalText(formData, "fournisseur");

  const { data: importRow, error: insertImportError } = await supabaseServer
    .from("bons_commande_mp_imports")
    .insert([
      {
        bc_ligne_id: bcLigneId,
        quantite_importee: quantiteImportee,
        n_doss_4d_import: nDoss4dImport,
        n_doss_erp_import: nDossErpImport,
        numero_lot: numeroLot,
        date_fabrication: dateFabrication,
        date_expiration: dateExpiration,
      },
    ])
    .select("id")
    .single();

  if (insertImportError) {
    throw new Error(insertImportError.message);
  }

  const importId = (importRow as { id: number }).id;
  const today = new Date().toISOString().slice(0, 10);

  const { data: lotRow, error: insertLotError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .insert([
      {
        article_id: articleId,
        date_jour: today,
        date_reception: today,
        numero_lot: numeroLot,
        code_normalise: numeroLot.toUpperCase(),
        date_fabrication: dateFabrication,
        date_expiration: dateExpiration,
        qte_entree: quantiteImportee,
        qte_sortie: 0,
        unite,
        fournisseur,
        n_doss_erp: nDossErpImport,
        n_doss_4d: nDoss4dImport,
        utilisateur: currentUser,
        // Tag distinct de l'entree manuelle ("web:entree-mp") pour pouvoir
        // afficher la provenance (Manuel / Import) sur Mouvements MP - reste
        // compte comme une entree TE (voir ENTREE_SOURCES dans shared.ts).
        source_import: "web:reception-mp",
      },
    ])
    .select("id")
    .single();

  if (insertLotError) {
    throw new Error(insertLotError.message);
  }

  const lotId = (lotRow as { id: number }).id;

  const { error: groupError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .update({ mouvement_groupe_id: lotId })
    .eq("id", lotId);

  if (groupError) {
    throw new Error(groupError.message);
  }

  // Relie l'evenement d'import a la ligne de stock qu'il a creee, pour
  // pouvoir retirer proprement le stock si cet import (ou tout le dossier,
  // ou la ligne de commande) est supprime plus tard.
  const { error: linkError } = await supabaseServer
    .from("bons_commande_mp_imports")
    .update({ lot_stock_id: lotId })
    .eq("id", importId);

  if (linkError) {
    throw new Error(linkError.message);
  }

  const { error: updateError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({ statut: "Receptionne" })
    .eq("id", bcLigneId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateCommandeMpPages();
}

type ImportEvenementForCleanup = {
  id: number;
  bc_ligne_id: number;
  lot_stock_id: number | null;
};

// Supprime le stock credite par des evenements d'import (ceux issus d'une
// Reception) et remet leurs lignes de commande a "Stand" - a appeler AVANT
// de supprimer les evenements/lignes eux-memes, sinon le stock reste
// credite alors que la reception qui l'a cree n'existe plus.
async function releaseStockForImportEvenements(rows: ImportEvenementForCleanup[]) {
  const lotIds = rows.map((row) => row.lot_stock_id).filter((id): id is number => id !== null);
  const ligneIds = [...new Set(rows.filter((row) => row.lot_stock_id !== null).map((row) => row.bc_ligne_id))];

  if (lotIds.length > 0) {
    const { error } = await supabaseServer.from("lots_stock_matiere_premiere").delete().in("id", lotIds);
    if (error) throw new Error(error.message);
  }

  if (ligneIds.length > 0) {
    const { error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .update({ statut: "Stand" })
      .in("id", ligneIds)
      .eq("statut", "Receptionne");
    if (error) throw new Error(error.message);
  }
}

// Supprime un seul evenement d'import (une ligne de "Historique des
// imports") - si c'etait une Reception, retire aussi le stock credite et
// remet la ligne de commande a "Stand".
export async function deleteImportEvenementAction(formData: FormData) {
  await requireEditAccess();

  const importId = Number(String(formData.get("import_id") || "0"));

  if (!importId) {
    throw new Error("Import invalide.");
  }

  const { data: importRow, error: fetchError } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("id, bc_ligne_id, lot_stock_id")
    .eq("id", importId)
    .maybeSingle();

  if (fetchError || !importRow) {
    throw new Error("Import introuvable.");
  }

  await releaseStockForImportEvenements([importRow as ImportEvenementForCleanup]);

  const { error } = await supabaseServer.from("bons_commande_mp_imports").delete().eq("id", importId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeMpPages();
}

// Supprime tout un dossier Import (tous les evenements qui partagent le
// meme doss. 4D/ERP), le stock credite par ses receptions, et son suivi de
// statut - pour effacer un dossier cree par erreur.
export async function deleteDossierImportsAction(formData: FormData) {
  await requireEditAccess();

  const nDoss4d = parseOptionalText(formData, "n_doss_4d");
  const nDossErp = parseOptionalText(formData, "n_doss_erp");

  let query = supabaseServer.from("bons_commande_mp_imports").select("id, bc_ligne_id, lot_stock_id");
  query = nDoss4d ? query.eq("n_doss_4d_import", nDoss4d) : query.is("n_doss_4d_import", null);
  query = nDossErp ? query.eq("n_doss_erp_import", nDossErp) : query.is("n_doss_erp_import", null);
  const { data: importRows, error: fetchError } = await query;

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = (importRows ?? []) as ImportEvenementForCleanup[];
  await releaseStockForImportEvenements(rows);

  if (rows.length > 0) {
    const { error } = await supabaseServer
      .from("bons_commande_mp_imports")
      .delete()
      .in("id", rows.map((row) => row.id));

    if (error) {
      throw new Error(error.message);
    }
  }

  let statutQuery = supabaseServer.from("dossiers_import_mp_statut").delete();
  statutQuery = nDoss4d ? statutQuery.eq("n_doss_4d", nDoss4d) : statutQuery.is("n_doss_4d", null);
  statutQuery = nDossErp ? statutQuery.eq("n_doss_erp", nDossErp) : statutQuery.is("n_doss_erp", null);
  await statutQuery;

  revalidateCommandeMpPages();
}

// Supprime une ligne de commande depuis le detail d'un dossier Import -
// meme effet que le bouton Supprimer sur le detail d'un BC (bc/actions.ts),
// mais accessible ici et verifie contre la permission "commandeMp" de cette
// page plutot que "commandeBcMp". Retire aussi le stock credite par une
// eventuelle reception avant de supprimer la ligne (dont la suppression
// cascade sur ses evenements d'import cote base).
export async function deleteBcLigneFromDossierAction(formData: FormData) {
  await requireEditAccess();

  const bcId = Number(String(formData.get("bc_id") || "0"));

  if (!bcId) {
    throw new Error("Ligne invalide.");
  }

  const { data: importRows } = await supabaseServer
    .from("bons_commande_mp_imports")
    .select("id, bc_ligne_id, lot_stock_id")
    .eq("bc_ligne_id", bcId);

  await releaseStockForImportEvenements((importRows ?? []) as ImportEvenementForCleanup[]);

  const { error } = await supabaseServer.from("bons_commande_matiere_premiere").delete().eq("id", bcId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateCommandeMpPages();
}

// Statut de suivi manuel d'un dossier Import (Fabrication -> Import ->
// Receptionne au port -> Receptionne Rodis) + date prevue de reception
// (saisie manuelle). Un dossier n'a pas de table propre - identifie par la
// paire (n_doss_4d, n_doss_erp), comme partout ailleurs dans cette
// fonctionnalite.
export async function updateDossierMpStatutAction(formData: FormData) {
  await requireEditAccess();

  const nDoss4d = parseOptionalText(formData, "n_doss_4d");
  const nDossErp = parseOptionalText(formData, "n_doss_erp");
  const statut = String(formData.get("statut") || "").trim();
  const datePrevueReception = parseOptionalText(formData, "date_prevue_reception");

  if (!(STATUT_DOSSIER_MP_OPTIONS as readonly string[]).includes(statut)) {
    throw new Error("Statut invalide.");
  }

  let query = supabaseServer.from("dossiers_import_mp_statut").select("id");
  query = nDoss4d ? query.eq("n_doss_4d", nDoss4d) : query.is("n_doss_4d", null);
  query = nDossErp ? query.eq("n_doss_erp", nDossErp) : query.is("n_doss_erp", null);
  const { data: existing } = await query.maybeSingle();

  if (existing) {
    const { error } = await supabaseServer
      .from("dossiers_import_mp_statut")
      .update({ statut, date_prevue_reception: datePrevueReception, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: number }).id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseServer
      .from("dossiers_import_mp_statut")
      .insert([{ n_doss_4d: nDoss4d, n_doss_erp: nDossErp, statut, date_prevue_reception: datePrevueReception }]);

    if (error) throw new Error(error.message);
  }

  revalidateCommandeMpPages();
}
