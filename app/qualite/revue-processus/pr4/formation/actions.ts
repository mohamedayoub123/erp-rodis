"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { MOIS_FIELD_KEYS, type AttachmentFile } from "./fields";

const TABLE = "pr4_formation_plan";
const BUCKET = "qualite-audit-fichiers";

export async function saveFormationRowAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "qualiteRevueProcessus"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le plan de formation.");
  }

  const id = Number(String(formData.get("id") || "0")) || null;
  const annee = Number(String(formData.get("annee") || "0"));
  const categorie = String(formData.get("categorie") || "").trim() || null;
  const formation = String(formData.get("formation") || "").trim();
  const ordre = Number(String(formData.get("ordre") || "0")) || 0;
  const estBilan = formData.get("est_bilan") === "on";

  if (!annee || !formation) {
    throw new Error("Annee et formation sont obligatoires.");
  }

  const payload: Record<string, unknown> = {
    annee,
    categorie,
    formation,
    ordre,
    est_bilan: estBilan,
    updated_at: new Date().toISOString(),
  };
  for (const { planifieKey, dateKey } of MOIS_FIELD_KEYS) {
    payload[planifieKey] = formData.get(planifieKey) === "on";
    payload[dateKey] = String(formData.get(dateKey) || "").trim() || null;
  }

  const { error } = id
    ? await supabaseServer.from(TABLE).update(payload).eq("id", id)
    : await supabaseServer.from(TABLE).insert(payload);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/revue-processus/pr4/formation");
}

// Ecrit directement la date d'un mois depuis le tableau (sans passer par le
// formulaire complet) - la date fait office d'indicateur "realise" : ecrire
// une date = c'est fait (vert), mois passe sans date = rate (rouge), mois
// pas encore passe sans date = en attente (jaune).
export async function updateFormationDateAction(
  rowId: number,
  mois: number,
  date: string
): Promise<{ ok: boolean; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteRevueProcessus"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier le plan de formation." };
  }
  if (!rowId || mois < 1 || mois > 12) {
    return { ok: false, message: "Ligne invalide." };
  }

  const trimmed = date.trim();
  const payload: Record<string, unknown> = {
    [`m${mois}_date`]: trimmed || null,
    updated_at: new Date().toISOString(),
  };
  // Ecrire une date marque automatiquement le mois "planifie" (sinon rien
  // n'affiche la date tapee) - effacer la date ne re-decoche pas planifie,
  // pour ne pas retirer un mois du plan par erreur en corrigeant juste une
  // date.
  if (trimmed) payload[`m${mois}_planifie`] = true;

  const { error } = await supabaseServer.from(TABLE).update(payload).eq("id", rowId);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/qualite/revue-processus/pr4/formation");
  return { ok: true };
}

export async function deleteFormationRowAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "qualiteRevueProcessus"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer une ligne du plan de formation.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!id) {
    throw new Error("Ligne invalide.");
  }

  // Retire aussi tous les fichiers attaches (tous mois confondus) avant de
  // supprimer la ligne, sinon ils restent orphelins dans le bucket.
  const { data: existing } = await supabaseServer.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (existing) {
    const allPaths: string[] = [];
    for (const { piecesJointesKey } of MOIS_FIELD_KEYS) {
      const files = (existing as Record<string, unknown>)[piecesJointesKey as string] as AttachmentFile[] | null;
      if (Array.isArray(files)) allPaths.push(...files.map((f) => f.path));
    }
    if (allPaths.length > 0) {
      await supabaseServer.storage.from(BUCKET).remove(allPaths);
    }
  }

  const { error } = await supabaseServer.from(TABLE).delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/revue-processus/pr4/formation");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

function piecesJointesKeyFor(mois: number) {
  return `m${mois}_pieces_jointes`;
}

// Meme mecanique en 2 temps que NC/TAF Confidentiel (lien signe -> upload
// direct navigateur -> Storage, puis confirmation cote base) - necessaire
// pour les gros fichiers/dossiers entiers, les Server Actions sont
// plafonnees a 4.5 Mo par requete quel que soit "bodySizeLimit".
export async function createFormationUploadSlotAction(
  rowId: number,
  mois: number,
  fileName: string
): Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteRevueProcessus"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!rowId || mois < 1 || mois > 12) {
    return { ok: false, message: "Ligne invalide." };
  }

  const path = `formation/${rowId}/m${mois}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, message: error?.message || "Impossible de preparer l'envoi." };
  }

  return { ok: true, path, signedUrl: data.signedUrl };
}

export async function confirmFormationUploadAction(
  rowId: number,
  mois: number,
  files: AttachmentFile[]
): Promise<{ ok: boolean; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteRevueProcessus"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!rowId || files.length === 0) {
    return { ok: false, message: "Rien a enregistrer." };
  }

  const key = piecesJointesKeyFor(mois);
  const { data: existing } = await supabaseServer.from(TABLE).select(key).eq("id", rowId).maybeSingle();
  const currentFiles = ((existing as Record<string, unknown> | null)?.[key] ?? []) as AttachmentFile[];
  const nextFiles = [...currentFiles, ...files];

  const { error } = await supabaseServer
    .from(TABLE)
    .update({ [key]: nextFiles, updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/qualite/revue-processus/pr4/formation");
  return { ok: true };
}

export async function getFormationFileUrlAction(
  path: string
): Promise<{ ok: boolean; url?: string; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canViewPageUser(currentUser, "qualiteRevueProcessus"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas voir ce fichier." };
  }

  const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) {
    return { ok: false, message: error?.message || "Fichier introuvable." };
  }

  return { ok: true, url: data.signedUrl };
}

export async function deleteFormationFileAction(
  rowId: number,
  mois: number,
  path: string
): Promise<{ ok: boolean; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteRevueProcessus"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas supprimer ce fichier." };
  }

  const { error: removeError } = await supabaseServer.storage.from(BUCKET).remove([path]);
  if (removeError) {
    return { ok: false, message: removeError.message };
  }

  const key = piecesJointesKeyFor(mois);
  const { data: existing } = await supabaseServer.from(TABLE).select(key).eq("id", rowId).maybeSingle();
  const currentFiles = ((existing as Record<string, unknown> | null)?.[key] ?? []) as AttachmentFile[];
  const nextFiles = currentFiles.filter((f) => f.path !== path);

  const { error: updateError } = await supabaseServer
    .from(TABLE)
    .update({ [key]: nextFiles, updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/qualite/revue-processus/pr4/formation");
  return { ok: true };
}
