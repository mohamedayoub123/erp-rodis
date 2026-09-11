"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import type { AuditRow } from "../audit-table";

const TABLE = "qualite_taf_confidentiel";
const BUCKET = "qualite-audit-fichiers";

type AttachmentFile = { name: string; path: string };

function parseOptionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

// "date_realisation" n'est jamais tapee a la main - le code la deduit du
// passage (ou non) de statut a CLOTUREE, meme principe que
// utilisateur_test_labo/date_saisie_test_labo ailleurs dans l'app. Ignore
// toujours la valeur envoyee par le navigateur, recalcule cote serveur a
// partir de l'etat REEL avant/apres - la seule source de verite fiable.
function estCloturee(row: Record<string, string | number | null>): boolean {
  return String(row.statut ?? "").trim().toUpperCase() === "CLOTUREE";
}

export async function saveTafConfidentielBatchAction(
  rows: AuditRow[]
): Promise<{ ok: boolean; message?: string; insertedIds?: number[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
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
      .select("id, statut, date_realisation")
      .in("id", ids);
    const existingById = new Map(
      ((existingRows ?? []) as { id: number; statut: string | null; date_realisation: string | null }[]).map((r) => [
        r.id,
        r,
      ])
    );

    const payload = toUpdate.map((r) => {
      const { created_at, ...rest } = r;
      const ancien = existingById.get(r.id as number);
      const nouveauCloture = estCloturee(r);
      const ancienCloture = ancien?.statut?.trim().toUpperCase() === "CLOTUREE";
      const dateRealisation = nouveauCloture
        ? ancienCloture
          ? (ancien?.date_realisation ?? todayIso)
          : todayIso
        : null;
      return { ...rest, date_realisation: dateRealisation, updated_at: new Date().toISOString() };
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
      date_realisation: estCloturee(r) ? todayIso : null,
    }));
    const { data, error } = await supabaseServer.from(TABLE).insert(payload).select("id");
    if (error) {
      return { ok: false, message: error.message };
    }
    insertedIds = (data ?? []).map((row) => (row as { id: number }).id);
  }

  revalidatePath("/qualite/taf-confidentiel");
  return { ok: true, insertedIds };
}

// Champs de suivi (Qui, Delais, Commentaire, T1-T4) modifies depuis la page
// dediee /qualite/taf-confidentiel/[id] - saisie plus confortable en
// formulaire vertical plein ecran que dans les cellules etroites du tableau
// (demande explicite), en plus de l'edition en ligne qui reste disponible.
// Ne touche jamais a statut/date_realisation (geres par
// saveTafConfidentielBatchAction ci-dessus), seulement ces 7 champs.
const DETAIL_FIELD_KEYS = ["qui", "delais", "commentaire", "t1", "t2", "t3", "t4"] as const;

export async function updateTafConfidentielDetailAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
    throw new Error("Cet utilisateur ne peut pas modifier ce TAF.");
  }

  const id = Number(formData.get("id"));
  if (!id) {
    throw new Error("TAF invalide.");
  }

  const payload: Record<string, string | null> = {};
  for (const key of DETAIL_FIELD_KEYS) {
    payload[key] = parseOptionalText(formData, key);
  }

  const { error } = await supabaseServer
    .from(TABLE)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/taf-confidentiel");
  revalidatePath(`/qualite/taf-confidentiel/${id}`);
  redirect("/qualite/taf-confidentiel");
}

export async function deleteTafConfidentielRowAction(id: number): Promise<void> {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "qualiteTafConfidentiel"))) {
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

  revalidatePath("/qualite/taf-confidentiel");
}

// Nom de fichier assaini pour le chemin Storage (garde l'original pour
// l'affichage) - evite tout caractere qui casserait l'URL/le chemin objet.
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// Cree un emplacement d'envoi signe - le navigateur envoie ensuite le
// fichier DIRECTEMENT a Supabase Storage (voir confirmTafConfidentielUploadAction),
// sans passer par cette Server Action ni par la limite de 4.5 Mo des
// fonctions serveur Vercel.
export async function createTafConfidentielUploadSlotAction(
  rowId: number,
  fileName: string
): Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!rowId) {
    return { ok: false, message: "Ligne invalide." };
  }

  const path = `taf-confidentiel/${rowId}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, message: error?.message || "Impossible de preparer l'envoi." };
  }

  return { ok: true, path, signedUrl: data.signedUrl };
}

export async function confirmTafConfidentielUploadAction(
  rowId: number,
  files: AttachmentFile[]
): Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
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

  revalidatePath("/qualite/taf-confidentiel");
  return { ok: true, files };
}

export async function getTafConfidentielFileUrlAction(
  path: string
): Promise<{ ok: boolean; url?: string; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canViewPageUser(currentUser, "qualiteTafConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas voir ce fichier." };
  }

  const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) {
    return { ok: false, message: error?.message || "Fichier introuvable." };
  }

  return { ok: true, url: data.signedUrl };
}

export async function deleteTafConfidentielFileAction(
  rowId: number,
  path: string
): Promise<{ ok: boolean; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
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

  revalidatePath("/qualite/taf-confidentiel");
  return { ok: true };
}
