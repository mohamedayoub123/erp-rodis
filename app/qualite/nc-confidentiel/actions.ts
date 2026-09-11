"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import type { AuditRow } from "../audit-table";

const TABLE = "qualite_nc_confidentiel";
const BUCKET = "qualite-audit-fichiers";

type AttachmentFile = { name: string; path: string };

// Aucune des 3 dates de realisation n'est jamais tapee a la main - le code
// les deduit du passage (ou non) de chaque statut a sa valeur "fait" :
// statut_correction -> REALISEE, statut_ac -> REALISEE, statut_cloture ->
// CLOTUREE (les 2 precedents combines). NC a 2 etapes distinctes
// (Correction, puis Action Corrective) avant la cloture globale, chacune
// merite sa propre date - demande explicite. Ignore toujours la valeur
// envoyee par le navigateur, recalcule cote serveur a partir de l'etat REEL
// avant/apres - la seule source de verite fiable (meme principe que
// utilisateur_test_labo/date_saisie_test_labo ailleurs dans l'app).
function estValeur(row: Record<string, string | number | null>, key: string, valeur: string): boolean {
  return String(row[key] ?? "").trim().toUpperCase() === valeur;
}

// Garde la date deja enregistree si le statut etait DEJA "fait" (ne
// re-tamponne pas a chaque save), remet a aujourd'hui si il vient tout
// juste de le devenir, efface si le statut est reparti en arriere
// (reouverture).
function calculerDateRealisation(
  nouveauFait: boolean,
  ancienFait: boolean,
  ancienneDate: string | null,
  todayIso: string
): string | null {
  if (!nouveauFait) return null;
  return ancienFait ? (ancienneDate ?? todayIso) : todayIso;
}

type AncienEtat = {
  id: number;
  statut_correction: string | null;
  statut_ac: string | null;
  statut_cloture: string | null;
  date_realisation_correction: string | null;
  date_realisation_ac: string | null;
  date_realisation: string | null;
};

