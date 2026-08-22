import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import { recalculerEcritureEntreeProduction } from "@/app/mouvements/produit-fini/entree-production/actions";

export async function deleteLotStockCore(lotId: number) {
  if (!lotId) {
    throw new Error("Ligne stock invalide.");
  }

  const { data: lotAvantSuppression } = await supabaseServer
    .from("lots_stock")
    .select("*, articles(nom_article)")
    .eq("id", lotId)
    .maybeSingle();

  const { error } = await supabaseServer.rpc("stock_delete_lot", { p_lot_id: lotId });

  if (error) {
    throw new Error(error.message);
  }

  // Sans ca, l'ecriture comptable "entree_production" de ce mouvement
  // restait dans le Journal apres suppression de sa source (meme bug deja
  // corrige pour Fabrication/Conditionnement - voir deleteSuiviProductionRowAction).
  // Uniquement pour les lignes venues de ce flux precis (source_import) - un
  // recalcul aveugle sur n'importe quel mouvement_groupe_id creerait a tort
  // une ecriture "entree_production" pour un mouvement qui n'en a jamais eu.
  const lot = lotAvantSuppression as
    | { source_import: string | null; mouvement_groupe_id: number | null; article_id: number | null }
    | null;
  if (lot?.source_import === "web:entree-production" && lot.mouvement_groupe_id && lot.article_id) {
    try {
      await recalculerEcritureEntreeProduction(lot.mouvement_groupe_id, lot.article_id, await getCurrentStockUser());
    } catch (comptaError) {
      console.error("Recalcul ecriture entree production echoue:", comptaError);
    }
  }

  const articleRelation = lotAvantSuppression?.articles as
    | { nom_article?: string | null }
    | { nom_article?: string | null }[]
    | null
    | undefined;
  const nomArticle = Array.isArray(articleRelation) ? articleRelation[0]?.nom_article : articleRelation?.nom_article;
  const code = lotAvantSuppression?.numero_lot || lotAvantSuppression?.code_normalise || `#${lotId}`;
  const { articles: _articles, ...lotSnapshot } = lotAvantSuppression ?? {};

  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "Stock",
    action: "suppression",
    cible: code,
    resume: `Lot ${code}${nomArticle ? ` (${nomArticle})` : ""} supprime du stock`,
    avant: lotAvantSuppression ? { lots: [lotSnapshot] } : null,
  });

  revalidatePath("/stock");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/dashboard");
  revalidatePath("/stock-dormant");
  revalidatePath("/stock-dormant-sans-commande");
  revalidatePath("/fifo");
  revalidatePath("/admin");
  revalidatePath("/");
}
