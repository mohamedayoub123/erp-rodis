"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Enregistre "avis", "statistique 4D 6 mois" et "tonnage 1 tc" (les seuls
// champs saisis a la main sur ce rapport) pour toutes les lignes soumises
// en une fois - donnees[...] garde tel quel le reste (stock/BC/4D/consos),
// qui n'est jamais modifie ici (recalcule en direct a chaque affichage de
// la page).
export async function saveRapportGammeStatistiqueAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "statistiqueMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier ce rapport.");
  }

  const gammeStatistique = String(formData.get("gamme_statistique") || "").trim();
  const rowIds = formData
    .getAll("row_id")
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id) && id > 0);

  const updates = rowIds.map((id) => {
    let donnees: Record<string, unknown> = {};
    try {
      donnees = JSON.parse(String(formData.get(`donnees_${id}`) || "{}"));
    } catch {
      donnees = {};
    }

    const avis = String(formData.get(`avis_${id}`) || "").trim();
    donnees["avis"] = avis || null;

    const statistiqueRaw = String(formData.get(`stat4d_${id}`) || "").trim().replace(",", ".");
    donnees["statistique 4D 6 mois"] = statistiqueRaw ? Number(statistiqueRaw) : null;

    const tonnageRaw = String(formData.get(`tonnage1tc_${id}`) || "").trim().replace(",", ".");
    donnees["tonnage 1 tc"] = tonnageRaw ? Number(tonnageRaw) : null;

    return { id, donnees };
  });

  const chunkSize = 20;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((update) =>
        supabaseServer.from("rapport_gamme_statistique_mp").update({ donnees: update.donnees }).eq("id", update.id)
      )
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.message);
  }

  if (gammeStatistique) {
    revalidatePath(
      `/stock/matiere-premiere/statistique?gammeStatistique=${encodeURIComponent(gammeStatistique)}`
    );
  }
  revalidatePath("/stock/matiere-premiere/statistique");
}