export async function saveNcConfidentielBatchAction(
  rows: AuditRow[]
): Promise<{ ok: boolean; message?: string; insertedIds?: number[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier ce tableau." };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const toUpdate = rows.filter((r) => r.id !== null);
  // created_at reste gere par la base (colonne existante, jamais ecrasee
  // par une valeur re-soumise depuis l'affichage) - retire de tous les
  // objets avant ecriture, insertion comme mise a jour.
  const toInsert = rows.filter((r) => r.id === null).map(({ id, created_at, ...rest }) => rest);

  if (toUpdate.length > 0) {
    const ids = toUpdate.map((r) => r.id as number);
    const { data: existingRows } = await supabaseServer
      .from(TABLE)
      .select("id, statut_correction, statut_ac, statut_cloture, date_realisation_correction, date_realisation_ac, date_realisation")
      .in("id", ids);
    const existingById = new Map(((existingRows ?? []) as AncienEtat[]).map((r) => [r.id, r]));

    const payload = toUpdate.map((r) => {
      const { created_at, ...rest } = r;
      const ancien = existingById.get(r.id as number);

      const dateCorrection = calculerDateRealisation(
        estValeur(r, "statut_correction", "REALISEE"),
        ancien?.statut_correction?.trim().toUpperCase() === "REALISEE",
        ancien?.date_realisation_correction ?? null,
        todayIso
      );
      const dateAc = calculerDateRealisation(
        estValeur(r, "statut_ac", "REALISEE"),
        ancien?.statut_ac?.trim().toUpperCase() === "REALISEE",
        ancien?.date_realisation_ac ?? null,
        todayIso
      );
      const dateCloture = calculerDateRealisation(
        estValeur(r, "statut_cloture", "CLOTUREE"),
        ancien?.statut_cloture?.trim().toUpperCase() === "CLOTUREE",
        ancien?.date_realisation ?? null,
        todayIso
      );

      return {
        ...rest,
        date_realisation_correction: dateCorrection,
        date_realisation_ac: dateAc,
        date_realisation: dateCloture,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabaseServer.from(TABLE).upsert(payload, { onConflict: "id" });
    if (error) {
      return { ok: false, message: error.message };
    }
  }

  let insertedIds: number[] = [];
  if (toInsert.length > 0) {
    const payload = toInsert.map((r) => ({
      ...r,
      date_realisation_correction: estValeur(r, "statut_correction", "REALISEE") ? todayIso : null,
      date_realisation_ac: estValeur(r, "statut_ac", "REALISEE") ? todayIso : null,
      date_realisation: estValeur(r, "statut_cloture", "CLOTUREE") ? todayIso : null,
    }));
    const { data, error } = await supabaseServer.from(TABLE).insert(payload).select("id");
    if (error) {
      return { ok: false, message: error.message };
    }
    insertedIds = (data ?? []).map((row) => (row as { id: number }).id);
  }

  revalidatePath("/qualite/nc-confidentiel");
  return { ok: true, insertedIds };
}

export async function deleteNcConfidentielRowAction(id: number): Promise<void> {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "qualiteNcConfidentiel"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette ligne.");
  }

  // Retire aussi les fichiers du bucket avant de supprimer la ligne, sinon
  // ils restent orphelins (jamais nettoyes, jamais revisibles nulle part).
  const { data: existing } = await supabaseServer.from(TABLE).select("pieces_jointes").eq("id", id).maybeSingle();
  const files = ((existing as { pieces_jointes: AttachmentFile[] } | null)?.pieces_jointes ?? []) as AttachmentFile[];
  if (files.length > 0) {
    await supabaseServer.storage.from(BUCKET).remove(files.map((f) => f.path));
  }

  const { error } = await supabaseServer.from(TABLE).delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/nc-confidentiel");
}

// Nom de fichier assaini pour le chemin Storage (garde l'original pour
// l'affichage) - evite tout caractere qui casserait l'URL/le chemin objet.
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// Cree juste un "emplacement" d'envoi signe (aucun octet de fichier ne
// transite par cette action) - le navigateur envoie ensuite le fichier
// DIRECTEMENT a Supabase Storage avec ce lien (voir confirmNcConfidentielUploadAction
// pour la suite). Necessaire pour les gros fichiers (video...) : les
// Server Actions passent par les fonctions serveur Vercel, plafonnees a
// 4.5 Mo par requete quel que soit le "bodySizeLimit" de Next.js - au-dela,
// la requete echoue avant meme d'atteindre notre code, ce qui ressemblait
// a "erreur" sans message clair pour l'utilisateur.
export async function createNcConfidentielUploadSlotAction(
  rowId: number,
  fileName: string
): Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!rowId) {
    return { ok: false, message: "Ligne invalide." };
  }

  const path = `nc-confidentiel/${rowId}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, message: error?.message || "Impossible de preparer l'envoi." };
  }

  return { ok: true, path, signedUrl: data.signedUrl };
}

// Enregistre les fichiers deja envoyes (par le navigateur, directement a
// Storage via le lien signe ci-dessus) dans la colonne pieces_jointes.
export async function confirmNcConfidentielUploadAction(
  rowId: number,
  files: AttachmentFile[]
): Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!rowId || files.length === 0) {
    return { ok: false, message: "Rien a enregistrer." };
  }

  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("pieces_jointes")
    .eq("id", rowId)
    .maybeSingle();
  const currentFiles = ((existing as { pieces_jointes: AttachmentFile[] } | null)?.pieces_jointes ?? []) as AttachmentFile[];
  const nextFiles = [...currentFiles, ...files];

  const { error: updateError } = await supabaseServer
    .from(TABLE)
    .update({ pieces_jointes: nextFiles, updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/qualite/nc-confidentiel");
  return { ok: true, files };
}

export async function getNcConfidentielFileUrlAction(
  path: string
): Promise<{ ok: boolean; url?: string; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canViewPageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas voir ce fichier." };
  }

  const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) {
    return { ok: false, message: error?.message || "Fichier introuvable." };
  }

  return { ok: true, url: data.signedUrl };
}

export async function deleteNcConfidentielFileAction(
  rowId: number,
  path: string
): Promise<{ ok: boolean; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas supprimer ce fichier." };
  }

  const { error: removeError } = await supabaseServer.storage.from(BUCKET).remove([path]);
  if (removeError) {
    return { ok: false, message: removeError.message };
  }

  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("pieces_jointes")
    .eq("id", rowId)
    .maybeSingle();
  const currentFiles = ((existing as { pieces_jointes: AttachmentFile[] } | null)?.pieces_jointes ?? []) as AttachmentFile[];
  const nextFiles = currentFiles.filter((f) => f.path !== path);

  const { error: updateError } = await supabaseServer
    .from(TABLE)
    .update({ pieces_jointes: nextFiles, updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/qualite/nc-confidentiel");
  return { ok: true };
}
