"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";

type Reponse = { ok: true; message: string } | { ok: false; message: string };

// Supprime une commande Article Plastique et ses lignes (cascade). La colonne
// "A fabriquer" de Statistique Article Plastique suit la derniere commande
// restante. Retourne {ok, message} : Next.js efface le message d'une Error jetee
// depuis une Server Action en production.
export async function supprimerCommandeArticlePlastiqueAction(commandeId: number): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canDeletePageUser(utilisateur, "productionPlastique"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas supprimer de commande." };
    }
    if (!Number.isInteger(commandeId) || commandeId <= 0) return { ok: false, message: "Commande invalide." };

    const { data: commande, error } = await supabaseServer
      .from("commandes_article_plastique")
      .select("id, code, created_at, created_by")
      .eq("id", commandeId)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!commande) return { ok: false, message: "Cette commande n'existe plus. Recharge la page." };

    // Photo avant suppression : garde dans l'historique de quoi retrouver la commande
    const { data: lignes } = await supabaseServer
      .from("commandes_article_plastique_lignes")
      .select("*")
      .eq("commande_id", commandeId);

    const { error: lignesError } = await supabaseServer
      .from("commandes_article_plastique_lignes")
      .delete()
      .eq("commande_id", commandeId);
    if (lignesError) return { ok: false, message: lignesError.message };

    const { error: deleteError } = await supabaseServer
      .from("commandes_article_plastique")
      .delete()
      .eq("id", commandeId);
    if (deleteError) return { ok: false, message: deleteError.message };

    const code = (commande as { code: string }).code;
    await logAudit({
      utilisateur,
      module: "CommandePlastique",
      action: "suppression",
      cible: code,
      resume: `Commande article plastique ${code} supprimee (${lignes?.length ?? 0} article(s))`,
      avant: { commande, lignes: lignes ?? [] },
    });

    revalidatePath("/production-plastique/commandes");
    revalidatePath("/production-plastique/statistique");
    revalidatePath("/stock/matiere-premiere/rapport/plastique");

    return { ok: true, message: `Commande ${code} supprimee.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Suppression impossible." };
  }
}
