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

function parseOptionalNumberValue(raw: FormDataEntryValue | undefined) {
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
// tout le programme.
export async function createProgrammeAction(formData: FormData) {
  const currentUser = await requireProgrammeWriteAccess();

  const dateJour = String(formData.get("date_jour") || "").trim() || new Date().toISOString().slice(0, 10);

  const articleIds = formData.getAll("article_id");
  const vracArticleIds = formData.getAll("vrac_article_id");
  const machineFabricationIds = formData.getAll("machine_fabrication_id");
  const machineConditionnementIds = formData.getAll("machine_conditionnement_id");
  const machineEmballageIds = formData.getAll("machine_emballage_id");
  const dureesMinutes = formData.getAll("duree_minutes");
  const qtCartons = formData.getAll("qt_carton");
  const qtVracs = formData.getAll("qt_vrac");
  const qtEmballages = formData.getAll("qt_emballage");

  const lignes = articleIds
    .map((rawArticleId, index) => ({
      article_id: parseIdValue(rawArticleId),
      vrac_article_id: parseIdValue(vracArticleIds[index]),
      machine_fabrication_id: parseIdValue(machineFabricationIds[index]),
      machine_conditionnement_id: parseIdValue(machineConditionnementIds[index]),
      machine_emballage_id: parseIdValue(machineEmballageIds[index]),
      duree_minutes: parseOptionalNumberValue(dureesMinutes[index]),
      qt_carton: parseOptionalNumberValue(qtCartons[index]) ?? 0,
      qt_vrac: parseOptionalNumberValue(qtVracs[index]) ?? 0,
      qt_emballage: parseOptionalNumberValue(qtEmballages[index]) ?? 0,
      date_jour: dateJour,
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
  redirect("/production/programme");
}

export async function deleteProgrammeAction(formData: FormData) {
  await requireProgrammeWriteAccess();

  const programmeId = Number(formData.get("programme_id") || "0");
  if (!programmeId) {
    throw new Error("Programme invalide.");
  }

  const { error } = await supabaseServer.from("programmes").delete().eq("id", programmeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/programme");
}
