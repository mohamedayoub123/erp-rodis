"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

export async function saveProgrammeDispatcherSnapshotAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "ravitailleurParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer.");
  }

  const zone = String(formData.get("zone") || "").trim();

  if (!zone) {
    throw new Error("Zone invalide.");
  }

  const { data: currentRows, error: fetchError } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .select("zone, article_id, date_jour, chaine, produit, code, qt_carton, qt_vrac")
    .eq("zone", zone);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = currentRows ?? [];

  if (rows.length === 0) {
    throw new Error("Rien a enregistrer pour cette zone.");
  }

  // Le code PD1/PD2/PD3... est recalcule a la lecture selon le rang du
  // groupe (meme principe que MB1/MB2 et TE1/TS1) - on compte les
  // groupe_id distincts existants pour le message de confirmation.
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
    .insert(rows)
    .select("id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  const insertedIds = ((inserted as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupUpdateError } = await supabaseServer
    .from("programme_dispatcher_history")
    .update({ groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupUpdateError) {
    throw new Error(groupUpdateError.message);
  }

  revalidatePath(`/ravitailleur-par-ligne/${zone}`);
  revalidatePath("/historique-programme-dispatcher");

  return { ok: true, code: generatedCode, groupe_id: groupeId };
}

// Meme principe que saveProgrammeDispatcherSnapshotAction, mais pour TOUTES
// les zones a la fois (bouton unique de la page "Toutes les zones") - un
// seul code PD couvre alors le programme complet, au lieu d'un code par
// zone si chaque zone etait enregistree separement.
export async function saveAllZonesDispatcherSnapshotAction() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "ravitailleurParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer.");
  }

  const { data: currentRows, error: fetchError } = await supabaseServer
    .from("programme_dispatcher_lignes")
    .select("zone, article_id, date_jour, chaine, produit, code, qt_carton, qt_vrac");

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = currentRows ?? [];

  if (rows.length === 0) {
    throw new Error("Rien a enregistrer.");
  }

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
    .insert(rows)
    .select("id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  const insertedIds = ((inserted as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupUpdateError } = await supabaseServer
    .from("programme_dispatcher_history")
    .update({ groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupUpdateError) {
    throw new Error(groupUpdateError.message);
  }

  revalidatePath("/ravitailleur-par-ligne/tout");
  revalidatePath("/historique-programme-dispatcher");

  return { ok: true, code: generatedCode, groupe_id: groupeId };
}

export async function deleteAllDispatcherLignesAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "ravitailleurParLigne"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer.");
  }

  const zone = String(formData.get("zone") || "").trim();

  if (!zone) {
    throw new Error("Zone invalide.");
  }

  const { error } = await supabaseServer.from("programme_dispatcher_lignes").delete().eq("zone", zone);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/ravitailleur-par-ligne/${zone}`);
}

export async function deleteProgrammeDispatcherHistoryGroupAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "historiqueProgrammeDispatcher"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer.");
  }

  const groupeId = Number(String(formData.get("groupe_id") || "0"));

  if (!groupeId) {
    throw new Error("Groupe invalide.");
  }

  const { data: codeRows, error: codeFetchError } = await supabaseServer
    .from("programme_dispatcher_history")
    .select("code")
    .eq("groupe_id", groupeId);

  if (codeFetchError) {
    throw new Error(codeFetchError.message);
  }

  const deletedCodes = new Set(
    ((codeRows as { code: string | null }[] | null) ?? [])
      .map((row) => row.code)
      .filter((code): code is string => Boolean(code))
  );

  const { error } = await supabaseServer
    .from("programme_dispatcher_history")
    .delete()
    .eq("groupe_id", groupeId);

  if (error) {
    throw new Error(error.message);
  }

  // Pas de lien direct (FK) entre l'historique PD et les lignes de
  // programme - on retrouve les lignes concernees via leurs codes presents
  // dans "numero_lot" (liste separee par virgules) et on les marque comme
  // terminees pour qu'elles disparaissent du Dashboard.
  if (deletedCodes.size > 0) {
    const matchingIds: number[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data: ligneRows, error: ligneFetchError } = await supabaseServer
        .from("programme_lignes")
        .select("id, numero_lot")
        .not("numero_lot", "is", null)
        .range(from, from + pageSize - 1);

      if (ligneFetchError) {
        throw new Error(ligneFetchError.message);
      }

      const chunk = (ligneRows as { id: number; numero_lot: string | null }[] | null) ?? [];
      for (const row of chunk) {
        const codes = (row.numero_lot || "").split(",").map((code) => code.trim()).filter(Boolean);
        if (codes.some((code) => deletedCodes.has(code))) {
          matchingIds.push(row.id);
        }
      }

      if (chunk.length < pageSize) break;
      from += pageSize;
    }

    if (matchingIds.length > 0) {
      const { error: updateError } = await supabaseServer
        .from("programme_lignes")
        .update({ programme_termine: true, programme_termine_date: new Date().toISOString() })
        .in("id", matchingIds);

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
