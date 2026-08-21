"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requirePrixVenteWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les prix de vente.");
  }
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

    revalidatePath("/comptabilite/prix-vente");
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

    revalidatePath("/comptabilite/prix-vente");
    return { ok: true, id: (data as { id: number }).id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function deletePrixSpecialAction(id: number): Promise<{ ok: boolean; message?: string }> {
  try {
    await requirePrixVenteWriteAccess();

    if (!id) {
      return { ok: false, message: "Ligne invalide." };
    }

    const { error } = await supabaseServer.from("prix_vente_speciaux").delete().eq("id", id);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/comptabilite/prix-vente");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}
