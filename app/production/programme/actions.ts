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

function parseOptionalNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

export async function createProgrammeAction(formData: FormData) {
  const currentUser = await requireProgrammeWriteAccess();

  const articleId = Number(formData.get("article_id") || "0");
  if (!articleId) {
    throw new Error("Choisis un article dans la liste (clique une suggestion).");
  }

  const vracArticleIdRaw = Number(formData.get("vrac_article_id") || "0");
  const machineFabricationIdRaw = Number(formData.get("machine_fabrication_id") || "0");
  const machineConditionnementIdRaw = Number(formData.get("machine_conditionnement_id") || "0");
  const machineEmballageIdRaw = Number(formData.get("machine_emballage_id") || "0");
  const dateJour = String(formData.get("date_jour") || "").trim();

  const { error } = await supabaseServer.from("programmes").insert([
    {
      article_id: articleId,
      vrac_article_id: vracArticleIdRaw > 0 ? vracArticleIdRaw : null,
      machine_fabrication_id: machineFabricationIdRaw > 0 ? machineFabricationIdRaw : null,
      machine_conditionnement_id: machineConditionnementIdRaw > 0 ? machineConditionnementIdRaw : null,
      machine_emballage_id: machineEmballageIdRaw > 0 ? machineEmballageIdRaw : null,
      duree_minutes: parseOptionalNumber(formData, "duree_minutes"),
      qt_carton: parseOptionalNumber(formData, "qt_carton") ?? 0,
      qt_vrac: parseOptionalNumber(formData, "qt_vrac") ?? 0,
      qt_emballage: parseOptionalNumber(formData, "qt_emballage") ?? 0,
      date_jour: dateJour || new Date().toISOString().slice(0, 10),
      utilisateur: currentUser || null,
    },
  ]);

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
