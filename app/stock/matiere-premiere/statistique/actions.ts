"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { GAMME_CONFIGS } from "./gamme-config";

export function editableFieldName(rowId: number, columnKey: string) {
  return `field__${rowId}__${columnKey}`;
}

// Enregistre les colonnes "editable-*" de la config de la gamme (les seuls
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
  const config = GAMME_CONFIGS[gammeStatistique];
  if (!config) {
    throw new Error(`Gamme inconnue: ${gammeStatistique}`);
  }

  const editableColumns = config.columns.filter(
    (col) => col.kind === "editable-text" || col.kind === "editable-number"
  );

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

    for (const col of editableColumns) {
      const raw = String(formData.get(editableFieldName(id, col.key)) || "").trim();
      if (col.kind === "editable-number") {
        const normalized = raw.replace(",", ".");
        donnees[col.key] = normalized ? Number(normalized) : null;
      } else {
        donnees[col.key] = raw || null;
      }
    }

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
