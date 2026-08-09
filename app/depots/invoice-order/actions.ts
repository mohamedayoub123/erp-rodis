"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { stockTableFor, type ArticleType } from "../transfer-order/stock-lots";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les Transfer Invoice.");
  }

  return currentUser;
}

// Modifie les quantites livrees de TOUTES les lignes d'un Transfer Invoice en
// attente, en un seul "Enregistrer" (invoice_order_ligne_id[], quantite[] -
// meme convention getAll() que partout ailleurs). La quantite ne peut
// jamais depasser ce qui est deja reserve sur cette ligne (on peut livrer
// moins, jamais plus) - le reste redevient disponible sur le Transfer Order
// a la validation. Une ligne mise a 0 est effacee (rien n'est livre pour cet
// article dans ce Transfer Invoice).
export async function updateInvoiceOrderLignesAction(formData: FormData) {
  await requireWriteAccess();

  const invoiceOrderId = Number(formData.get("invoice_order_id") || "0");
  if (!invoiceOrderId) {
    throw new Error("Transfer Invoice invalide.");
  }

  const { data: invoiceOrderData, error: invoiceOrderError } = await supabaseServer
    .from("invoice_orders")
    .select("id, statut")
    .eq("id", invoiceOrderId)
    .maybeSingle();

  if (invoiceOrderError || !invoiceOrderData) {
    throw new Error("Transfer Invoice introuvable.");
  }
  if ((invoiceOrderData as { statut: string }).statut === "valide") {
    throw new Error("Cet Transfer Invoice est deja valide.");
  }

  const ligneIdsRaw = formData.getAll("invoice_order_ligne_id");
  const quantites = formData.getAll("quantite");

  const rows = ligneIdsRaw
    .map((raw, index) => ({
      id: Number(raw || "0"),
      quantite: Number(String(quantites[index] || "0").replace(",", ".")),
    }))
    .filter((r) => r.id > 0);

  if (rows.length === 0) {
    throw new Error("Aucune ligne a enregistrer.");
  }

  const { data: currentData, error: currentError } = await supabaseServer
    .from("invoice_order_lignes")
    .select("id, quantite")
    .in(
      "id",
      rows.map((r) => r.id)
    )
    .eq("invoice_order_id", invoiceOrderId);

  if (currentError) {
    throw new Error(currentError.message);
  }

  const currentById = new Map(
    ((currentData ?? []) as { id: number; quantite: number }[]).map((r) => [r.id, r.quantite])
  );

  const toDelete: number[] = [];
  const toUpdate: { id: number; quantite: number }[] = [];

  for (const row of rows) {
    const current = currentById.get(row.id);
    if (current === undefined) continue;
    const clamped = Math.max(0, Math.min(row.quantite, current));
    if (clamped <= 1e-9) {
      toDelete.push(row.id);
    } else {
      toUpdate.push({ id: row.id, quantite: Math.round(clamped * 1000) / 1000 });
    }
  }

  if (toDelete.length > 0) {
    const { error } = await supabaseServer.from("invoice_order_lignes").delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }

  for (const row of toUpdate) {
    const { error } = await supabaseServer
      .from("invoice_order_lignes")
      .update({ quantite: row.quantite })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/depots/invoice-order/${invoiceOrderId}`);
}

// La validation est le seul moment ou le stock bouge reellement : pour
// chaque ligne du Transfer Invoice (invoice_order_lignes - potentiellement
// reduites/effacees a la main avant validation), une ligne "sortie" est
// ecrite dans le depot source et une ligne "entree" dans le depot
// destination (meme numero_lot des 2 cotes, tracabilite conservee) - meme
// principe entree/sortie (jamais de solde modifie directement) que partout
// ailleurs dans l'appli. Ce qui n'a pas ete livre (quantite reduite ou ligne
// effacee) redevient disponible sur le Transfer Order source, qui repasse
// "partiellement_fini" pour permettre un nouveau "Poster a Transfer Invoice"
// plus tard sur le reste.
export async function validateInvoiceOrderAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

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

  const { data: invoiceLignesData, error: invoiceLignesError } = await supabaseServer
    .from("invoice_order_lignes")
    .select("id, transfer_order_ligne_id, numero_lot, quantite")
    .eq("invoice_order_id", invoiceOrderId);

  if (invoiceLignesError) {
    throw new Error(invoiceLignesError.message);
  }

  const invoiceLignes = (
    (invoiceLignesData ?? []) as {
      id: number;
      transfer_order_ligne_id: number;
      numero_lot: string | null;
      quantite: number;
    }[]
  ).filter((l) => l.quantite > 0);

  if (invoiceLignes.length === 0) {
    throw new Error("Aucune ligne a livrer - toutes les quantites sont a 0.");
  }

  const { data: allLignesData, error: allLignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, article_type, article_id")
    .eq("transfer_order_id", transferOrder.id);

  if (allLignesError) {
    throw new Error(allLignesError.message);
  }

  const ligneById = new Map(
    ((allLignesData ?? []) as { id: number; article_type: ArticleType; article_id: number }[]).map((l) => [l.id, l])
  );

  for (const invoiceLigne of invoiceLignes) {
    const ligne = ligneById.get(invoiceLigne.transfer_order_ligne_id);
    if (!ligne) continue;

    const table = stockTableFor(ligne.article_type);
    const notePrefix = "Transfer Order";

    const { error: sortieError } = await supabaseServer.from(table).insert({
      article_id: ligne.article_id,
      numero_lot: invoiceLigne.numero_lot,
      qte_entree: 0,
      qte_sortie: invoiceLigne.quantite,
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
      numero_lot: invoiceLigne.numero_lot,
      qte_entree: invoiceLigne.quantite,
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

  const ligneIds = [...ligneById.keys()];
  const { data: ligneLotsData, error: ligneLotsError } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .select("id, transfer_order_ligne_id, numero_lot, quantite")
    .in("transfer_order_ligne_id", ligneIds);

  if (ligneLotsError) {
    throw new Error(ligneLotsError.message);
  }

  const ligneLots = (ligneLotsData ?? []) as {
    id: number;
    transfer_order_ligne_id: number;
    numero_lot: string | null;
    quantite: number;
  }[];

  const shippedByKey = new Map<string, number>();
  for (const invoiceLigne of invoiceLignes) {
    const key = `${invoiceLigne.transfer_order_ligne_id}::${invoiceLigne.numero_lot ?? ""}`;
    shippedByKey.set(key, (shippedByKey.get(key) ?? 0) + invoiceLigne.quantite);
  }

  let resteSurLeTo = false;
  for (const ligneLot of ligneLots) {
    const key = `${ligneLot.transfer_order_ligne_id}::${ligneLot.numero_lot ?? ""}`;
    const livre = shippedByKey.get(key) ?? 0;
    const reste = Math.round((ligneLot.quantite - livre) * 1000) / 1000;

    if (reste > 1e-6) {
      resteSurLeTo = true;
      const { error } = await supabaseServer
        .from("transfer_order_ligne_lots")
        .update({ quantite: reste })
        .eq("id", ligneLot.id);
      if (error) throw new Error(error.message);
    } else if (livre > 0) {
      const { error } = await supabaseServer.from("transfer_order_ligne_lots").delete().eq("id", ligneLot.id);
      if (error) throw new Error(error.message);
    }
  }

  const { error: transferOrderStatutError } = await supabaseServer
    .from("transfer_orders")
    .update({ statut: resteSurLeTo ? "partiellement_fini" : "poste" })
    .eq("id", transferOrder.id);

  if (transferOrderStatutError) {
    throw new Error(transferOrderStatutError.message);
  }

  const { error: statutError } = await supabaseServer
    .from("invoice_orders")
    .update({ statut: "valide" })
    .eq("id", invoiceOrderId);

  if (statutError) {
    throw new Error(statutError.message);
  }

  revalidatePath(`/depots/invoice-order/${invoiceOrderId}`);
  revalidatePath(`/depots/transfer-order/${transferOrder.id}`);
  revalidatePath("/depots");
}
