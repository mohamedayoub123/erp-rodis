"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { createTransferOrder } from "@/app/depots/transfer-order/actions";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "retoursConditionnement"))) {
    throw new Error("Cet utilisateur ne peut pas creer de retour de conditionnement.");
  }
  return currentUser;
}

type PendingReserveRow = {
  reserve_id: number;
  article_id: number;
  quantite: number;
};

// Cree un Transfer Order (statut "en attente", jamais auto-approuve/poste -
// meme convention deliberee que Programme Plastique : l'utilisateur
// approuve/poste lui-meme depuis les pages Depots normales) pour retourner
// vers le depot general le conditionnement (carton/flacon/capsule...)
// reserve mais jamais consomme pour un article dont la production est
// terminee. Marque ensuite chaque ligne de production_mp_reserve
// selectionnee a quantite=0 (jamais quantite_initiale, qui reste la trace de
// ce qui avait ete reserve a l'origine) - fait APRES la creation du Transfer
// Order, jamais avant : si createTransferOrder echoue (ex: stock insuffisant
// dans le depot source), rien ne doit etre marque retourne.
// Retourne {ok,message} au lieu de "throw" - meme regle que partout ailleurs
// dans cette session (Next.js efface le .message d'une Error jetee depuis
// une Server Action en production, meme catchee cote client).
export async function retournerConditionnementAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string; transferOrderId?: number }> {
  try {
    const currentUser = await requireWriteAccess();

    const depotSourceId = Number(formData.get("depot_source_id") || "0");
    const depotDestinationId = Number(formData.get("depot_destination_id") || "0");
    const dateJour = String(formData.get("date_jour") || "").trim() || new Date().toISOString().slice(0, 10);
    const pdLabel = String(formData.get("pd_label") || "").trim();

    const rawPayload = String(formData.get("payload") || "").trim();
    if (!rawPayload) {
      return { ok: false, message: "Aucune ligne selectionnee." };
    }

    let rows: PendingReserveRow[] = [];
    try {
      rows = JSON.parse(rawPayload) as PendingReserveRow[];
    } catch {
      return { ok: false, message: "Le contenu de la selection est invalide." };
    }

    const lignes = rows
      .map((row) => ({
        reserveId: Number(row.reserve_id),
        articleId: Number(row.article_id),
        quantite: Number(row.quantite),
      }))
      .filter((row) => row.reserveId > 0 && row.articleId > 0 && row.quantite > 0);

    if (lignes.length === 0) {
      return { ok: false, message: "Coche au moins une ligne a retourner." };
    }

    // Une ligne de Transfer Order par article (pas par ligne de reservation) -
    // plusieurs lots/codes du meme article dans la selection se regroupent en
    // une seule quantite demandee, meme principe que Programme Plastique.
    const quantiteParArticle = new Map<number, number>();
    for (const ligne of lignes) {
      quantiteParArticle.set(ligne.articleId, (quantiteParArticle.get(ligne.articleId) ?? 0) + ligne.quantite);
    }

    const transferOrderId = await createTransferOrder({
      depotSourceId,
      depotDestinationId,
      dateJour,
      creePar: currentUser,
      remarque: pdLabel ? `Retour conditionnement - ${pdLabel}` : "Retour conditionnement",
      lignes: [...quantiteParArticle.entries()].map(([articleId, quantite]) => ({
        articleType: "MP" as const,
        articleId,
        quantiteDemandee: quantite,
      })),
    });

    const { error: updateError } = await supabaseServer
      .from("production_mp_reserve")
      .update({ quantite: 0 })
      .in(
        "id",
        lignes.map((l) => l.reserveId)
      );

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath("/production/retours-conditionnement");
    revalidatePath("/depots/transfer-order");
    revalidatePath("/stock/matiere-premiere/stock");
    revalidatePath("/mouvements/matiere-premiere");

    return { ok: true, transferOrderId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Erreur pendant la creation du retour.",
    };
  }
}
