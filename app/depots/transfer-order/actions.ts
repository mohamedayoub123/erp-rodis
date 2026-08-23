"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { type ArticleType, fetchLotsInDepot, totalAvailable, allocateFefo } from "./stock-lots";
import { deleteInvoiceOrder } from "../invoice-order/actions";

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

// Coeur de la creation, sans permission ni redirect - reutilise par
// createTransferOrderAction (UI normale, verifie "depots") ET par tout appel
// interne qui a deja verifie sa propre permission ailleurs (ex: programme
// plastique, qui cree son stock ET son Transfer Order en une seule action
// sous la permission "productionPlastique" plutot que "depots"). La quantite
// demandee ne peut pas depasser ce qui existe reellement dans le depot
// source pour cet article - verifie ici, pas seulement cote client.
export async function createTransferOrder(params: {
  depotSourceId: number;
  depotDestinationId: number;
  dateJour: string;
  creePar: string | null;
  remarque?: string | null;
  lignes: { articleType: ArticleType; articleId: number; quantiteDemandee: number }[];
}): Promise<number> {
  const { depotSourceId, depotDestinationId, dateJour, creePar, remarque, lignes } = params;

  if (!depotSourceId) {
    throw new Error("Choisis le depot source.");
  }
  if (!depotDestinationId) {
    throw new Error("Choisis le depot destination.");
  }
  if (depotSourceId === depotDestinationId) {
    throw new Error("Le depot destination doit etre different du depot source.");
  }

  const lignesValides = lignes.filter((ligne) => ligne.articleId > 0 && ligne.quantiteDemandee > 0);

  if (lignesValides.length === 0) {
    throw new Error("Ajoute au moins un article avec une quantite.");
  }

  for (const ligne of lignesValides) {
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
      cree_par: creePar,
      numero: await nextTransferOrderNumero(dateJour),
      remarque: remarque || null,
    })
    .select("id")
    .single();

  if (transferOrderError) {
    throw new Error(transferOrderError.message);
  }

  const transferOrderId = (transferOrder as { id: number }).id;

  const { error: lignesError } = await supabaseServer.from("transfer_order_lignes").insert(
    lignesValides.map((ligne) => ({
      transfer_order_id: transferOrderId,
      article_type: ligne.articleType,
      article_id: ligne.articleId,
      quantite_demandee: ligne.quantiteDemandee,
    }))
  );

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  return transferOrderId;
}

