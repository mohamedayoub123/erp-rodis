"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import type { AuditRow } from "../audit-table";

const TABLE = "qualite_nc_confidentiel";
const BUCKET = "qualite-audit-fichiers";

type AttachmentFile = { name: string; path: string };

export async function saveNcConfidentielBatchAction(
  rows: AuditRow[]
): Promise<{ ok: boolean; message?: string; insertedIds?: number[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier ce tableau." };
  }

  const toUpdate = rows.filter((r) => r.id !== null);
  const toInsert = rows.filter((r) => r.id === null).map(({ id, ...rest }) => rest);

  if (toUpdate.length > 0) {
    const { error } = await supabaseServer
      .from(TABLE)
      .upsert(
        toUpdate.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
        { onConflict: "id" }
      );
    if (error) {
      return { ok: false, message: error.message };
    }
  }

  let insertedIds: number[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabaseServer.from(TABLE).insert(toInsert).select("id");
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

export async function uploadNcConfidentielFilesAction(
  rowId: number,
  formData: FormData
): Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!rowId) {
    return { ok: false, message: "Ligne invalide." };
  }

  const incoming = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (incoming.length === 0) {
    return { ok: false, message: "Aucun fichier choisi." };
  }

  const uploaded: AttachmentFile[] = [];
  for (const file of incoming) {
    const path = `nc-confidentiel/${rowId}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabaseServer.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type || undefined, upsert: false });
    if (error) {
      return { ok: false, message: error.message };
    }
    uploaded.push({ name: file.name, path });
  }

  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("pieces_jointes")
    .eq("id", rowId)
    .maybeSingle();
  const currentFiles = ((existing as { pieces_jointes: AttachmentFile[] } | null)?.pieces_jointes ?? []) as AttachmentFile[];
  const nextFiles = [...currentFiles, ...uploaded];

  const { error: updateError } = await supabaseServer
    .from(TABLE)
    .update({ pieces_jointes: nextFiles, updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/qualite/nc-confidentiel");
  return { ok: true, files: uploaded };
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
