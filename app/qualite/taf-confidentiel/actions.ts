"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import type { AuditRow } from "../audit-table";

const TABLE = "qualite_taf_confidentiel";

export async function saveTafConfidentielBatchAction(
  rows: AuditRow[]
): Promise<{ ok: boolean; message?: string; insertedIds?: number[] }> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "qualiteTafConfidentiel"))) {
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

  revalidatePath("/qualite/taf-confidentiel");
  return { ok: true, insertedIds };
}

export async function deleteTafConfidentielRowAction(id: number): Promise<void> {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "qualiteTafConfidentiel"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette ligne.");
  }

  const { error } = await supabaseServer.from(TABLE).delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/qualite/taf-confidentiel");
}
