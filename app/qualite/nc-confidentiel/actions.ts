"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import type { AuditRow } from "../audit-table";

const TABLE = "qualite_nc_confidentiel";
const BUCKET = "qualite-audit-fichiers";

type AttachmentFile = { name: string; path: string };

// Correction/Action Corrective (AC) sont chacune une liste d'entrees datees
// (colonnes JSONB correction_entries/action_corrective_ac_entries) plutot
// qu'un seul champ texte - demande explicite : pouvoir en ajouter une 2eme,
// 3eme..., chacune avec ses propres fichiers joints (bouton visible
// directement sur la ligne, le texte multi-lignes une fois la ligne
// ouverte). Voir scripts/sql/add_correction_ac_entries_nc.sql.
export type CorrectionEntry = { id: string; texte: string; date: string; fichiers: AttachmentFile[] };
export type EntryField = "correction" | "action_corrective_ac";

function entriesColumn(field: EntryField): "correction_entries" | "action_corrective_ac_entries" {
  return field === "correction" ? "correction_entries" : "action_corrective_ac_entries";
}

async function fetchEntries(ncId: number, field: EntryField): Promise<CorrectionEntry[]> {
  const column = entriesColumn(field);
  const { data } = await supabaseServer.from(TABLE).select(column).eq("id", ncId).maybeSingle();
  return ((data as Record<string, CorrectionEntry[]> | null)?.[column] ?? []) as CorrectionEntry[];
}

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

// Des qu'un vrai numero est tape/corrige a la main sur une ligne, le
// compteur (qualite_numero_compteurs) avance tout seul pour "voir" cette
// sequence et continuer a partir de la - demande explicite : "il va voir je
// ajouter quoi et il va continuer a ajouter". Accepte le format historique
// complet ("AI-1-2026-NC-033") ET une forme plus courte sans "NC"
// ("AI.1.2026.1" - demande explicite), separateurs "-" ou "." indifferemment
// - jamais fige sur un seul format de ponctuation. Prend toujours le MAX
// entre la valeur deja enregistree et sequence+1 - ne fait jamais reculer le
// compteur (un numero tape par erreur plus petit qu'une sequence deja
// avancee ne doit pas ecraser le repere existant).
const NUMERO_PATTERN = /^AI[-.](\d+)[-.](\d{4})[-.](?:NC[-.])?(\d+)$/i;

async function synchroniserCompteursDepuisNumeros(rows: Record<string, string | number | null>[]): Promise<void> {
  const parsed = new Map<string, { audit: string; annee: number; sequence: number }>();

  for (const row of rows) {
    const m = String(row.numero || "").trim().match(NUMERO_PATTERN);
    if (!m) continue;

    const audit = m[1];
    const annee = Number(m[2]);
    const sequence = Number(m[3]);
    const key = `${audit}::${annee}`;
    const current = parsed.get(key);
    if (!current || sequence > current.sequence) {
      parsed.set(key, { audit, annee, sequence });
    }
  }

  if (parsed.size === 0) return;

  const { data: existingCompteurs } = await supabaseServer
    .from("qualite_numero_compteurs")
    .select("audit, annee, prochain_numero")
    .in(
      "audit",
      [...parsed.values()].map((v) => v.audit)
    );
  const existingByKey = new Map(
    ((existingCompteurs ?? []) as { audit: string; annee: number; prochain_numero: number }[]).map((c) => [
      `${c.audit}::${c.annee}`,
      c.prochain_numero,
    ])
  );

  const payload = [...parsed.entries()].map(([key, v]) => {
    const ancien = existingByKey.get(key) ?? 0;
    return {
      audit: v.audit,
      annee: v.annee,
      prochain_numero: Math.max(ancien, v.sequence + 1),
      updated_at: new Date().toISOString(),
    };
  });

  await supabaseServer.from("qualite_numero_compteurs").upsert(payload, { onConflict: "audit,annee" });
}

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

  await synchroniserCompteursDepuisNumeros(rows);

  revalidatePath("/qualite/nc-confidentiel");
  return { ok: true, insertedIds };
}

function parseOptionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

