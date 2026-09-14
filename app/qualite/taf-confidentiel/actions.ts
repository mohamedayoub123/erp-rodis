"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import type { AuditRow } from "../audit-table";

const TABLE = "qualite_taf_confidentiel";
const BUCKET = "qualite-audit-fichiers";

type AttachmentFile = { name: string; path: string };

export type CorrectionEntry = { id: string; texte: string; date: string; fichiers: AttachmentFile[] };

function parseOptionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

const T1_T4_KEYS = ["t1", "t2", "t3", "t4"] as const;

function t1t4Total(row: Record<string, string | number | null>): number {
  return T1_T4_KEYS.reduce((sum, key) => {
    const n = parseFloat(String(row[key] ?? "").replace(",", "."));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

// Statut n'est plus tape a la main nulle part (tableau ni page detail) -
// meme demande/logique que NC Confidentiel (Statut correction/Statut AC,
// voir nc-confidentiel/actions.ts), deduit de l'etat REEL de T1-T4 ET de la
// colonne Correction (liste d'entrees + fichiers, meme principe que NC) -
// demande explicite : "le statut ca va agir avec lui [Correction]". Les DEUX
// doivent etre complets pour CLOTUREE (T1-T4 a 100% ET Correction avec au
// moins une entree, toutes avec un fichier joint) - meme logique que
// statut_cloture sur NC (REALISEE sur Correction ET sur Action Corrective).
// Un progres sur l'un des deux (mais pas les deux completes) -> "EN COURS".
// Aucun progres nulle part -> "PAS D'ACTION" (jamais vide).
function computeStatutTaf(
  row: Record<string, string | number | null>,
  correctionEntries: CorrectionEntry[]
): string {
  const total = t1t4Total(row);
  const t1t4Complete = total >= 0.999;
  const correctionComplete =
    correctionEntries.length > 0 && correctionEntries.every((entry) => entry.fichiers.length > 0);

  if (t1t4Complete && correctionComplete) return "CLOTUREE";
  if (total > 0 || correctionEntries.length > 0) return "EN COURS";
  return "PAS D'ACTION";
}

// "date_realisation" n'est jamais tapee a la main - le code la deduit du
// passage (ou non) de statut a CLOTUREE, meme principe que
// utilisateur_test_labo/date_saisie_test_labo ailleurs dans l'app. Ignore
// toujours la valeur envoyee par le navigateur, recalcule cote serveur a
// partir de l'etat REEL avant/apres - la seule source de verite fiable.
// Garde la date deja enregistree si le statut etait DEJA "cloturee" (ne
// re-tamponne pas a chaque save), remet a aujourd'hui si il vient tout
// juste de le devenir, efface si le statut est reparti en arriere
// (reouverture) - meme principe que calculerDateRealisation dans
// nc-confidentiel/actions.ts.
function calculerDateRealisation(
  nouveauCloture: boolean,
  ancienCloture: boolean,
  ancienneDate: string | null,
  todayIso: string
): string | null {
  if (!nouveauCloture) return null;
  return ancienCloture ? (ancienneDate ?? todayIso) : todayIso;
}

// Tx de progression n'est plus tape a la main non plus - meme raison que
// Statut : deduit directement de T1-T4 (leur somme), jamais une valeur
// separee qui pourrait se desynchroniser de l'etat reel. Reste base sur
// T1-T4 seul (pas Correction) - c'est Statut qui combine les deux.
function computeTxProgression(row: Record<string, string | number | null>): string {
  const pct = Math.round(Math.min(1, Math.max(0, t1t4Total(row))) * 100);
  return `${pct}%`;
}

// Champs de creation initiale (Audit, Constat, Processus/Service concerne,
// Norme/Chapitre) sur une page dediee plutot qu'une ligne vide ajoutee
// directement dans le tableau - demande explicite, meme principe que
// /qualite/nc-confidentiel/nouvelle. Qui/Delais/Commentaire/T1-T4 restent
// remplis ensuite depuis la page detail (voir updateTafConfidentielDetailAction).
export async function createTafConfidentielAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter de TAF.");
  }

  const { error } = await supabaseServer.from(TABLE).insert({
    audit: parseOptionalText(formData, "audit"),
    constat: parseOptionalText(formData, "constat"),
    processus_concerne: parseOptionalText(formData, "processus_concerne"),
    service_concerne: parseOptionalText(formData, "service_concerne"),
    norme_concernee: parseOptionalText(formData, "norme_concernee"),
    chapitre: parseOptionalText(formData, "chapitre"),
    sous_chapitre: parseOptionalText(formData, "sous_chapitre"),
    sous_sous_chapitre: parseOptionalText(formData, "sous_sous_chapitre"),
    // Sans T1-T4, computeStatutDepuisT1T4/computeTxProgression valent
    // "PAS D'ACTION"/"0%" - pose directement ces valeurs a la creation
    // plutot que de laisser statut/tx_progression a null jusqu'a la
    // premiere sauvegarde depuis la page detail.
    statut: "PAS D'ACTION",
    tx_progression: "0%",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/taf-confidentiel");
  redirect("/qualite/taf-confidentiel");
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
      .select("id, statut, date_realisation, correction_entries")
      .in("id", ids);
    const existingById = new Map(
      (
        (existingRows ?? []) as {
          id: number;
          statut: string | null;
          date_realisation: string | null;
          correction_entries: CorrectionEntry[] | null;
        }[]
      ).map((r) => [r.id, r])
    );

    const payload = toUpdate.map((r) => {
      const { created_at, ...rest } = r;
      const ancien = existingById.get(r.id as number);
      const correctionEntries = ancien?.correction_entries ?? [];
      const statut = computeStatutTaf(r, correctionEntries);
      const nouveauCloture = statut === "CLOTUREE";
      const ancienCloture = ancien?.statut?.trim().toUpperCase() === "CLOTUREE";
      const dateRealisation = calculerDateRealisation(
        nouveauCloture,
        ancienCloture,
        ancien?.date_realisation ?? null,
        todayIso
      );
      return {
        ...rest,
        statut,
        tx_progression: computeTxProgression(r),
        date_realisation: dateRealisation,
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
    const payload = toInsert.map((r) => {
      const statut = computeStatutTaf(r, []);
      return {
        ...r,
        statut,
        tx_progression: computeTxProgression(r),
        date_realisation: statut === "CLOTUREE" ? todayIso : null,
      };
    });
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
// Statut/date_realisation sont recalcules ici a chaque sauvegarde depuis
// T1-T4 ET l'etat actuel de Correction (voir computeStatutTaf plus haut) -
// seul point d'entree possible pour modifier T1-T4, donc seul endroit ou
// Statut peut changer pour cette moitie du calcul (l'autre moitie, les
// entrees Correction, passe par saveTafCorrectionEntriesAndRecomputeStatut
// plus bas).
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

  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("statut, date_realisation, correction_entries")
    .eq("id", id)
    .maybeSingle();
  const ancien = existing as {
    statut: string | null;
    date_realisation: string | null;
    correction_entries: CorrectionEntry[] | null;
  } | null;

  const statut = computeStatutTaf(payload, ancien?.correction_entries ?? []);
  const ancienCloture = String(ancien?.statut ?? "").trim().toUpperCase() === "CLOTUREE";
  const todayIso = new Date().toISOString().slice(0, 10);
  const dateRealisation = calculerDateRealisation(
    statut === "CLOTUREE",
    ancienCloture,
    ancien?.date_realisation ?? null,
    todayIso
  );

  const updatePayload: Record<string, string | null> = {
    ...payload,
    statut,
    tx_progression: computeTxProgression(payload),
    date_realisation: dateRealisation,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseServer.from(TABLE).update(updatePayload).eq("id", id);

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

// Colonne Correction - meme principe que Correction/Action Corrective sur NC
// Confidentiel (liste d'entrees datees + fichiers joints, voir
// nc-confidentiel/actions.ts) mais un seul champ ici (pas d'Action
// Corrective distincte sur TAF). Point d'entree UNIQUE pour toute mutation
// de correction_entries (ajout, modification de texte, fichier joint/
// retire) - recalcule Statut/date_realisation depuis T1-T4 (deja en base) +
// l'etat des entrees, en une seule ecriture (demande explicite : "le statut
// ca va agir avec lui").
async function saveTafCorrectionEntriesAndRecomputeStatut(
  tafId: number,
  nextEntries: CorrectionEntry[]
): Promise<{ ok: boolean; message?: string }> {
  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("t1, t2, t3, t4, statut, date_realisation")
    .eq("id", tafId)
    .maybeSingle();
  const ancien = existing as {
    t1: string | null;
    t2: string | null;
    t3: string | null;
    t4: string | null;
    statut: string | null;
    date_realisation: string | null;
  } | null;

  const statut = computeStatutTaf(ancien ?? {}, nextEntries);
  const ancienCloture = String(ancien?.statut ?? "").trim().toUpperCase() === "CLOTUREE";
  const todayIso = new Date().toISOString().slice(0, 10);
  const dateRealisation = calculerDateRealisation(
    statut === "CLOTUREE",
    ancienCloture,
    ancien?.date_realisation ?? null,
    todayIso
  );

  const { error } = await supabaseServer
    .from(TABLE)
    .update({
      correction_entries: nextEntries,
      statut,
      date_realisation: dateRealisation,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tafId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/qualite/taf-confidentiel");
  revalidatePath(`/qualite/taf-confidentiel/${tafId}`);
  return { ok: true };
}

export async function addTafCorrectionEntryAction(
  tafId: number,
  texte: string
): Promise<{ ok: boolean; message?: string; entry?: CorrectionEntry }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter d'entree." };
  }

  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("correction_entries")
    .eq("id", tafId)
    .maybeSingle();
  const currentEntries = ((existing as { correction_entries: CorrectionEntry[] | null } | null)
    ?.correction_entries ?? []) as CorrectionEntry[];

  const entry: CorrectionEntry = {
    id: randomUUID(),
    texte,
    date: new Date().toISOString().slice(0, 10),
    fichiers: [],
  };
  const nextEntries = [...currentEntries, entry];

  const result = await saveTafCorrectionEntriesAndRecomputeStatut(tafId, nextEntries);
  if (!result.ok) {
    return result;
  }
  return { ok: true, entry };
}

export async function updateTafCorrectionEntryTextAction(
  tafId: number,
  entryId: string,
  texte: string
): Promise<{ ok: boolean; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier cette entree." };
  }

  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("correction_entries")
    .eq("id", tafId)
    .maybeSingle();
  const currentEntries = ((existing as { correction_entries: CorrectionEntry[] | null } | null)
    ?.correction_entries ?? []) as CorrectionEntry[];
  const nextEntries = currentEntries.map((e) => (e.id === entryId ? { ...e, texte } : e));

  return saveTafCorrectionEntriesAndRecomputeStatut(tafId, nextEntries);
}

export async function createTafCorrectionEntryUploadSlotAction(
  tafId: number,
  entryId: string,
  fileName: string
): Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!tafId) {
    return { ok: false, message: "Ligne invalide." };
  }

  const path = `taf-confidentiel/${tafId}/correction/${entryId}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, message: error?.message || "Impossible de preparer l'envoi." };
  }

  return { ok: true, path, signedUrl: data.signedUrl };
}

export async function confirmTafCorrectionEntryUploadAction(
  tafId: number,
  entryId: string,
  files: AttachmentFile[]
): Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!tafId || files.length === 0) {
    return { ok: false, message: "Rien a enregistrer." };
  }

  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("correction_entries")
    .eq("id", tafId)
    .maybeSingle();
  const currentEntries = ((existing as { correction_entries: CorrectionEntry[] | null } | null)
    ?.correction_entries ?? []) as CorrectionEntry[];
  const nextEntries = currentEntries.map((e) =>
    e.id === entryId ? { ...e, fichiers: [...e.fichiers, ...files] } : e
  );

  const result = await saveTafCorrectionEntriesAndRecomputeStatut(tafId, nextEntries);
  if (!result.ok) {
    return result;
  }
  return { ok: true, files };
}

export async function deleteTafCorrectionEntryFileAction(
  tafId: number,
  entryId: string,
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
    .select("correction_entries")
    .eq("id", tafId)
    .maybeSingle();
  const currentEntries = ((existing as { correction_entries: CorrectionEntry[] | null } | null)
    ?.correction_entries ?? []) as CorrectionEntry[];
  const nextEntries = currentEntries.map((e) =>
    e.id === entryId ? { ...e, fichiers: e.fichiers.filter((f) => f.path !== path) } : e
  );

  return saveTafCorrectionEntriesAndRecomputeStatut(tafId, nextEntries);
}
