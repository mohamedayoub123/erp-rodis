"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { type ArticleType, fetchLotsInDepot, totalAvailable, allocateFefo } from "./stock-lots";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les depots.");
  }

  return currentUser;
}

function parseArticleType(raw: FormDataEntryValue | undefined): ArticleType {
  return raw === "PF" ? "PF" : "MP";
}

// Une ligne par article demande (article_type[], article_id[],
// quantite_demandee[] - meme convention getAll() indexee que Programme). La
// quantite demandee ne peut pas depasser ce qui existe reellement dans le
// depot source pour cet article - verifie ici, pas seulement cote client.
export async function createTransferOrderAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const depotSourceId = Number(formData.get("depot_source_id") || "0");
  const depotDestinationId = Number(formData.get("depot_destination_id") || "0");
  const dateJour = String(formData.get("date_jour") || "").trim() || new Date().toISOString().slice(0, 10);

  if (!depotSourceId) {
    throw new Error("Choisis le depot source.");
  }
  if (!depotDestinationId) {
    throw new Error("Choisis le depot destination.");
  }
  if (depotSourceId === depotDestinationId) {
    throw new Error("Le depot destination doit etre different du depot source.");
  }

  const articleTypes = formData.getAll("article_type");
  const articleIds = formData.getAll("article_id");
  const quantites = formData.getAll("quantite_demandee");

  const lignes = articleIds
    .map((rawArticleId, index) => ({
      articleType: parseArticleType(articleTypes[index]),
      articleId: Number(rawArticleId || "0"),
      quantiteDemandee: Number(String(quantites[index] || "0").replace(",", ".")),
    }))
    .filter((ligne) => ligne.articleId > 0 && ligne.quantiteDemandee > 0);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins un article avec une quantite.");
  }

  for (const ligne of lignes) {
    const lots = await fetchLotsInDepot(ligne.articleType, ligne.articleId, depotSourceId);
    const disponible = totalAvailable(lots);
    if (ligne.quantiteDemandee > disponible + 1e-6) {
      throw new Error(
        `Stock insuffisant dans le depot source pour un des articles - disponible : ${disponible.toLocaleString("fr-FR")}.`
      );
    }
  }

  const { data: transferOrder, error: transferOrderError } = await supabaseServer
    .from("transfer_orders")
    .insert({
      depot_source_id: depotSourceId,
      depot_destination_id: depotDestinationId,
      date_jour: dateJour,
      cree_par: currentUser,
    })
    .select("id")
    .single();

  if (transferOrderError) {
    throw new Error(transferOrderError.message);
  }

  const transferOrderId = (transferOrder as { id: number }).id;

  const { error: lignesError } = await supabaseServer.from("transfer_order_lignes").insert(
    lignes.map((ligne) => ({
      transfer_order_id: transferOrderId,
      article_type: ligne.articleType,
      article_id: ligne.articleId,
      quantite_demandee: ligne.quantiteDemandee,
    }))
  );

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  revalidatePath("/depots/transfer-order");
  redirect(`/depots/transfer-order/${transferOrderId}`);
}

