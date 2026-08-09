"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";

export async function deleteProgrammeDispatcherHistoryGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "historiqueProgrammeDispatcher"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer.");
  }

  const groupeId = Number(String(formData.get("groupe_id") || "0"));

  if (!groupeId) {
    throw new Error("Groupe invalide.");
  }

  const { data: codeRows, error: codeFetchError } = await supabaseServer
    .from("programme_dispatcher_history")
    .select("code, source_groupe_id")
    .eq("groupe_id", groupeId);

  if (codeFetchError) {
    throw new Error(codeFetchError.message);
  }

  const historyLignes = (codeRows as { code: string | null; source_groupe_id: number | null }[] | null) ?? [];
  const deletedCodes = new Set(historyLignes.map((row) => row.code).filter((code): code is string => Boolean(code)));
  const sourceGroupeIds = new Set(
    historyLignes.map((row) => row.source_groupe_id).filter((id): id is number => id !== null)
  );

  const { error } = await supabaseServer
    .from("programme_dispatcher_history")
    .delete()
    .eq("groupe_id", groupeId);

  if (error) {
    throw new Error(error.message);
  }

  // Pas de lien direct (FK) entre l'historique PD et les lignes de
  // programme - 2 facons complementaires de retrouver les lignes source a
  // marquer terminees : par code (via numero_lot, ligne par ligne) et par
  // source_groupe_id (le programme entier). Le matching par groupe_id est
  // indispensable pour les lignes dont l'article n'a pas de code_manu/
  // code_auto configure (numero_lot reste NULL, invisibles au matching par
  // code) - sans lui elles resteraient indefiniment visibles sur le
  // Dashboard meme apres suppression de leur PD.
  if (deletedCodes.size > 0 || sourceGroupeIds.size > 0) {
    const matchingIds = new Set<number>();
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data: ligneRows, error: ligneFetchError } = await supabaseServer
        .from("programme_lignes")
        .select("id, numero_lot, groupe_id")
        .range(from, from + pageSize - 1);

      if (ligneFetchError) {
        throw new Error(ligneFetchError.message);
      }

      const chunk = (ligneRows as { id: number; numero_lot: string | null; groupe_id: number }[] | null) ?? [];
      for (const row of chunk) {
        if (sourceGroupeIds.has(row.groupe_id)) {
          matchingIds.add(row.id);
          continue;
        }
        const codes = (row.numero_lot || "").split(",").map((code) => code.trim()).filter(Boolean);
        if (codes.some((code) => deletedCodes.has(code))) {
          matchingIds.add(row.id);
        }
      }

      if (chunk.length < pageSize) break;
      from += pageSize;
    }

    if (matchingIds.size > 0) {
      const { error: updateError } = await supabaseServer
        .from("programme_lignes")
        .update({ programme_termine: true, programme_termine_date: new Date().toISOString() })
        .in("id", [...matchingIds]);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }
  }

  revalidatePath("/historique-programme-dispatcher");
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
  redirect("/historique-programme-dispatcher");
}
