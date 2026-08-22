"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentStockUser, getUserPermissions, isAdminUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";

async function requireHistoriqueAccess() {
  const currentUser = await getCurrentStockUser();
  const isAdmin = isAdminUser(currentUser);
  const canManageUsers = isAdmin || (await getUserPermissions(currentUser)).manageUsers;

  if (!canManageUsers) {
    throw new Error("Acces reserve a la gestion des utilisateurs.");
  }

  return currentUser;
}

// Reinsere tel quel les lignes sauvegardees dans donnees_avant au moment
// d'une suppression (voir splitCommandeSnapshot / lotAvantSuppression dans
// app/commandes/actions.ts et lib/lot-stock-delete.ts) - les nouveaux id
// sont laisses a la base (jamais les anciens, deja libres/potentiellement
// repris par autre chose entretemps).
export async function restaurerAuditLogAction(formData: FormData) {
  const auditLogId = Number(String(formData.get("audit_log_id") || "0"));

  if (!auditLogId) {
    throw new Error("Entree invalide.");
  }

  const currentUser = await requireHistoriqueAccess();

  const { data: entry, error: fetchError } = await supabaseServer
    .from("audit_log")
    .select("id, module, action, cible, restaure, donnees_avant")
    .eq("id", auditLogId)
    .single();

  if (fetchError || !entry) {
    throw new Error(fetchError?.message || "Entree introuvable.");
  }

  if (entry.action !== "suppression") {
    throw new Error("Seule une suppression peut etre restauree.");
  }

  if (entry.restaure) {
    throw new Error("Deja restaure.");
  }

  if (!entry.donnees_avant) {
    throw new Error(
      "Aucune donnee sauvegardee pour cette suppression (entree du journal anterieure a l'ajout de la restauration)."
    );
  }

  let resumeRestauration = "";

  if (entry.module === "Commandes") {
    const commandes =
      (entry.donnees_avant as {
        commandes?: { commande: Record<string, unknown>; lignes: Record<string, unknown>[] }[];
      }).commandes ?? [];

    if (commandes.length === 0) {
      throw new Error("Rien a restaurer pour cette entree.");
    }

    for (const { commande, lignes } of commandes) {
      const { id: _oldCommandeId, ...commandeFields } = commande;

      const { data: inserted, error: insertError } = await supabaseServer
        .from("commandes")
        .insert(commandeFields)
        .select("id")
        .single();

      if (insertError || !inserted) {
        throw new Error(
          insertError?.message ||
            "Impossible de restaurer la commande (le numero de proforma existe peut-etre deja)."
        );
      }

      if (lignes.length > 0) {
        const lignesPayload = lignes.map((ligne) => {
          const { id: _oldLigneId, commande_id: _oldCommandeIdOnLigne, ...ligneFields } = ligne;
          return { ...ligneFields, commande_id: inserted.id };
        });

        const { error: lignesError } = await supabaseServer.from("commande_lignes").insert(lignesPayload);

        if (lignesError) {
          throw new Error(lignesError.message);
        }
      }
    }

    resumeRestauration = `Commande ${entry.cible || ""} restauree depuis l'historique`;
  } else if (entry.module === "Stock") {
    const lots = (entry.donnees_avant as { lots?: Record<string, unknown>[] }).lots ?? [];

    if (lots.length === 0) {
      throw new Error("Rien a restaurer pour cette entree.");
    }

    for (const lot of lots) {
      const { id: _oldLotId, ...lotFields } = lot;
      const { error: insertError } = await supabaseServer.from("lots_stock").insert(lotFields);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    resumeRestauration = `Lot ${entry.cible || ""} restaure dans le stock`;
  } else if (entry.module === "ProgrammeLignes") {
    const lignes = (entry.donnees_avant as { lignes?: Record<string, unknown>[] }).lignes ?? [];

    if (lignes.length === 0) {
      throw new Error("Rien a restaurer pour cette entree.");
    }

    const lignesPayload = lignes.map((ligne) => {
      const { id: _oldId, ...fields } = ligne;
      return fields;
    });

    const { error: insertError } = await supabaseServer.from("programme_lignes").insert(lignesPayload);

    if (insertError) {
      throw new Error(insertError.message);
    }

    resumeRestauration = `Programme ${entry.cible || ""} (${lignes.length} ligne(s)) restaure`;
  } else if (entry.module === "ProductionCartonEntries") {
    const entries = (entry.donnees_avant as { entries?: Record<string, unknown>[] }).entries ?? [];

    if (entries.length === 0) {
      throw new Error("Rien a restaurer pour cette entree.");
    }

    const entriesPayload = entries.map((row) => {
      const { id: _oldId, ...fields } = row;
      return fields;
    });

    const { error: insertError } = await supabaseServer.from("production_carton_entries").insert(entriesPayload);

    if (insertError) {
      throw new Error(insertError.message);
    }

    resumeRestauration = `Entree carton ${entry.cible || ""} restauree`;
  } else if (entry.module === "ProgrammeDispatcherLignes") {
    const lignes = (entry.donnees_avant as { lignes?: Record<string, unknown>[] }).lignes ?? [];

    if (lignes.length === 0) {
      throw new Error("Rien a restaurer pour cette entree.");
    }

    const lignesPayload = lignes.map((ligne) => {
      const { id: _oldId, ...fields } = ligne;
      return fields;
    });

    const { error: insertError } = await supabaseServer.from("programme_dispatcher_lignes").insert(lignesPayload);

    if (insertError) {
      throw new Error(insertError.message);
    }

    resumeRestauration = `Dispatch ${entry.cible || ""} (${lignes.length} ligne(s)) restaure`;
  } else if (entry.module === "ProgrammeDispatcherHistory") {
    const donnees = entry.donnees_avant as {
      historyLignes?: Record<string, unknown>[];
      lignesTermineesAvant?: { id: number; programme_termine: boolean | null; programme_termine_date: string | null }[];
    };
    const historyLignes = donnees.historyLignes ?? [];

    if (historyLignes.length === 0) {
      throw new Error("Rien a restaurer pour cette entree.");
    }

    const historyPayload = historyLignes.map((ligne) => {
      const { id: _oldId, groupe_id: _oldGroupeId, ...fields } = ligne;
      return fields;
    });

    const { data: inserted, error: insertError } = await supabaseServer
      .from("programme_dispatcher_history")
      .insert(historyPayload)
      .select("id");

    if (insertError) {
      throw new Error(insertError.message);
    }

    const insertedIds = ((inserted as { id: number }[] | null) ?? []).map((row) => row.id);
    if (insertedIds.length > 0) {
      const nouveauGroupeId = Math.min(...insertedIds);
      const { error: groupUpdateError } = await supabaseServer
        .from("programme_dispatcher_history")
        .update({ groupe_id: nouveauGroupeId })
        .in("id", insertedIds);

      if (groupUpdateError) {
        throw new Error(groupUpdateError.message);
      }
    }

    // Remet exactement l'etat programme_termine d'avant sur chaque ligne
    // source touchee (pas juste "false" - une ligne deja terminee pour une
    // autre raison avant cette suppression le redevient, pas l'inverse).
    for (const ligne of donnees.lignesTermineesAvant ?? []) {
      const { error: resetError } = await supabaseServer
        .from("programme_lignes")
        .update({
          programme_termine: ligne.programme_termine,
          programme_termine_date: ligne.programme_termine_date,
        })
        .eq("id", ligne.id);

      if (resetError) {
        throw new Error(resetError.message);
      }
    }

    resumeRestauration = `PD ${entry.cible || ""} (${historyLignes.length} ligne(s)) restaure`;
  } else {
    throw new Error("Restauration non disponible pour ce module.");
  }

  const { error: markError } = await supabaseServer
    .from("audit_log")
    .update({ restaure: true })
    .eq("id", auditLogId);

  if (markError) {
    throw new Error(markError.message);
  }

  await logAudit({
    utilisateur: currentUser,
    module: entry.module,
    action: "creation",
    cible: entry.cible,
    resume: resumeRestauration,
  });

  revalidatePath("/admin/historique");
  revalidatePath("/commandes");
  revalidatePath("/stock");
  revalidatePath("/historique-programme");
  revalidatePath("/historique-programme-dispatcher");
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
  revalidatePath("/");
}
