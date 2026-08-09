"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
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

// Efface une seule ligne du Transfer Invoice en attente (icone Supprimer par
// ligne) - equivalent a la mettre a 0 dans "Enregistrer", mais en un clic.
// Le montant efface redevient disponible sur le Transfer Order a la
// validation.
export async function deleteInvoiceOrderLigneAction(formData: FormData) {
  await requireWriteAccess();

  const invoiceOrderLigneId = Number(formData.get("delete_invoice_order_ligne_id") || "0");
  if (!invoiceOrderLigneId) {
    throw new Error("Ligne invalide.");
  }

  const { data: ligneData, error: ligneError } = await supabaseServer
    .from("invoice_order_lignes")
    .select("id, invoice_order_id")
    .eq("id", invoiceOrderLigneId)
    .maybeSingle();

  if (ligneError || !ligneData) {
    throw new Error("Ligne introuvable.");
  }

  const invoiceOrderId = (ligneData as { invoice_order_id: number }).invoice_order_id;

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

  const { error: deleteError } = await supabaseServer
    .from("invoice_order_lignes")
    .delete()
    .eq("id", invoiceOrderLigneId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  revalidatePath(`/depots/invoice-order/${invoiceOrderId}`);
}

// Supprime un Transfer Invoice (icone Supprimer) - meme deja Approuve : dans
// ce cas, annule d'abord reellement son mouvement de stock (efface
// precisement les 2 lignes sortie/entree creees a la validation via
// sortie_lot_id/entree_lot_id, puis redonne la quantite livree au Transfer
// Order). Redonne au Transfer Order son etat editable : "partiellement_fini"
// si un AUTRE Transfer Invoice est encore valide pour ce Transfer Order
// (livraison partielle deja faite ailleurs), sinon "approuve" (plus aucune
// livraison en cours).
export async function deleteInvoiceOrderAction(formData: FormData) {
  if (!(await canDeletePageUser(await getCurrentStockUser(), "depots"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de Transfer Invoice.");
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
    const { data: invoiceLignesData, error: invoiceLignesError } = await supabaseServer
      .from("invoice_order_lignes")
      .select("id, transfer_order_ligne_id, numero_lot, quantite, sortie_lot_id, entree_lot_id")
      .eq("invoice_order_id", invoiceOrderId);

    if (invoiceLignesError) {
      throw new Error(invoiceLignesError.message);
    }

    const invoiceLignes = (invoiceLignesData ?? []) as {
      id: number;
      transfer_order_ligne_id: number;
      numero_lot: string | null;
      quantite: number;
      sortie_lot_id: number | null;
      entree_lot_id: number | null;
    }[];

    const { data: allLignesData, error: allLignesError } = await supabaseServer
      .from("transfer_order_lignes")
      .select("id, article_type")
      .eq("transfer_order_id", invoiceOrder.transfer_order_id);

    if (allLignesError) {
      throw new Error(allLignesError.message);
    }

    const articleTypeByLigneId = new Map(
      ((allLignesData ?? []) as { id: number; article_type: ArticleType }[]).map((l) => [l.id, l.article_type])
    );

    for (const ligne of invoiceLignes) {
      const articleType = articleTypeByLigneId.get(ligne.transfer_order_ligne_id);
      if (articleType) {
        const table = stockTableFor(articleType);
        const lotIds = [ligne.sortie_lot_id, ligne.entree_lot_id].filter((id): id is number => id !== null);
        if (lotIds.length > 0) {
          const { error } = await supabaseServer.from(table).delete().in("id", lotIds);
          if (error) throw new Error(error.message);
        }
      }

      let existingQuery = supabaseServer
        .from("transfer_order_ligne_lots")
        .select("id, quantite")
        .eq("transfer_order_ligne_id", ligne.transfer_order_ligne_id);
      existingQuery =
        ligne.numero_lot === null ? existingQuery.is("numero_lot", null) : existingQuery.eq("numero_lot", ligne.numero_lot);
      const { data: existingLigneLot, error: existingLigneLotError } = await existingQuery.maybeSingle();

      if (existingLigneLotError) {
        throw new Error(existingLigneLotError.message);
      }

      if (existingLigneLot) {
        const row = existingLigneLot as { id: number; quantite: number };
        const { error } = await supabaseServer
          .from("transfer_order_ligne_lots")
          .update({ quantite: row.quantite + ligne.quantite })
          .eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseServer.from("transfer_order_ligne_lots").insert({
          transfer_order_ligne_id: ligne.transfer_order_ligne_id,
          numero_lot: ligne.numero_lot,
          quantite: ligne.quantite,
        });
        if (error) throw new Error(error.message);
      }
    }
  }

  const { error: deleteError } = await supabaseServer.from("invoice_orders").delete().eq("id", invoiceOrderId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { data: autresValidesData, error: autresValidesError } = await supabaseServer
    .from("invoice_orders")
    .select("id")
    .eq("transfer_order_id", invoiceOrder.transfer_order_id)
    .eq("statut", "valide")
    .limit(1);

  if (autresValidesError) {
    throw new Error(autresValidesError.message);
  }

  const dejaLivrePartiellement = ((autresValidesData ?? []) as { id: number }[]).length > 0;

  const { error: statutError } = await supabaseServer
    .from("transfer_orders")
    .update({ statut: dejaLivrePartiellement ? "partiellement_fini" : "approuve" })
    .eq("id", invoiceOrder.transfer_order_id);

  if (statutError) {
    throw new Error(statutError.message);
  }

  revalidatePath("/depots/invoice-order");
  revalidatePath(`/depots/transfer-order/${invoiceOrder.transfer_order_id}`);
  redirect("/depots/invoice-order");
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

    const { data: sortieRow, error: sortieError } = await supabaseServer
      .from(table)
      .insert({
        article_id: ligne.article_id,
        numero_lot: invoiceLigne.numero_lot,
        qte_entree: 0,
        qte_sortie: invoiceLigne.quantite,
        depot_id: transferOrder.depot_source_id,
        date_jour: transferOrder.date_jour,
        utilisateur: currentUser,
        note: notePrefix,
      })
      .select("id")
      .single();

    if (sortieError) {
      throw new Error(sortieError.message);
    }

    const { data: entreeRow, error: entreeError } = await supabaseServer
      .from(table)
      .insert({
        article_id: ligne.article_id,
        numero_lot: invoiceLigne.numero_lot,
        qte_entree: invoiceLigne.quantite,
        qte_sortie: 0,
        depot_id: transferOrder.depot_destination_id,
        date_jour: transferOrder.date_jour,
        utilisateur: currentUser,
        note: notePrefix,
      })
      .select("id")
      .single();

    if (entreeError) {
      throw new Error(entreeError.message);
    }

    // Garde la reference des 2 lignes de stock exactement creees ici - seul
    // moyen de pouvoir annuler proprement ce mouvement si ce Transfer
    // Invoice est supprime plus tard (voir deleteInvoiceOrderAction).
    const { error: linkError } = await supabaseServer
      .from("invoice_order_lignes")
      .update({
        sortie_lot_id: (sortieRow as { id: number }).id,
        entree_lot_id: (entreeRow as { id: number }).id,
      })
      .eq("id", invoiceLigne.id);

    if (linkError) {
      throw new Error(linkError.message);
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
