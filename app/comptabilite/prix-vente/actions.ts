"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { creerEcritureVente } from "@/app/commandes/actions";

async function requirePrixVenteWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les prix de vente.");
  }
}

// Recalcule l'ecriture Vente de chaque commande DEJA LIVREE qui contient cet
// article - demande explicite : un prix corrige/ajoute ne doit pas rester
// sans effet sur ce qui est deja parti tant que personne ne pense a aller
// cliquer "Traiter les ventes" sur Reconstituer l'historique. Jamais pour
// une commande pas encore livree (fifo_resultats existe des le dispatch,
// bien avant la livraison reelle - une vente ne doit jamais etre
// comptabilisee en avance).
async function recalculerEcrituresVentePourArticle(articleId: number, currentUser: string | null) {
  const { data: fifoRows } = await supabaseServer
    .from("fifo_resultats")
    .select("commande_id")
    .eq("article_id", articleId);

  const commandeIds = [
    ...new Set(((fifoRows ?? []) as { commande_id: number | null }[]).map((r) => r.commande_id).filter(Boolean)),
  ] as number[];
  if (commandeIds.length === 0) return;

  const { data: commandesLivrees } = await supabaseServer
    .from("commandes")
    .select("id")
    .in("id", commandeIds)
    .eq("statut", "LIVREE");

  const livreeIds = ((commandesLivrees ?? []) as { id: number }[]).map((c) => c.id);

  await Promise.all(
    livreeIds.map((id) =>
      creerEcritureVente(id, currentUser).catch((error) =>
        console.error(`Recalcul ecriture vente echoue (commande ${id}):`, error)
      )
    )
  );
}

// Appelees directement (pas via <form action>) depuis les composants
// client de la table - meme motif que les cellules editables ailleurs
// dans l'appli (ex: formation-month-cell) : renvoie {ok, message?} pour
// que la ligne revienne a son ancienne valeur en cas d'echec, sans jamais
// bloquer toute la page.
export async function updatePrixVenteAction(
  articleId: number,
  prix: number | null
): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await getCurrentStockUser();
    await requirePrixVenteWriteAccess();

    if (!articleId) {
      return { ok: false, message: "Article invalide." };
    }
    if (prix !== null && prix < 0) {
      return { ok: false, message: "Le prix ne peut pas etre negatif." };
    }

    const { error } = await supabaseServer.from("articles").update({ prix_vente: prix }).eq("id", articleId);

    if (error) {
      return { ok: false, message: error.message };
    }

    await recalculerEcrituresVentePourArticle(articleId, currentUser);

    revalidatePath("/comptabilite/prix-vente");
    revalidatePath("/comptabilite/balance");
    revalidatePath("/comptabilite/journal");
    revalidatePath("/clients");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function addPrixSpecialAction(
  articleId: number,
  clientId: number,
  prix: number
): Promise<{ ok: boolean; message?: string; id?: number }> {
  try {
    const currentUser = await getCurrentStockUser();
    await requirePrixVenteWriteAccess();

    if (!articleId || !clientId) {
      return { ok: false, message: "Article ou client invalide." };
    }
    if (!prix || prix < 0) {
      return { ok: false, message: "Prix invalide." };
    }

    const { data, error } = await supabaseServer
      .from("prix_vente_speciaux")
      .upsert({ article_id: articleId, client_id: clientId, prix }, { onConflict: "article_id,client_id" })
      .select("id")
      .single();

    if (error) {
      return { ok: false, message: error.message };
    }

    await recalculerEcrituresVentePourArticle(articleId, currentUser);

    revalidatePath("/comptabilite/prix-vente");
    revalidatePath("/comptabilite/balance");
    revalidatePath("/comptabilite/journal");
    revalidatePath("/clients");
    return { ok: true, id: (data as { id: number }).id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function deletePrixSpecialAction(id: number): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await getCurrentStockUser();
    await requirePrixVenteWriteAccess();

    if (!id) {
      return { ok: false, message: "Ligne invalide." };
    }

    const { data: special } = await supabaseServer
      .from("prix_vente_speciaux")
      .select("article_id")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseServer.from("prix_vente_speciaux").delete().eq("id", id);

    if (error) {
      return { ok: false, message: error.message };
    }

    if (special?.article_id) {
      await recalculerEcrituresVentePourArticle(special.article_id, currentUser);
    }

    revalidatePath("/comptabilite/prix-vente");
    revalidatePath("/comptabilite/balance");
    revalidatePath("/comptabilite/journal");
    revalidatePath("/clients");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}