// Creation d'une nouvelle NC depuis /qualite/nc-confidentiel/nouvelle - page
// dediee (formulaire vertical) plutot que la ligne vierge de AuditTable,
// demande explicite ("il faut pas qu'il me ajoute une ligne, il faut qu'il
// ouvre page ecran plein"). Ne capture QUE le constat initial (Audit,
// Constat, Classe, Processus/Service concerne, Norme/Chapitre) - jamais les
// champs de suivi (Correction, AC, statuts, dates...), remplis plus tard
// via le tableau normal une fois l'instruction/investigation en cours.
export async function createNcConfidentielAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter de NC.");
  }

  const { error } = await supabaseServer.from(TABLE).insert({
    audit: parseOptionalText(formData, "audit"),
    constat: parseOptionalText(formData, "constat"),
    classe: parseOptionalText(formData, "classe"),
    processus_concerne: parseOptionalText(formData, "processus_concerne"),
    service_concerne: parseOptionalText(formData, "service_concerne"),
    norme_concernee: parseOptionalText(formData, "norme_concernee"),
    chapitre: parseOptionalText(formData, "chapitre"),
    sous_chapitre: parseOptionalText(formData, "sous_chapitre"),
    sous_sous_chapitre: parseOptionalText(formData, "sous_sous_chapitre"),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/nc-confidentiel");
  redirect("/qualite/nc-confidentiel");
}

// Champs de suivi modifies depuis la page dediee /qualite/nc-confidentiel/[id]
// - saisie plus confortable en formulaire vertical plein ecran que dans les
// cellules etroites du tableau (demande explicite). Correction et Action
// Corrective ne sont PAS dans cette liste - ce sont desormais des listes
// d'entrees (voir addNcEntryAction plus bas), pas de simples champs texte.
// Statut correction/Statut AC sont maintenant modifiables UNIQUEMENT ici
// (plus dans le tableau, voir page.tsx) - la
// cascade Statut cloture + les 3 dates de realisation (auparavant geree par
// saveNcConfidentielBatchAction) est donc reproduite ci-dessous pour ne pas
// perdre ce comportement.
const DETAIL_FIELD_KEYS = [
  "responsable_correction",
  "delais_correction",
  "commentaire",
  "analyse_causes",
  "responsable_ac",
  "delais_ac",
  "commentaire2",
  "methode_mesure_efficacite_ac",
  "mesure_efficacite_ac",
  "realise_par",
  "commentaire3",
] as const;

export async function updateNcConfidentielDetailAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    throw new Error("Cet utilisateur ne peut pas modifier cette NC.");
  }

  const id = Number(formData.get("id"));
  if (!id) {
    throw new Error("NC invalide.");
  }

  const payload: Record<string, string | null> = {};
  for (const key of DETAIL_FIELD_KEYS) {
    payload[key] = parseOptionalText(formData, key);
  }

  const { data: existing } = await supabaseServer
    .from(TABLE)
    .select("statut_correction, statut_ac, statut_cloture, date_realisation_correction, date_realisation_ac, date_realisation")
    .eq("id", id)
    .maybeSingle();
  const ancien = existing as Omit<AncienEtat, "id"> | null;

  const statutCorrection = parseOptionalText(formData, "statut_correction");
  const statutAc = parseOptionalText(formData, "statut_ac");
  const nouveauFaitCorrection = String(statutCorrection ?? "").trim().toUpperCase() === "REALISEE";
  const nouveauFaitAc = String(statutAc ?? "").trim().toUpperCase() === "REALISEE";
  const statutCloture = nouveauFaitCorrection && nouveauFaitAc ? "CLOTUREE" : "EN COURS";

  const todayIso = new Date().toISOString().slice(0, 10);
  const dateCorrection = calculerDateRealisation(
    nouveauFaitCorrection,
    ancien?.statut_correction?.trim().toUpperCase() === "REALISEE",
    ancien?.date_realisation_correction ?? null,
    todayIso
  );
  const dateAc = calculerDateRealisation(
    nouveauFaitAc,
    ancien?.statut_ac?.trim().toUpperCase() === "REALISEE",
    ancien?.date_realisation_ac ?? null,
    todayIso
  );
  const dateCloture = calculerDateRealisation(
    statutCloture === "CLOTUREE",
    ancien?.statut_cloture?.trim().toUpperCase() === "CLOTUREE",
    ancien?.date_realisation ?? null,
    todayIso
  );

  const { error } = await supabaseServer
    .from(TABLE)
    .update({
      ...payload,
      statut_correction: statutCorrection,
      statut_ac: statutAc,
      statut_cloture: statutCloture,
      date_realisation_correction: dateCorrection,
      date_realisation_ac: dateAc,
      date_realisation: dateCloture,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/nc-confidentiel");
  revalidatePath(`/qualite/nc-confidentiel/${id}`);
  redirect("/qualite/nc-confidentiel");
}

const COMPTEURS_TABLE = "qualite_numero_compteurs";

// Meme regle que partout ailleurs dans l'app (formulaire natif <form
// action>, jamais de catch cote client possible) : un throw depuis une
// Server Action voit son message efface en production par Next.js (page
// d'erreur generique). Capture ici et redirige avec le vrai message en
// avertissement (ex: numero mal formate) plutot que de laisser planter.
async function withAvertissementRedirectCompteurs(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant l'operation.";
    redirect(`/qualite/nc-confidentiel/compteurs?avertissement=${encodeURIComponent(message)}`);
  }
}

