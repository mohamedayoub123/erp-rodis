"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requireProgrammeWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "programme"))) {
    throw new Error("Cet utilisateur ne peut pas creer de programme.");
  }

  return currentUser;
}

function parseOptionalNumberValue(raw: FormDataEntryValue | null | undefined) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isNaN(value) ? null : value;
}

function parseIdValue(raw: FormDataEntryValue | undefined) {
  const value = Number(raw ?? "0");
  return value > 0 ? value : null;
}

// Plusieurs articles dans le meme programme, une ligne par article : tous
// les champs (article_id, machine_*, qt_*...) sont ecrits sous le meme nom
// sur chaque ligne du formulaire - getAll() les relit dans l'ordre du DOM,
// les tableaux se correspondent tous par position. Une seule date pour
// tout le programme, et un seul numero de programme (MB1, MB2...) partage
// par toutes les lignes de cet envoi - le prochain numero est simplement le
// plus grand numero_programme existant + 1.
export async function createProgrammeAction(formData: FormData) {
  const currentUser = await requireProgrammeWriteAccess();

  const dateJour = String(formData.get("date_jour") || "").trim() || new Date().toISOString().slice(0, 10);
  const remarque = String(formData.get("remarque") || "").trim() || null;
  const statut = String(formData.get("statut") || "").trim() || "En attente";

  const { data: dernierProgramme } = await supabaseServer
    .from("programmes")
    .select("numero_programme")
    .order("numero_programme", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numeroProgramme = ((dernierProgramme as { numero_programme: number | null } | null)?.numero_programme ?? 0) + 1;

  const articleIds = formData.getAll("article_id");
  const vracArticleIds = formData.getAll("vrac_article_id");
  const machineFabricationIds = formData.getAll("machine_fabrication_id");
  const machineConditionnementIds = formData.getAll("machine_conditionnement_id");
  const dureesMinutes = formData.getAll("duree_minutes");
  const qtCartons = formData.getAll("qt_carton");
  const qtVracs = formData.getAll("qt_vrac");

  const lignes = articleIds
    .map((rawArticleId, index) => ({
      article_id: parseIdValue(rawArticleId),
      vrac_article_id: parseIdValue(vracArticleIds[index]),
      machine_fabrication_id: parseIdValue(machineFabricationIds[index]),
      machine_conditionnement_id: parseIdValue(machineConditionnementIds[index]),
      duree_minutes: parseOptionalNumberValue(dureesMinutes[index]),
      qt_carton: parseOptionalNumberValue(qtCartons[index]) ?? 0,
      qt_vrac: parseOptionalNumberValue(qtVracs[index]) ?? 0,
      date_jour: dateJour,
      numero_programme: numeroProgramme,
      remarque,
      statut,
      utilisateur: currentUser || null,
    }))
    .filter((ligne) => ligne.article_id !== null);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins un article au programme.");
  }

  const { error } = await supabaseServer.from("programmes").insert(lignes);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  redirect(`/production/programme/${numeroProgramme}`);
}

export async function deleteProgrammeAction(formData: FormData) {
  await requireProgrammeWriteAccess();

  const programmeId = Number(formData.get("programme_id") || "0");
  if (!programmeId) {
    throw new Error("Programme invalide.");
  }
  const numeroProgramme = Number(formData.get("numero_programme") || "0");

  const { error } = await supabaseServer.from("programmes").delete().eq("id", programmeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  if (numeroProgramme) {
    revalidatePath(`/production/programme/${numeroProgramme}`);
  }
}

// Ajoute d'autres lignes/articles a un programme (MB) deja existant - meme
// convention getAll() que createProgrammeAction, mais garde la meme
// date_jour/remarque/statut que le groupe existant (partages par toutes
// les lignes d'un numero_programme) au lieu d'en allouer un nouveau.
export async function addLignesProgrammeAction(formData: FormData) {
  const currentUser = await requireProgrammeWriteAccess();

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }

  const { data: existant } = await supabaseServer
    .from("programmes")
    .select("date_jour, remarque, statut")
    .eq("numero_programme", numeroProgramme)
    .limit(1)
    .maybeSingle();

  if (!existant) {
    throw new Error("Programme introuvable.");
  }

  const articleIds = formData.getAll("article_id");
  const vracArticleIds = formData.getAll("vrac_article_id");
  const machineFabricationIds = formData.getAll("machine_fabrication_id");
  const machineConditionnementIds = formData.getAll("machine_conditionnement_id");
  const dureesMinutes = formData.getAll("duree_minutes");
  const qtCartons = formData.getAll("qt_carton");
  const qtVracs = formData.getAll("qt_vrac");

  const lignes = articleIds
    .map((rawArticleId, index) => ({
      article_id: parseIdValue(rawArticleId),
      vrac_article_id: parseIdValue(vracArticleIds[index]),
      machine_fabrication_id: parseIdValue(machineFabricationIds[index]),
      machine_conditionnement_id: parseIdValue(machineConditionnementIds[index]),
      duree_minutes: parseOptionalNumberValue(dureesMinutes[index]),
      qt_carton: parseOptionalNumberValue(qtCartons[index]) ?? 0,
      qt_vrac: parseOptionalNumberValue(qtVracs[index]) ?? 0,
      date_jour: (existant as { date_jour: string }).date_jour,
      numero_programme: numeroProgramme,
      remarque: (existant as { remarque: string | null }).remarque,
      statut: (existant as { statut: string }).statut,
      utilisateur: currentUser || null,
    }))
    .filter((ligne) => ligne.article_id !== null);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins un article.");
  }

  const { error } = await supabaseServer.from("programmes").insert(lignes);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  revalidatePath(`/production/programme/${numeroProgramme}`);
}

export async function updateProgrammeLigneAction(formData: FormData) {
  await requireProgrammeWriteAccess();

  const programmeId = Number(formData.get("programme_id") || "0");
  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!programmeId) {
    throw new Error("Ligne invalide.");
  }

  const qtCarton = parseOptionalNumberValue(formData.get("qt_carton")) ?? 0;
  const qtVrac = parseOptionalNumberValue(formData.get("qt_vrac")) ?? 0;

  const { error } = await supabaseServer
    .from("programmes")
    .update({ qt_carton: qtCarton, qt_vrac: qtVrac })
    .eq("id", programmeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  if (numeroProgramme) {
    revalidatePath(`/production/programme/${numeroProgramme}`);
  }
}

// Remarque et Statut sont partages par toutes les lignes d'un meme
// numero_programme (meme "MB") - les modifier met a jour toutes les lignes
// du groupe d'un coup.
export async function updateProgrammeGroupeAction(formData: FormData) {
  await requireProgrammeWriteAccess();

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }

  const remarque = String(formData.get("remarque") || "").trim() || null;
  const statut = String(formData.get("statut") || "").trim() || "En attente";

  const { error } = await supabaseServer
    .from("programmes")
    .update({ remarque, statut })
    .eq("numero_programme", numeroProgramme);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
  revalidatePath(`/production/programme/${numeroProgramme}`);
}
