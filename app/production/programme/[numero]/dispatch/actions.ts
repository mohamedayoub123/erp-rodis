"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { extractTrailingNumber } from "@/lib/article-code-family";

// Le groupe_id est desormais un vrai groupe_id programme_lignes (positif,
// voir syncProgrammeLignesMirror dans app/production/programme/actions.ts),
// pas une formule fixe - retrouve ici via source_numero_programme, le lien
// stable pose au Dispatch. Retourne null si ce programme n'a jamais ete
// dispatche.
async function resolveGroupeId(numeroProgramme: number): Promise<number | null> {
  const { data, error } = await supabaseServer
    .from("programme_lignes")
    .select("groupe_id")
    .eq("source_numero_programme", numeroProgramme)
    .not("groupe_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as { groupe_id: number } | null)?.groupe_id ?? null;
}

// Confirme les lignes de dispatch de ce programme, filtre par groupe_id -
// cette page ne montre QUE les lignes de dispatch de ce programme (MB)
// precis, jamais melangees aux autres chaines/zones reelles. La confirmation
// confirme_production=true sur programme_lignes (meme groupe_id) est ce qui
// rend ce programme visible sur Dashboard/Calendrier Production - exactement
// comme le Save de Ravitailleur par ligne le fait pour Programme par ligne.
async function applyPendingArticleCodeUpdates(groupeIds: number[]): Promise<void> {
  if (groupeIds.length === 0) return;

  const { data: pendingRows, error: fetchError } = await supabaseServer
    .from("pending_article_code_updates")
    .select("article_id, code_manu, code_auto")
    .in("groupe_id", groupeIds);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows =
    (pendingRows as { article_id: number; code_manu: string | null; code_auto: string | null }[] | null) ?? [];

  if (rows.length > 0) {
    const bestByArticleId = new Map<number, { code_manu: string | null; code_auto: string | null }>();

    for (const row of rows) {
      const current = bestByArticleId.get(row.article_id) ?? { code_manu: null, code_auto: null };

      const currentManuNum = current.code_manu ? extractTrailingNumber(current.code_manu) : null;
      const rowManuNum = row.code_manu ? extractTrailingNumber(row.code_manu) : null;
      if (rowManuNum !== null && (currentManuNum === null || rowManuNum > currentManuNum)) {
        current.code_manu = row.code_manu;
      }

      const currentAutoNum = current.code_auto ? extractTrailingNumber(current.code_auto) : null;
      const rowAutoNum = row.code_auto ? extractTrailingNumber(row.code_auto) : null;
      if (rowAutoNum !== null && (currentAutoNum === null || rowAutoNum > currentAutoNum)) {
        current.code_auto = row.code_auto;
      }

      bestByArticleId.set(row.article_id, current);
    }

    const { error: applyError } = await supabaseServer.rpc("articles_bulk_update_codes", {
      p_updates: [...bestByArticleId.entries()].map(([articleId, update]) => ({
        id: articleId,
        code_manu: update.code_manu,
        code_auto: update.code_auto,
      })),
    });

    if (applyError) {
      throw new Error(applyError.message);
    }
  }

  const { error: deleteError } = await supabaseServer
    .from("pending_article_code_updates")
    .delete()
    .in("groupe_id", groupeIds);

  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

export async function saveProgrammeDispatchByGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "programme"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer.");
  }

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }
  const groupeId = await resolveGroupeId(numeroProgramme);
  if (!groupeId) {
    throw new Error("Rien a enregistrer pour ce programme.");
  }

  const { data: currentRows, error: fetchError } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .select("zone, article_id, date_jour, chaine, produit, code, qt_carton, qt_vrac, groupe_id")
    .eq("groupe_id", groupeId);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = (currentRows ?? []).map((row) => ({ ...row, cree_par: currentUser }));

  if (rows.length === 0) {
    throw new Error("Rien a enregistrer pour ce programme.");
  }

  const historyRows = rows.map(({ groupe_id, ...rest }) => ({ ...rest, source_groupe_id: groupe_id }));

  const existingGroupIds = new Set<number>();
  let fromIndex = 0;
  const pageSize = 1000;

  while (true) {
    const { data: groupRows, error: groupFetchError } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("groupe_id")
      .range(fromIndex, fromIndex + pageSize - 1);

    if (groupFetchError) {
      throw new Error(groupFetchError.message);
    }

    const chunk = (groupRows as { groupe_id: number }[] | null) ?? [];
    chunk.forEach((row) => {
      if (row.groupe_id !== null) existingGroupIds.add(row.groupe_id);
    });

    if (chunk.length < pageSize) break;
    fromIndex += pageSize;
  }

  const generatedCode = `PD${existingGroupIds.size + 1}`;

  const { data: inserted, error: insertError } = await supabaseServer
    .from("programme_dispatcher_history")
    .insert(historyRows)
    .select("id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  const insertedIds = ((inserted as { id: number }[] | null) ?? []).map((row) => row.id);
  const historyGroupeId = Math.min(...insertedIds);

  const { error: groupUpdateError } = await supabaseServer
    .from("programme_dispatcher_history")
    .update({ groupe_id: historyGroupeId })
    .in("id", insertedIds);

  if (groupUpdateError) {
    throw new Error(groupUpdateError.message);
  }

  // Confirme les lignes miroir programme_lignes de ce groupe pour le
  // Dashboard/Calendrier Production - sans ca, un programme (MB) reste
  // invisible partout meme apres ce Save (voir syncProgrammeLignesMirror,
  // app/production/programme/actions.ts).
  const { error: confirmError } = await supabaseServer
    .from("programme_lignes")
    .update({ confirme_production: true })
    .eq("groupe_id", groupeId);

  if (confirmError) {
    throw new Error(confirmError.message);
  }

  await applyPendingArticleCodeUpdates([groupeId]);

  revalidatePath(`/production/programme/${numeroProgramme}/dispatch`);
  revalidatePath("/historique-programme-dispatcher");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
  revalidatePath("/articles/produit-fini");

  return { ok: true, code: generatedCode, groupe_id: historyGroupeId };
}

export async function deleteProgrammeDispatchByGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "programme"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer.");
  }

  const numeroProgramme = Number(formData.get("numero_programme") || "0");
  if (!numeroProgramme) {
    throw new Error("Programme invalide.");
  }
  const groupeId = await resolveGroupeId(numeroProgramme);
  if (!groupeId) {
    return;
  }

  const { error } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .delete()
    .eq("groupe_id", groupeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/production/programme/${numeroProgramme}/dispatch`);
}
