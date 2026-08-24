"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchLotsInDepot, allocateFefo } from "@/app/depots/transfer-order/stock-lots";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "facturationBl"))) {
    throw new Error("Cet utilisateur ne peut pas modifier de Bon de Livraison.");
  }
  return currentUser;
}

async function nextBonLivraisonNumero(dateJour: string): Promise<number> {
  const year = dateJour.slice(0, 4);
  const { data } = await supabaseServer
    .from("bons_livraison")
    .select("numero")
    .gte("date_jour", `${year}-01-01`)
    .lte("date_jour", `${year}-12-31`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { numero: number | null } | null)?.numero ?? 0) + 1;
}

// Etape 1/4 du cycle BL : cree juste le DOCUMENT (statut "brouillon"),
// copie les lignes demandees telles quelles - aucun mouvement de stock ici,
// le stock n'est verifie qu'a "Calculer FIFO" et sorti qu'a "Livrer".
export async function createBonLivraisonAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const commandeId = Number(formData.get("commande_id") || "0");
  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const { data: existingBl } = await supabaseServer
    .from("bons_livraison")
    .select("id")
    .eq("commande_id", commandeId)
    .maybeSingle();
  if (existingBl) {
    throw new Error("Un Bon de Livraison existe deja pour cette commande.");
  }

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("facturation_commande_lignes")
    .select("article_id, quantite_demandee")
    .eq("commande_id", commandeId);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const lignes = (lignesData ?? []) as { article_id: number; quantite_demandee: number }[];
  if (lignes.length === 0) {
    throw new Error("Cette commande n'a aucune ligne.");
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const numero = await nextBonLivraisonNumero(dateJour);

  const { data: inserted, error: insertError } = await supabaseServer
    .from("bons_livraison")
    .insert({ numero, date_jour: dateJour, commande_id: commandeId, statut: "brouillon", cree_par: currentUser })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message || "Impossible de creer le Bon de Livraison.");
  }

  const { error: blLignesError } = await supabaseServer.from("bon_livraison_lignes").insert(
    lignes.map((l) => ({ bon_livraison_id: inserted.id, article_id: l.article_id, quantite_demandee: l.quantite_demandee }))
  );

  if (blLignesError) {
    throw new Error(blLignesError.message);
  }

  revalidatePath("/facturation/commande");
  revalidatePath("/facturation/bl");
  redirect(`/facturation/bl/${inserted.id}`);
}

async function requireBl(bonLivraisonId: number) {
  const { data } = await supabaseServer
    .from("bons_livraison")
    .select("id, commande_id, statut")
    .eq("id", bonLivraisonId)
    .maybeSingle();
  const bl = data as { id: number; commande_id: number; statut: string } | null;
  if (!bl) {
    throw new Error("Bon de Livraison introuvable.");
  }
  return bl;
}

// Etape 2/4 : Apurement - confirme/verrouille le BL (simple transition de
// statut, aucun mouvement de stock) avant de passer au dispatch FIFO.
export async function apurerBonLivraisonAction(formData: FormData) {
  await requireWriteAccess();

  const bonLivraisonId = Number(formData.get("bon_livraison_id") || "0");
  if (!bonLivraisonId) {
    throw new Error("Bon de Livraison invalide.");
  }

  const bl = await requireBl(bonLivraisonId);
  if (bl.statut !== "brouillon") {
    throw new Error("Ce Bon de Livraison est deja apure.");
  }

  const { error } = await supabaseServer.from("bons_livraison").update({ statut: "apure" }).eq("id", bonLivraisonId);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/facturation/bl/${bonLivraisonId}`);
  revalidatePath("/facturation/bl");
}

// Etape 3/4 : FIFO - repartit chaque ligne sur les lots reellement
// disponibles au depot source de la commande (FEFO, meme fetchLotsInDepot/
// allocateFefo que Transfer Order) - AUCUN mouvement de stock ecrit ici,
// juste le resultat du dispatch (bl_fifo_resultats). Refuse si le stock
// disponible ne couvre pas une ligne, plutot que de livrer un manque
// silencieusement.
export async function calculerFifoBonLivraisonAction(formData: FormData) {
  await requireWriteAccess();

  const bonLivraisonId = Number(formData.get("bon_livraison_id") || "0");
  if (!bonLivraisonId) {
    throw new Error("Bon de Livraison invalide.");
  }

  const bl = await requireBl(bonLivraisonId);
  if (bl.statut !== "apure") {
    throw new Error("Ce Bon de Livraison doit d'abord etre apure.");
  }

  const { data: commandeData } = await supabaseServer
    .from("facturation_commandes")
    .select("depot_source_id")
    .eq("id", bl.commande_id)
    .maybeSingle();
  const depotSourceId = (commandeData as { depot_source_id: number } | null)?.depot_source_id;
  if (!depotSourceId) {
    throw new Error("Depot source introuvable pour la commande liee.");
  }

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("bon_livraison_lignes")
    .select("id, article_id, quantite_demandee")
    .eq("bon_livraison_id", bonLivraisonId);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const lignes = (lignesData ?? []) as { id: number; article_id: number; quantite_demandee: number }[];

  const resultats: { bon_livraison_id: number; bon_livraison_ligne_id: number; article_id: number; numero_lot: string | null; quantite_chargee: number }[] = [];

  for (const ligne of lignes) {
    const lots = await fetchLotsInDepot("PF", ligne.article_id, depotSourceId);
    const { allocations, covered } = allocateFefo(lots, ligne.quantite_demandee);

    if (!covered) {
      throw new Error(
        `Stock insuffisant pour couvrir la ligne article #${ligne.article_id} (demande ${ligne.quantite_demandee}) dans ce depot.`
      );
    }

    for (const allocation of allocations) {
      resultats.push({
        bon_livraison_id: bonLivraisonId,
        bon_livraison_ligne_id: ligne.id,
        article_id: ligne.article_id,
        numero_lot: allocation.numero_lot || null,
        quantite_chargee: allocation.quantite,
      });
    }
  }

  // Rejouable (efface + recree) si "Apurer" a ete annule/refait entretemps.
  await supabaseServer.from("bl_fifo_resultats").delete().eq("bon_livraison_id", bonLivraisonId);

  if (resultats.length > 0) {
    const { error: insertError } = await supabaseServer.from("bl_fifo_resultats").insert(resultats);
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const { error: statutError } = await supabaseServer
    .from("bons_livraison")
    .update({ statut: "fifo_fait" })
    .eq("id", bonLivraisonId);
  if (statutError) {
    throw new Error(statutError.message);
  }

  revalidatePath(`/facturation/bl/${bonLivraisonId}`);
}

