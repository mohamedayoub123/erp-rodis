"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { stockTableFor, type ArticleType } from "../transfer-order/stock-lots";

// La validation est le seul moment ou le stock bouge reellement : pour
// chaque lot de chaque ligne du Transfer Order source, une ligne "sortie"
// est ecrite dans le depot source et une ligne "entree" dans le depot
// destination (meme numero_lot des 2 cotes, tracabilite conservee) - meme
// principe entree/sortie (jamais de solde modifie directement) que partout
// ailleurs dans l'appli (lots_stock/lots_stock_matiere_premiere).
export async function validateInvoiceOrderAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas valider les Transfer Invoice.");
  }

  const invoiceOrderId = Number(formData.get("invoice_order_id") || "0");
  if (!invoiceOrderId) {
    throw new Error("Transfer Invoice invalide.");
  }

  const { data: invoiceOrderData, error: invoiceOrderError } = await supabaseServer
    .from("invoice_orders")
    .select("id, transfer_order_id, statut")
    .eq("id", invoiceOrderId)
    .maybeSingle();

  if (invoiceOrderError || !invoiceOrderData) {
    throw new Error("Transfer Invoice introuvable.");
  }

  const invoiceOrder = invoiceOrderData as { id: number; transfer_order_id: number; statut: string };

  if (invoiceOrder.statut === "valide") {
    throw new Error("Cet Transfer Invoice est deja valide.");
  }

  const { data: transferOrderData, error: transferOrderError } = await supabaseServer
    .from("transfer_orders")
    .select("id, depot_source_id, depot_destination_id, date_jour")
    .eq("id", invoiceOrder.transfer_order_id)
    .maybeSingle();

  if (transferOrderError || !transferOrderData) {
    throw new Error("Transfer Order source introuvable.");
  }

  const transferOrder = transferOrderData as {
    id: number;
    depot_source_id: number;
    depot_destination_id: number;
    date_jour: string;
  };

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, article_type, article_id")
    .eq("transfer_order_id", transferOrder.id);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const lignes = (lignesData ?? []) as { id: number; article_type: ArticleType; article_id: number }[];

  if (lignes.length === 0) {
    throw new Error("Aucune ligne a valider.");
  }

  const { data: ligneLotsData, error: ligneLotsError } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .select("transfer_order_ligne_id, numero_lot, quantite")
    .in(
      "transfer_order_ligne_id",
      lignes.map((ligne) => ligne.id)
    );

  if (ligneLotsError) {
    throw new Error(ligneLotsError.message);
  }

  const ligneLots = (ligneLotsData ?? []) as { transfer_order_ligne_id: number; numero_lot: string | null; quantite: number }[];

  if (ligneLots.length === 0) {
    throw new Error("Aucun lot n'a ete choisi - approuve d'abord le Transfer Order.");
  }

  const ligneById = new Map(lignes.map((ligne) => [ligne.id, ligne]));

  for (const allocation of ligneLots) {
    const ligne = ligneById.get(allocation.transfer_order_ligne_id);
    if (!ligne) continue;

    const table = stockTableFor(ligne.article_type);
    const notePrefix = "Transfer Order";

    const { error: sortieError } = await supabaseServer.from(table).insert({
      article_id: ligne.article_id,
      numero_lot: allocation.numero_lot,
      qte_entree: 0,
      qte_sortie: allocation.quantite,
      depot_id: transferOrder.depot_source_id,
      date_jour: transferOrder.date_jour,
      utilisateur: currentUser,
      note: notePrefix,
    });

    if (sortieError) {
      throw new Error(sortieError.message);
    }

    const { error: entreeError } = await supabaseServer.from(table).insert({
      article_id: ligne.article_id,
      numero_lot: allocation.numero_lot,
      qte_entree: allocation.quantite,
      qte_sortie: 0,
      depot_id: transferOrder.depot_destination_id,
      date_jour: transferOrder.date_jour,
      utilisateur: currentUser,
      note: notePrefix,
    });

    if (entreeError) {
      throw new Error(entreeError.message);
    }
  }

  const { error: statutError } = await supabaseServer
    .from("invoice_orders")
    .update({ statut: "valide" })
    .eq("id", invoiceOrderId);

  if (statutError) {
    throw new Error(statutError.message);
  }

  revalidatePath(`/depots/invoice-order/${invoiceOrderId}`);
  revalidatePath("/depots");
}
