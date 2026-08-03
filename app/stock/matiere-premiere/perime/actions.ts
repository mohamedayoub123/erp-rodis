"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

export async function updateLotMpNoteAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "stockPerimeMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les notes.");
  }

  const lotId = Number(String(formData.get("lot_id") || "0"));
  const note = String(formData.get("note") || "").trim();

  if (!lotId) {
    throw new Error("Lot invalide.");
  }

  const { error } = await supabaseServer
    .from("lots_matiere_premiere")
    .update({ note: note || null })
    .eq("id", lotId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/stock/matiere-premiere/perime");
}
