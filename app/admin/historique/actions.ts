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
  revalidatePath("/");
}