// Une ligne par article demande (article_type[], article_id[],
// quantite_demandee[] - meme convention getAll() indexee que Programme).
// Le formulaire de creation est un <form action={...}> natif (pas de
// client-side try/catch) - une Error jetee ici et non rattrapee arrive donc
// telle quelle jusqu'au boundary d'erreur de Next.js, qui EFFACE son
// .message en production (meme piege que partout ailleurs dans cette
// session). Rattrape ici et redirige avec le vrai message dans
// ?avertissement=... (section deja prevue sur cette page, jusqu'ici jamais
// alimentee) plutot que de laisser planter le rendu.
export async function createTransferOrderAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const depotSourceId = Number(formData.get("depot_source_id") || "0");
  const depotDestinationId = Number(formData.get("depot_destination_id") || "0");
  const dateJour = String(formData.get("date_jour") || "").trim() || new Date().toISOString().slice(0, 10);

  const articleTypes = formData.getAll("article_type");
  const articleIds = formData.getAll("article_id");
  const quantites = formData.getAll("quantite_demandee");

  const lignes = articleIds.map((rawArticleId, index) => ({
    articleType: parseArticleType(articleTypes[index]),
    articleId: Number(rawArticleId || "0"),
    quantiteDemandee: Number(String(quantites[index] || "0").replace(",", ".")),
  }));

  let transferOrderId: number;
  try {
    transferOrderId = await createTransferOrder({
      depotSourceId,
      depotDestinationId,
      dateJour,
      creePar: currentUser,
      remarque: String(formData.get("remarque") || "").trim() || null,
      lignes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant la creation du Transfer Order.";
    redirect(`/depots/transfer-order?avertissement=${encodeURIComponent(message)}`);
  }

  revalidatePath("/depots/transfer-order");
  redirect(`/depots/transfer-order/${transferOrderId}`);
}

// Meme principe que "Copier ce programme" (Programme MB) : reprend depot
// source/destination + toutes les lignes (article/quantite) d'un Transfer
// Order existant dans un TOUT NOUVEAU Transfer Order (nouveau numero,
// aujourd'hui, statut "en_attente" repart de zero) - pratique pour un
// transfert qui se repete regulierement, sans jamais modifier l'original.
export async function copyTransferOrderAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const sourceTransferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!sourceTransferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  const { data: sourceData, error: sourceError } = await supabaseServer
    .from("transfer_orders")
    .select("depot_source_id, depot_destination_id")
    .eq("id", sourceTransferOrderId)
    .maybeSingle();

  if (sourceError || !sourceData) {
    throw new Error("Transfer Order introuvable.");
  }

  const source = sourceData as { depot_source_id: number; depot_destination_id: number };

  const { data: sourceLignesData, error: sourceLignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("article_type, article_id, quantite_demandee")
    .eq("transfer_order_id", sourceTransferOrderId);

  if (sourceLignesError) {
    throw new Error(sourceLignesError.message);
  }

  const sourceLignes = (sourceLignesData ?? []) as {
    article_type: ArticleType;
    article_id: number;
    quantite_demandee: number;
  }[];

  if (sourceLignes.length === 0) {
    throw new Error("Ce Transfer Order n'a aucune ligne a copier.");
  }

  const dateJour = new Date().toISOString().slice(0, 10);

  const { data: newTransferOrder, error: newTransferOrderError } = await supabaseServer
    .from("transfer_orders")
    .insert({
      depot_source_id: source.depot_source_id,
      depot_destination_id: source.depot_destination_id,
      date_jour: dateJour,
      cree_par: currentUser,
      numero: await nextTransferOrderNumero(dateJour),
    })
    .select("id")
    .single();

  if (newTransferOrderError) {
    throw new Error(newTransferOrderError.message);
  }

  const newTransferOrderId = (newTransferOrder as { id: number }).id;

  const { error: lignesError } = await supabaseServer.from("transfer_order_lignes").insert(
    sourceLignes.map((ligne) => ({
      transfer_order_id: newTransferOrderId,
      article_type: ligne.article_type,
      article_id: ligne.article_id,
      quantite_demandee: ligne.quantite_demandee,
    }))
  );

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  revalidatePath("/depots/transfer-order");
  redirect(`/depots/transfer-order/${newTransferOrderId}`);
}

// L'approbation choisit automatiquement quel(s) lot(s) couvrent chaque
// ligne, en commencant par le lot dont la date d'expiration (MP) ou de
// fabrication (PF, a defaut) est la plus proche (FEFO) - voir allocateFefo.
// Rejoue proprement si deja approuve une fois (efface l'ancienne repartition
// avant de la regenerer), pour permettre un "reessayer" simple. Coeur sans
// permission - reutilise par approveTransferOrderAction (UI, verifie
// "depots") et par tout appel interne deja autorise ailleurs (programme
// plastique).
export async function approveTransferOrder(transferOrderId: number): Promise<void> {
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

export async function approveTransferOrderAction(formData: FormData) {
  await requireWriteAccess();

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  await approveTransferOrder(transferOrderId);
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
// Ligne(s) cochees "Supprimer" dans le mode Modifier - supprimees avant tout
// le reste (leurs lots avec, ON DELETE CASCADE cote table
// transfer_order_ligne_lots... verifie explicitement ici quand meme pour ne
// pas dependre silencieusement du schema).
async function deleteFlaggedLignes(formData: FormData): Promise<Set<number>> {
  const ids = formData
    .getAll("supprimer_ligne_id")
    .map((raw) => Number(raw || "0"))
    .filter((id) => id > 0);

  if (ids.length === 0) return new Set();

  const { error: lotsError } = await supabaseServer
    .from("transfer_order_ligne_lots")
    .delete()
    .in("transfer_order_ligne_id", ids);
  if (lotsError) throw new Error(lotsError.message);

  const { error: lignesError } = await supabaseServer.from("transfer_order_lignes").delete().in("id", ids);
  if (lignesError) throw new Error(lignesError.message);

  return new Set(ids);
}

// Changement d'article sur une ligne existante (mode Modifier) - les lots
// deja choisis appartenaient a l'ancien article, donc invalides pour le
// nouveau : supprimes ici, l'utilisateur doit rouvrir Modifier pour choisir
// un lot du nouvel article (pas de rafraichissement en direct cote client
// pour rester simple).
async function applyArticleChanges(formData: FormData, skipIds: Set<number>) {
  const ligneIds = formData.getAll("article_change_ligne_id").map((raw) => Number(raw || "0"));
  const newTypes = formData.getAll("new_article_type");
  const newArticleIds = formData.getAll("new_article_id");

  const candidateIds = ligneIds.filter(
    (id, index) => id > 0 && !skipIds.has(id) && Number(newArticleIds[index] || "0") > 0
  );
  if (candidateIds.length === 0) return;

  // Chaque ligne envoie toujours sa selection actuelle (meme si elle n'a pas
  // ete touchee) - compare contre l'article DEJA enregistre pour ne
  // reellement traiter (et donc effacer les lots) que les lignes ou
  // l'article a vraiment change, pas a chaque Enregistrer.
  const { data: currentLignesData } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, article_type, article_id")
    .in("id", candidateIds);
  const currentById = new Map(
    ((currentLignesData ?? []) as { id: number; article_type: ArticleType; article_id: number }[]).map((l) => [
      l.id,
      l,
    ])
  );

  for (let index = 0; index < ligneIds.length; index += 1) {
    const ligneId = ligneIds[index];
    const articleId = Number(newArticleIds[index] || "0");
    const articleType = parseArticleType(newTypes[index]);
    if (ligneId <= 0 || articleId <= 0 || skipIds.has(ligneId)) continue;

    const current = currentById.get(ligneId);
    if (!current || (current.article_type === articleType && current.article_id === articleId)) continue;

    const { error: updateError } = await supabaseServer
      .from("transfer_order_lignes")
      .update({ article_type: articleType, article_id: articleId })
      .eq("id", ligneId);
    if (updateError) throw new Error(updateError.message);

    const { error: clearLotsError } = await supabaseServer
      .from("transfer_order_ligne_lots")
      .delete()
      .eq("transfer_order_ligne_id", ligneId);
    if (clearLotsError) throw new Error(clearLotsError.message);
  }
}

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

  const deletedLigneIds = await deleteFlaggedLignes(formData);
  await applyArticleChanges(formData, deletedLigneIds);

  const ligneIdsRaw = formData.getAll("ligne_id");
  const numeroLots = formData.getAll("numero_lot");
  const quantites = formData.getAll("quantite");

  // Filtre APRES avoir associe chaque ligne_id a son numero_lot/quantite par
  // index (formData.getAll renvoie 3 tableaux paralleles) - filtrer
  // ligneIdsRaw seul avant de zipper aurait decale ces index et associe le
  // lot/quantite d'une ligne a une autre.
  const rows = ligneIdsRaw
    .map((ligneIdRaw, index) => ({
      ligneId: Number(ligneIdRaw || "0"),
      numeroLot: String(numeroLots[index] || "").trim() || null,
      quantite: Number(String(quantites[index] || "0").replace(",", ".")),
    }))
    .filter((row) => !deletedLigneIds.has(row.ligneId));

  const ligneIds = [...new Set(rows.map((r) => r.ligneId).filter((id) => id > 0))];
  // Rien a faire ici (lot/quantite) ne veut pas forcement dire rien a faire
  // du tout - une suppression ou un changement d'article seul (deja
  // enregistres au-dessus) doit quand meme revalider la page normalement,
  // pas repartir en erreur.
  if (ligneIds.length > 0) {
    const { data: lignesData, error: lignesError } = await supabaseServer
      .from("transfer_order_lignes")
      .select("id, article_type, article_id, quantite_demandee")
      .in("id", ligneIds);

    if (lignesError) {
      throw new Error(lignesError.message);
    }

    const ligneById = new Map(
      (
        (lignesData ?? []) as {
          id: number;
          article_type: ArticleType;
          article_id: number;
          quantite_demandee: number;
        }[]
      ).map((l) => [l.id, l])
    );

    const lotsCache = new Map<string, Awaited<ReturnType<typeof fetchLotsInDepot>>>();
    // Solde restant PENDANT cet enregistrement (decremente au fur et a
    // mesure) - sans ca, 2 lignes de lot du meme article/lot voyaient
    // chacune le solde COMPLET independamment et pouvaient toutes les 2
    // etre acceptees, faisant depasser le total transfere au-dela de ce qui
    // existe vraiment.
    const remainingByCacheKeyAndLot = new Map<string, number>();
    // Total deja alloue pour CETTE ligne PENDANT cet enregistrement - jamais
    // depasser quantite_demandee, meme si l'utilisateur a change le lot
    // d'une ligne existante sans retirer/ajuster une autre ligne de lot
    // restee sur l'ancien total (bug remonte par l'utilisateur : demande
    // 300, code change, 2 lignes de lot pour le meme lot totalisant plus
    // que 300).
    const allocatedByLigneId = new Map<number, number>();
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

      const remainingKey = `${cacheKey}::${row.numeroLot ?? ""}`;
      if (!remainingByCacheKeyAndLot.has(remainingKey)) {
        const disponible = lots.find((l) => l.numeroLot === (row.numeroLot ?? ""))?.solde ?? 0;
        remainingByCacheKeyAndLot.set(remainingKey, disponible);
      }
      const remainingInLot = remainingByCacheKeyAndLot.get(remainingKey) ?? 0;

      const dejaAlloue = allocatedByLigneId.get(row.ligneId) ?? 0;
      const restantSurDemande = Math.max(0, ligne.quantite_demandee - dejaAlloue);

      const quantite = Math.round(Math.min(row.quantite, remainingInLot, restantSurDemande) * 1000) / 1000;
      if (quantite <= 0) continue;

      remainingByCacheKeyAndLot.set(remainingKey, remainingInLot - quantite);
      allocatedByLigneId.set(row.ligneId, dejaAlloue + quantite);
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
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
}

// Cree un Transfer Invoice a partir de ce Transfer Order (approuve, ou
// partiellement fini si un Transfer Invoice precedent n'a livre qu'une
// partie) - reprend une photo des lots/quantites actuellement en attente sur
// le Transfer Order (transfer_order_ligne_lots) dans les propres lignes du
// Transfer Invoice (invoice_order_lignes), modifiables ensuite a la baisse
// avant validation. Le mouvement de stock reel n'a lieu qu'a la validation
// (voir app/depots/invoice-order/actions.ts). Coeur sans permission - voir
// approveTransferOrder pour la raison de cette extraction.
export async function postTransferOrderToInvoice(
  transferOrderId: number,
  creePar: string | null
): Promise<number> {
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
    .insert({ transfer_order_id: transferOrderId, cree_par: creePar, date_jour: dateJour, numero })
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
  return invoiceOrderId;
}

export async function postToInvoiceOrderAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  const invoiceOrderId = await postTransferOrderToInvoice(transferOrderId, currentUser);
  redirect(`/depots/invoice-order/${invoiceOrderId}`);
}

// Refuse de supprimer si le Transfer Invoice lie a deja ete valide - a ce
// stade le stock a deja reellement bouge (voir invoice-order/actions.ts),
// supprimer le Transfer Order effacerait la trace de ce mouvement sans
// l'annuler. Avant validation (pas encore poste, ou poste mais Transfer
// Invoice encore en draft), rien n'a touche au stock : suppression sure,
// avec ses lignes/lots et son eventuel Transfer Invoice draft associe.
// Coeur de la suppression, sans permission ni redirect - reutilise par
// deleteTransferOrderAction (UI normale, verifie "depots") ET par tout appel
// interne qui a deja verifie sa propre permission ailleurs (ex: suppression
// d'un programme plastique complet, qui supprime son Transfer Order sous la
// permission "productionPlastique"). Bloque si un Transfer Invoice lie a
// deja ete valide (le stock a physiquement bouge, plus question de
// supprimer silencieusement).
export async function deleteTransferOrder(transferOrderId: number): Promise<void> {
  const { data: invoiceOrdersData, error: invoiceOrdersError } = await supabaseServer
    .from("invoice_orders")
    .select("id, statut")
    .eq("transfer_order_id", transferOrderId);

  if (invoiceOrdersError) {
    throw new Error(invoiceOrdersError.message);
  }

  const invoiceOrders = (invoiceOrdersData ?? []) as { id: number; statut: string }[];

  // Annule chaque Transfer Invoice lie AVANT le Transfer Order lui-meme -
  // meme fonction que "Supprimer" un Transfer Invoice individuel
  // (deleteInvoiceOrder, invoice-order/actions.ts), qui bloque deja si le
  // stock livre a ete consomme depuis (demande explicite : jamais annuler
  // un Transfer Invoice deja utilise en production - il faut d'abord
  // annuler ce qui l'a consomme). Remplace l'ancien blocage total "des
  // qu'un seul est valide, rien n'est supprimable" - trop strict des qu'un
  // TI valide n'avait en fait jamais ete touche depuis.
  for (const invoiceOrder of invoiceOrders) {
    await deleteInvoiceOrder(invoiceOrder.id);
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
}

export async function deleteTransferOrderAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de Transfer Order.");
  }

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  // Meme regle que partout ailleurs (formulaire natif <form action>, jamais
  // de catch cote client possible) : un throw depuis une Server Action voit
  // son message efface en production par Next.js, meme si la cause est
  // claire (ex: "stock deja consomme par un Transfer Invoice, annule
  // d'abord ce qui l'a consomme") - capture ici et redirige avec le vrai
  // message en avertissement, plutot que la page d'erreur generique "Une
  // erreur s'est produite" (bug reel confirme).
  try {
    await deleteTransferOrder(transferOrderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant la suppression.";
    redirect(`/depots/transfer-order/${transferOrderId}?avertissement=${encodeURIComponent(message)}`);
  }

  revalidatePath("/depots/transfer-order");
  revalidatePath("/depots/invoice-order");
  redirect("/depots/transfer-order");
}

export async function updateTransferOrderRemarqueAction(formData: FormData) {
  await requireWriteAccess();

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  const { error } = await supabaseServer
    .from("transfer_orders")
    .update({ remarque: String(formData.get("remarque") || "").trim() || null })
    .eq("id", transferOrderId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
}