// Etape 4/4 : Livraison - LE stock sort reellement ici (qte_sortie dans
// lots_stock, meme mouvement entree/sortie que partout ailleurs dans
// l'appli, jamais un solde modifie directement), a partir du dispatch FIFO
// deja calcule. Une fois livree, le BL peut passer en Facture.
export async function livrerBonLivraisonAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const bonLivraisonId = Number(formData.get("bon_livraison_id") || "0");
  if (!bonLivraisonId) {
    throw new Error("Bon de Livraison invalide.");
  }

  const bl = await requireBl(bonLivraisonId);
  if (bl.statut !== "fifo_fait") {
    throw new Error("Le dispatch FIFO doit d'abord etre calcule.");
  }

  const { data: commandeData } = await supabaseServer
    .from("facturation_commandes")
    .select("depot_source_id")
    .eq("id", bl.commande_id)
    .maybeSingle();
  const depotSourceId = (commandeData as { depot_source_id: number } | null)?.depot_source_id;
  if (!depotSourceId) {
    throw new Error("Depot source introuvable pour la commande liee.");
  }

  const { data: fifoData, error: fifoError } = await supabaseServer
    .from("bl_fifo_resultats")
    .select("article_id, numero_lot, quantite_chargee")
    .eq("bon_livraison_id", bonLivraisonId);

  if (fifoError) {
    throw new Error(fifoError.message);
  }

  const fifoRows = (fifoData ?? []) as { article_id: number; numero_lot: string | null; quantite_chargee: number }[];
  if (fifoRows.length === 0) {
    throw new Error("Aucun resultat FIFO a livrer.");
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const blLabel = `BL.${dateJour.slice(0, 4)}.${bonLivraisonId}`;

  const { error: sortieError } = await supabaseServer.from("lots_stock").insert(
    fifoRows.map((row) => ({
      article_id: row.article_id,
      numero_lot: row.numero_lot,
      qte_entree: 0,
      qte_sortie: row.quantite_chargee,
      depot_id: depotSourceId,
      date_jour: dateJour,
      utilisateur: currentUser,
      note: `${blLabel} - Livraison Facturation`,
    }))
  );

  if (sortieError) {
    throw new Error(sortieError.message);
  }

  const { error: statutError } = await supabaseServer
    .from("bons_livraison")
    .update({ statut: "livree" })
    .eq("id", bonLivraisonId);
  if (statutError) {
    throw new Error(statutError.message);
  }

  revalidatePath(`/facturation/bl/${bonLivraisonId}`);
  revalidatePath("/facturation/bl");
  revalidatePath("/stock");
}

async function deleteBonLivraison(bonLivraisonId: number): Promise<void> {
  const bl = await requireBl(bonLivraisonId);

  if (bl.statut !== "brouillon") {
    throw new Error(
      "Impossible de supprimer : ce Bon de Livraison est deja apure (FIFO/Livraison peuvent deja avoir bouge). Seul un BL encore en brouillon peut etre supprime."
    );
  }

  const { data: facture } = await supabaseServer
    .from("factures")
    .select("id")
    .eq("bon_livraison_id", bonLivraisonId)
    .maybeSingle();
  if (facture) {
    throw new Error("Impossible de supprimer : une Facture existe deja pour ce Bon de Livraison.");
  }

  const { error } = await supabaseServer.from("bons_livraison").delete().eq("id", bonLivraisonId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteBonLivraisonAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "facturationBl"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de Bon de Livraison.");
  }

  const bonLivraisonId = Number(formData.get("bon_livraison_id") || "0");
  if (!bonLivraisonId) {
    throw new Error("Bon de Livraison invalide.");
  }

  try {
    await deleteBonLivraison(bonLivraisonId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant la suppression.";
    redirect(`/facturation/bl/${bonLivraisonId}?avertissement=${encodeURIComponent(message)}`);
  }

  revalidatePath("/facturation/bl");
  revalidatePath("/facturation/commande");
  redirect("/facturation/bl");
}