// Reglage manuel du compteur par (Audit, Annee) - demande explicite : "dans
// le numero il faut que je ecrit tout, pas seulement le nombre". On tape le
// numero COMPLET tel qu'il a ete utilise (ex: "AI-1-2026-NC-033" ou
// "AI.1.2026.1") - jamais un simple chiffre a calculer soi-meme - et le
// "prochain numero" (sequence+1) en est deduit automatiquement, meme motif
// que synchroniserCompteursDepuisNumeros plus haut. Sert a corriger/
// redemarrer le compteur ; le numero du tableau NC reste toujours saisi/
// corrige a la main comme avant, jamais rempli depuis ce compteur.
export async function upsertNumeroCompteurAction(formData: FormData): Promise<void> {
  await withAvertissementRedirectCompteurs(async () => {
    const currentUser = await getCurrentStockUser();
    if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
      throw new Error("Cet utilisateur ne peut pas modifier les compteurs.");
    }

    const audit = String(formData.get("audit") || "").trim();
    const annee = Number(formData.get("annee") || "0");
    const numero = String(formData.get("numero") || "").trim();

    if (!audit || !Number.isFinite(annee) || annee <= 0 || !numero) {
      throw new Error("Audit, annee et numero sont obligatoires.");
    }

    const match = numero.match(NUMERO_PATTERN);
    if (!match) {
      throw new Error(
        `Numero "${numero}" non reconnu - format attendu : AI-1-2026-NC-033 ou AI.1.2026.1.`
      );
    }
    const sequence = Number(match[3]);

    const { error } = await supabaseServer
      .from(COMPTEURS_TABLE)
      .upsert(
        { audit, annee, prochain_numero: sequence + 1, updated_at: new Date().toISOString() },
        { onConflict: "audit,annee" }
      );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/qualite/nc-confidentiel/compteurs");
  });
}

export async function deleteNumeroCompteurAction(formData: FormData): Promise<void> {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "qualiteNcConfidentiel"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer ce compteur.");
  }

  const audit = String(formData.get("audit") || "").trim();
  const annee = Number(formData.get("annee") || "0");
  if (!audit || !Number.isFinite(annee)) {
    throw new Error("Compteur invalide.");
  }

  const { error } = await supabaseServer.from(COMPTEURS_TABLE).delete().eq("audit", audit).eq("annee", annee);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/nc-confidentiel/compteurs");
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

// Ajoute une nouvelle entree datee (Correction ou Action Corrective) - voir
// CorrectionEntry plus haut. Chaque appel AJOUTE, ne remplace jamais les
// entrees existantes.
export async function addNcEntryAction(
  ncId: number,
  field: EntryField,
  texte: string
): Promise<{ ok: boolean; message?: string; entry?: CorrectionEntry }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier cette NC." };
  }

  const trimmed = texte.trim();
  if (!ncId || !trimmed) {
    return { ok: false, message: "Texte vide." };
  }

  const entry: CorrectionEntry = {
    id: randomUUID(),
    texte: trimmed,
    date: new Date().toISOString().slice(0, 10),
    fichiers: [],
  };
  const nextEntries = [...(await fetchEntries(ncId, field)), entry];

  const { error } = await supabaseServer
    .from(TABLE)
    .update({ [entriesColumn(field)]: nextEntries, updated_at: new Date().toISOString() })
    .eq("id", ncId);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/qualite/nc-confidentiel");
  revalidatePath(`/qualite/nc-confidentiel/${ncId}`);
  return { ok: true, entry };
}

