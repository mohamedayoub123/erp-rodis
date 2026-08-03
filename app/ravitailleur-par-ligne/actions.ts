"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

type PendingRavitailleurRow = {
  position: string;
  zone: string;
  chaine: string;
  ravitailleur: string;
};

export async function saveRavitailleurLignesAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!currentUser) {
    throw new Error("Il faut etre connecte pour enregistrer.");
  }

  if (!(await canWritePageUser(currentUser, "ravitailleurParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer.");
  }

  const rawPayload = String(formData.get("payload") || "").trim();

  if (!rawPayload) {
    throw new Error("Aucune ligne a enregistrer.");
  }

  let rows: PendingRavitailleurRow[] = [];

  try {
    rows = JSON.parse(rawPayload) as PendingRavitailleurRow[];
  } catch {
    throw new Error("Le contenu est invalide.");
  }

  const payload = rows.map((row) => ({
    position: row.position,
    zone: row.zone,
    chaine: row.chaine,
    ravitailleur: row.ravitailleur.trim() || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseServer
    .from("ravitailleur_lignes")
    .upsert(payload, { onConflict: "position" });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/ravitailleur-par-ligne");

  return { ok: true };
}
