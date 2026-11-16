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
    if (!(await canDeletePageUser(utilisateur, "productionPlastiqueCommandes"))) {
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

    return { ok: true, message: `Commande ${code} supprimee.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Suppression impossible." };
  }
}

// Retire UN article d'une commande (le reste de la commande ne change pas). Meme droit "Supprimer" que la suppression
// de la commande entiere. La colonne "A fabriquer" de Statistique Article Plastique (E3) est recalculee sans cette
// ligne : la quantite de cet article dans cette commande ne compte plus. La commande reste meme si c'etait son dernier
// article (elle se supprime alors avec son propre bouton).
export async function supprimerLigneCommandeArticlePlastiqueAction(ligneId: number): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canDeletePageUser(utilisateur, "productionPlastiqueCommandes"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas supprimer d'article d'une commande." };
    }
    if (!Number.isInteger(ligneId) || ligneId <= 0) return { ok: false, message: "Article invalide." };

    const { data: ligne, error } = await supabaseServer
      .from("commandes_article_plastique_lignes")
      .select("*")
      .eq("id", ligneId)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!ligne) return { ok: false, message: "Cet article n'est plus dans la commande. Recharge la page." };

    const { data: commande, error: commandeError } = await supabaseServer
      .from("commandes_article_plastique")
      .select("id, code, created_at, created_by")
      .eq("id", (ligne as { commande_id: number }).commande_id)
      .maybeSingle();
    if (commandeError) return { ok: false, message: commandeError.message };

    const { error: deleteError } = await supabaseServer
      .from("commandes_article_plastique_lignes")
      .delete()
      .eq("id", ligneId);
    if (deleteError) return { ok: false, message: deleteError.message };

    const code = (commande as { code: string } | null)?.code ?? "?";
    const nomArticle = (ligne as { nom_article: string }).nom_article;
    await logAudit({
      utilisateur,
      module: "CommandePlastique",
      action: "suppression",
      cible: code,
      resume: `Article ${nomArticle} retire de la commande article plastique ${code} (qt avis ${
        (ligne as { qt_avis: string | null }).qt_avis || "-"
      })`,
      avant: { commande, ligne },
    });

    revalidatePath("/production-plastique/commandes");
    revalidatePath(`/production-plastique/commandes/${code}`);
    revalidatePath("/production-plastique/statistique");

    return { ok: true, message: `${nomArticle} retire de la commande ${code}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Suppression impossible." };
  }
}