// Modifie le texte d'une entree DEJA existante (ouvrir la ligne pour la
// corriger) - demande explicite ("il faut que je peux modifier si je rentre
// sur le ligne"). Ne touche jamais a la date (garde la date de creation de
// l'entree) ni aux fichiers deja joints.
export async function updateNcEntryTextAction(
  ncId: number,
  field: EntryField,
  entryId: string,
  texte: string
): Promise<{ ok: boolean; message?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier cette NC." };
  }

  const trimmed = texte.trim();
  if (!ncId || !entryId || !trimmed) {
    return { ok: false, message: "Texte vide." };
  }

  const currentEntries = await fetchEntries(ncId, field);
  const nextEntries = currentEntries.map((entry) => (entry.id === entryId ? { ...entry, texte: trimmed } : entry));

  const { error } = await supabaseServer
    .from(TABLE)
    .update({ [entriesColumn(field)]: nextEntries, updated_at: new Date().toISOString() })
    .eq("id", ncId);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/qualite/nc-confidentiel");
  revalidatePath(`/qualite/nc-confidentiel/${ncId}`);
  return { ok: true };
}

// Meme principe que createNcConfidentielUploadSlotAction/confirmNcConfidentielUploadAction
// (upload direct au Storage via lien signe), mais range le fichier dans les
// fichiers de CETTE entree precise plutot que dans pieces_jointes au niveau
// de la ligne entiere.
export async function createNcEntryUploadSlotAction(
  ncId: number,
  field: EntryField,
  entryId: string,
  fileName: string
): Promise<{ ok: boolean; message?: string; path?: string; signedUrl?: string }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!ncId || !entryId) {
    return { ok: false, message: "Entree invalide." };
  }

  const path = `nc-confidentiel/${ncId}/${field}/${entryId}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await supabaseServer.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, message: error?.message || "Impossible de preparer l'envoi." };
  }

  return { ok: true, path, signedUrl: data.signedUrl };
}

export async function confirmNcEntryUploadAction(
  ncId: number,
  field: EntryField,
  entryId: string,
  files: AttachmentFile[]
): Promise<{ ok: boolean; message?: string; files?: AttachmentFile[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteNcConfidentiel"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas ajouter de fichier." };
  }
  if (!ncId || !entryId || files.length === 0) {
    return { ok: false, message: "Rien a enregistrer." };
  }

  const currentEntries = await fetchEntries(ncId, field);
  const nextEntries = currentEntries.map((entry) =>
    entry.id === entryId ? { ...entry, fichiers: [...entry.fichiers, ...files] } : entry
  );

  const { error } = await supabaseServer
    .from(TABLE)
    .update({ [entriesColumn(field)]: nextEntries, updated_at: new Date().toISOString() })
    .eq("id", ncId);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/qualite/nc-confidentiel");
  revalidatePath(`/qualite/nc-confidentiel/${ncId}`);
  return { ok: true, files };
}

// Reutilise getNcConfidentielFileUrlAction (plus haut) pour VOIR un fichier
// d'entree - generique sur un chemin Storage, sans notion de ligne/entree.

export async function deleteNcEntryFileAction(
  ncId: number,
  field: EntryField,
  entryId: string,
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

  const currentEntries = await fetchEntries(ncId, field);
  const nextEntries = currentEntries.map((entry) =>
    entry.id === entryId ? { ...entry, fichiers: entry.fichiers.filter((f) => f.path !== path) } : entry
  );

  const { error: updateError } = await supabaseServer
    .from(TABLE)
    .update({ [entriesColumn(field)]: nextEntries, updated_at: new Date().toISOString() })
    .eq("id", ncId);
  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/qualite/nc-confidentiel");
  revalidatePath(`/qualite/nc-confidentiel/${ncId}`);
  return { ok: true };
}
