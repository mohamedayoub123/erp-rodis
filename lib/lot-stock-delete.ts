import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";

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