// L'approbation choisit automatiquement quel(s) lot(s) couvrent chaque
// ligne, en commencant par le lot dont la date d'expiration (MP) ou de
// fabrication (PF, a defaut) est la plus proche (FEFO) - voir allocateFefo.
// Rejoue proprement si deja approuve une fois (efface l'ancienne repartition
// avant de la regenerer), pour permettre un "reessayer" simple.
export async function approveTransferOrderAction(formData: FormData) {
  await requireWriteAccess();

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  const { data: transferOrderData, error: transferOrderError } = await supabaseServer
    .from("transfer_orders")
    .select("id, depot_source_id, statut")
    .eq("id", transferOrderId)
    .maybeSingle();

  if (transferOrderError || !transferOrderData) {
    throw new Error("Transfer Order introuvable.");
  }

  const transferOrder = transferOrderData as { id: number; depot_source_id: number; statut: string };

  if (transferOrder.statut === "poste") {
    throw new Error("Ce Transfer Order est deja poste vers un Invoice Order.");
  }

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, article_type, article_id, quantite_demandee")
    .eq("transfer_order_id", transferOrderId);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const lignes = (lignesData ?? []) as {
    id: number;
    article_type: ArticleType;
    article_id: number;
    quantite_demandee: number;
  }[];

  if (lignes.length === 0) {
    throw new Error("Aucune ligne a approuver.");
  }

  const ligneIds = lignes.map((ligne) => ligne.id);
  const { error: clearError } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .delete()
    .in("transfer_order_ligne_id", ligneIds);

  if (clearError) {
    throw new Error(clearError.message);
  }

  for (const ligne of lignes) {
    const lots = await fetchLotsInDepot(ligne.article_type, ligne.article_id, transferOrder.depot_source_id);
    const { allocations } = allocateFefo(lots, ligne.quantite_demandee);

    if (allocations.length === 0) continue;

    const { error: insertError } = await supabaseServer.from("transfer_order_ligne_lots").insert(
      allocations.map((allocation) => ({
        transfer_order_ligne_id: ligne.id,
        numero_lot: allocation.numero_lot || null,
        quantite: allocation.quantite,
      }))
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const { error: statutError } = await supabaseServer
    .from("transfer_orders")
    .update({ statut: "approuve" })
    .eq("id", transferOrderId);

  if (statutError) {
    throw new Error(statutError.message);
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
}

// Remplace la repartition par lot d'UNE ligne par celle saisie a la main -
// une case par lot disponible dans le depot source (voir le formulaire),
// seules les quantites non nulles sont gardees.
export async function updateLigneLotsAction(formData: FormData) {
  await requireWriteAccess();

  const ligneId = Number(formData.get("ligne_id") || "0");
  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!ligneId || !transferOrderId) {
    throw new Error("Ligne invalide.");
  }

  const numeroLots = formData.getAll("numero_lot");
  const quantites = formData.getAll("quantite");

  const allocations = numeroLots
    .map((numeroLot, index) => ({
      numero_lot: String(numeroLot || "") || null,
      quantite: Number(String(quantites[index] || "0").replace(",", ".")),
    }))
    .filter((allocation) => allocation.quantite > 0);

  const { error: deleteError } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .delete()
    .eq("transfer_order_ligne_id", ligneId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (allocations.length > 0) {
    const { error: insertError } = await supabaseServer.from("transfer_order_ligne_lots").insert(
      allocations.map((allocation) => ({
        transfer_order_ligne_id: ligneId,
        numero_lot: allocation.numero_lot,
        quantite: allocation.quantite,
      }))
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
}

// Cree l'Invoice Order a partir de ce Transfer Order approuve - le
// mouvement de stock reel n'a lieu qu'a sa validation (voir
// app/depots/invoice-order/actions.ts).
export async function postToInvoiceOrderAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  const { data: transferOrderData, error: transferOrderError } = await supabaseServer
    .from("transfer_orders")
    .select("id, statut")
    .eq("id", transferOrderId)
    .maybeSingle();

  if (transferOrderError || !transferOrderData) {
    throw new Error("Transfer Order introuvable.");
  }

  if ((transferOrderData as { statut: string }).statut !== "approuve") {
    throw new Error("Le Transfer Order doit etre approuve avant d'etre poste.");
  }

  const { data: inserted, error: insertError } = await supabaseServer
    .from("invoice_orders")
    .insert({ transfer_order_id: transferOrderId, cree_par: currentUser })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: statutError } = await supabaseServer
    .from("transfer_orders")
    .update({ statut: "poste" })
    .eq("id", transferOrderId);

  if (statutError) {
    throw new Error(statutError.message);
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
  revalidatePath("/depots/invoice-order");
  redirect(`/depots/invoice-order/${(inserted as { id: number }).id}`);
}
