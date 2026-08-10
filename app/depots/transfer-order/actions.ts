"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { type ArticleType, fetchLotsInDepot, totalAvailable, allocateFefo } from "./stock-lots";

// Appelee directement depuis TransferArticlePicker (pas liee a un <form>) -
// affiche en direct les lots/quantites reellement disponibles dans le
// depot source pendant la saisie, avant meme de creer le Transfer Order.
export async function fetchAvailableLotsAction(articleType: ArticleType, articleId: number, depotId: number) {
  if (!articleId || !depotId) return [];
  return fetchLotsInDepot(articleType, articleId, depotId);
}

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

// TO1.2026, TO2.2026... est fige a la creation (colonne numero) - jamais
// recalcule au rang comme avant, pour qu'une suppression ne decale plus les
// numeros des autres (meme principe deja utilise pour "MB" sur
// programmes.numero_programme) : le plus grand numero existant cette
// annee-la + 1.
async function nextTransferOrderNumero(dateJour: string): Promise<number> {
  const year = dateJour.slice(0, 4);
  const { data } = await supabaseServer
    .from("transfer_orders")
    .select("numero")
    .gte("date_jour", `${year}-01-01`)
    .lte("date_jour", `${year}-12-31`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { numero: number | null } | null)?.numero ?? 0) + 1;
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
      numero: await nextTransferOrderNumero(dateJour),
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
    throw new Error("Ce Transfer Order est deja poste vers un Transfer Invoice.");
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
    const lots = await fetchLotsInDepot(
      ligne.article_type,
      ligne.article_id,
      transferOrder.depot_source_id,
      transferOrderId
    );
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

