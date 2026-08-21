"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requirePlanComptableWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le plan comptable.");
  }
}

export async function createCompteAction(formData: FormData) {
  await requirePlanComptableWriteAccess();

  const code = String(formData.get("code") || "").trim();
  const libelle = String(formData.get("libelle") || "").trim();
  const classe = Number(String(formData.get("classe") || "0"));

  if (!code || !libelle || !classe) {
    throw new Error("Code, libelle et classe sont obligatoires.");
  }

  const { data: existing } = await supabaseServer
    .from("comptes_comptables")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (existing) {
    throw new Error(`Le compte ${code} existe deja.`);
  }

  const { error } = await supabaseServer.from("comptes_comptables").insert([{ code, libelle, classe }]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/comptabilite/plan-comptable");
  revalidatePath("/comptabilite/grand-livre");
}

export async function updateCompteAction(formData: FormData) {
  await requirePlanComptableWriteAccess();

  const compteId = Number(String(formData.get("compte_id") || "0"));
  const code = String(formData.get("code") || "").trim();
  const libelle = String(formData.get("libelle") || "").trim();
  const classe = Number(String(formData.get("classe") || "0"));

  if (!compteId || !code || !libelle || !classe) {
    throw new Error("Compte invalide.");
  }

  const { data: duplicate } = await supabaseServer
    .from("comptes_comptables")
    .select("id")
    .eq("code", code)
    .neq("id", compteId)
    .maybeSingle();

  if (duplicate) {
    throw new Error(`Un autre compte existe deja avec ce code: ${code}`);
  }

  const { error } = await supabaseServer
    .from("comptes_comptables")
    .update({ code, libelle, classe })
    .eq("id", compteId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/comptabilite/plan-comptable");
  revalidatePath("/comptabilite/grand-livre");
}