// Remplace la repartition par lot de TOUTES les lignes d'un coup, depuis un
// seul tableau/un seul bouton "Enregistrer" (ligne_id[], numero_lot[],
// quantite[] - meme convention getAll() indexee que partout ailleurs dans
// l'appli) - le numero de lot reste modifiable a la main (pas fige aux lots
// deja connus). Chaque quantite est replafonnee ici au stock REELLEMENT
// disponible pour cet article/lot dans le depot source (jamais fait
// confiance au seul "max" du champ HTML, qui ne suit pas forcement le lot
// choisi si le lot a ete change dans la liste) - impossible de transferer
// plus que ce qui existe vraiment.
export async function updateAllLigneLotsAction(formData: FormData) {
  await requireWriteAccess();

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  const { data: transferOrderData, error: transferOrderError } = await supabaseServer
    .from("transfer_orders")
    .select("id, depot_source_id")
    .eq("id", transferOrderId)
    .maybeSingle();

  if (transferOrderError || !transferOrderData) {
    throw new Error("Transfer Order introuvable.");
  }
  const depotSourceId = (transferOrderData as { depot_source_id: number }).depot_source_id;

  const ligneIdsRaw = formData.getAll("ligne_id");
  const numeroLots = formData.getAll("numero_lot");
  const quantites = formData.getAll("quantite");

  const rows = ligneIdsRaw.map((ligneIdRaw, index) => ({
    ligneId: Number(ligneIdRaw || "0"),
    numeroLot: String(numeroLots[index] || "").trim() || null,
    quantite: Number(String(quantites[index] || "0").replace(",", ".")),
  }));

  const ligneIds = [...new Set(rows.map((r) => r.ligneId).filter((id) => id > 0))];
  if (ligneIds.length === 0) {
    throw new Error("Aucune ligne a enregistrer.");
  }

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, article_type, article_id")
    .in("id", ligneIds);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const ligneById = new Map(
    ((lignesData ?? []) as { id: number; article_type: ArticleType; article_id: number }[]).map((l) => [l.id, l])
  );

  const lotsCache = new Map<string, Awaited<ReturnType<typeof fetchLotsInDepot>>>();
  const allocations: typeof rows = [];

  for (const row of rows) {
    if (row.ligneId <= 0 || row.quantite <= 0) continue;
    const ligne = ligneById.get(row.ligneId);
    if (!ligne) continue;

    const cacheKey = `${ligne.article_type}::${ligne.article_id}`;
    let lots = lotsCache.get(cacheKey);
    if (!lots) {
      lots = await fetchLotsInDepot(ligne.article_type, ligne.article_id, depotSourceId, transferOrderId);
      lotsCache.set(cacheKey, lots);
    }

    const disponible = lots.find((l) => l.numeroLot === (row.numeroLot ?? ""))?.solde ?? 0;
    const quantite = Math.round(Math.min(row.quantite, disponible) * 1000) / 1000;
    if (quantite <= 0) continue;

    allocations.push({ ...row, quantite });
  }

  const { error: deleteError } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .delete()
    .in("transfer_order_ligne_id", ligneIds);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (allocations.length > 0) {
    const { error: insertError } = await supabaseServer.from("transfer_order_ligne_lots").insert(
      allocations.map((r) => ({
        transfer_order_ligne_id: r.ligneId,
        numero_lot: r.numeroLot,
        quantite: r.quantite,
      }))
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
}

// Cree un Transfer Invoice a partir de ce Transfer Order (approuve, ou
// partiellement fini si un Transfer Invoice precedent n'a livre qu'une
// partie) - reprend une photo des lots/quantites actuellement en attente sur
// le Transfer Order (transfer_order_ligne_lots) dans les propres lignes du
// Transfer Invoice (invoice_order_lignes), modifiables ensuite a la baisse
// avant validation. Le mouvement de stock reel n'a lieu qu'a la validation
// (voir app/depots/invoice-order/actions.ts).
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

  const transferOrderStatut = (transferOrderData as { statut: string }).statut;
  if (transferOrderStatut !== "approuve" && transferOrderStatut !== "partiellement_fini") {
    throw new Error("Le Transfer Order doit etre approuve avant d'etre poste.");
  }

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id")
    .eq("transfer_order_id", transferOrderId);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const ligneIds = ((lignesData ?? []) as { id: number }[]).map((l) => l.id);

  const { data: ligneLotsData, error: ligneLotsError } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .select("transfer_order_ligne_id, numero_lot, quantite")
    .in("transfer_order_ligne_id", ligneIds);

  if (ligneLotsError) {
    throw new Error(ligneLotsError.message);
  }

  const ligneLots = ((ligneLotsData ?? []) as { transfer_order_ligne_id: number; numero_lot: string | null; quantite: number }[]).filter(
    (l) => l.quantite > 0
  );

  if (ligneLots.length === 0) {
    throw new Error("Aucun lot en attente sur ce Transfer Order.");
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const year = dateJour.slice(0, 4);
  const { data: lastInvoiceOrder } = await supabaseServer
    .from("invoice_orders")
    .select("numero")
    .gte("date_jour", `${year}-01-01`)
    .lte("date_jour", `${year}-12-31`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numero = ((lastInvoiceOrder as { numero: number | null } | null)?.numero ?? 0) + 1;

  const { data: inserted, error: insertError } = await supabaseServer
    .from("invoice_orders")
    .insert({ transfer_order_id: transferOrderId, cree_par: currentUser, date_jour: dateJour, numero })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const invoiceOrderId = (inserted as { id: number }).id;

  const { error: lignesInsertError } = await supabaseServer.from("invoice_order_lignes").insert(
    ligneLots.map((l) => ({
      invoice_order_id: invoiceOrderId,
      transfer_order_ligne_id: l.transfer_order_ligne_id,
      numero_lot: l.numero_lot,
      quantite: l.quantite,
    }))
  );

  if (lignesInsertError) {
    throw new Error(lignesInsertError.message);
  }

  // Verrouille le Transfer Order (plus editable, plus re-postable) tant que
  // ce Transfer Invoice est en attente - evite qu'une modification des lots
  // pendant ce temps ne desynchronise la photo deja prise dans
  // invoice_order_lignes. Redevient editable (statut "partiellement_fini")
  // seulement si la validation de ce Transfer Invoice laisse un reste (voir
  // validateInvoiceOrderAction).
  const { error: statutError } = await supabaseServer
    .from("transfer_orders")
    .update({ statut: "poste" })
    .eq("id", transferOrderId);

  if (statutError) {
    throw new Error(statutError.message);
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
  revalidatePath("/depots/invoice-order");
  redirect(`/depots/invoice-order/${invoiceOrderId}`);
}

// Refuse de supprimer si le Transfer Invoice lie a deja ete valide - a ce
// stade le stock a deja reellement bouge (voir invoice-order/actions.ts),
// supprimer le Transfer Order effacerait la trace de ce mouvement sans
// l'annuler. Avant validation (pas encore poste, ou poste mais Transfer
// Invoice encore en draft), rien n'a touche au stock : suppression sure,
// avec ses lignes/lots et son eventuel Transfer Invoice draft associe.
export async function deleteTransferOrderAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de Transfer Order.");
  }

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  const { data: invoiceOrdersData, error: invoiceOrdersError } = await supabaseServer
    .from("invoice_orders")
    .select("id, statut")
    .eq("transfer_order_id", transferOrderId);

  if (invoiceOrdersError) {
    throw new Error(invoiceOrdersError.message);
  }

  const invoiceOrders = (invoiceOrdersData ?? []) as { id: number; statut: string }[];

  if (invoiceOrders.some((io) => io.statut === "valide")) {
    throw new Error(
      "Impossible de supprimer : un Transfer Invoice lie a deja ete valide, le stock a deja bouge."
    );
  }

  if (invoiceOrders.length > 0) {
    const { error: deleteInvoiceError } = await supabaseServer
      .from("invoice_orders")
      .delete()
      .in("id", invoiceOrders.map((io) => io.id));
    if (deleteInvoiceError) {
      throw new Error(deleteInvoiceError.message);
    }
  }

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id")
    .eq("transfer_order_id", transferOrderId);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const ligneIds = ((lignesData ?? []) as { id: number }[]).map((l) => l.id);

  if (ligneIds.length > 0) {
    const { error: deleteLigneLotsError } = await supabaseServer
      .from("transfer_order_ligne_lots")
      .delete()
      .in("transfer_order_ligne_id", ligneIds);
    if (deleteLigneLotsError) {
      throw new Error(deleteLigneLotsError.message);
    }
  }

  const { error: deleteLignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .delete()
    .eq("transfer_order_id", transferOrderId);
  if (deleteLignesError) {
    throw new Error(deleteLignesError.message);
  }

  const { error: deleteTransferOrderError } = await supabaseServer
    .from("transfer_orders")
    .delete()
    .eq("id", transferOrderId);
  if (deleteTransferOrderError) {
    throw new Error(deleteTransferOrderError.message);
  }

  revalidatePath("/depots/transfer-order");
  revalidatePath("/depots/invoice-order");
  redirect("/depots/transfer-order");
}
