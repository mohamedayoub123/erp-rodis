"use server";

import { prochainNumero } from "@/lib/document-numbers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { type ArticleType, type DepotLot, fetchLotsInDepot, totalAvailable, allocateFefo } from "./stock-lots";
import { planifierLignes, type EntreeLigne } from "./repartition";
import { deleteInvoiceOrder } from "../invoice-order/actions";
import { logAudit } from "@/lib/audit-log";
import { fetchTransferOrderLabel } from "@/lib/depot-labels";

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
// recalcule au rang. Le numero vient d'un compteur permanent (voir
// lib/document-numbers.ts) : il ne redescend jamais, donc le numero d'un TO
// supprime n'est JAMAIS reattribue a un autre (avant : plus grand numero
// existant + 1, qui reprenait le numero du dernier TO supprime).
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
  return prochainNumero("TO", Number(year), (data as { numero: number | null } | null)?.numero ?? 0);
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
  // Seulement pour un TO qui reproduit un TO deja existant ailleurs (depuis une photo) : il est cree
  // meme si le stock du depot source est insuffisant (l'approbation repartit seulement ce qui est disponible).
  sansControleStock?: boolean;
}): Promise<number> {
  const { depotSourceId, depotDestinationId, dateJour, creePar, remarque, lignes, sansControleStock } = params;

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

  // Les lignes sont verifiees en parallele (une par une, un Transfer Order de 20 articles
  // prenait tres longtemps) ; l'erreur renvoyee reste celle de la premiere ligne en defaut.
  const lotsParLigne = sansControleStock
    ? []
    : await Promise.all(
        lignesValides.map((ligne) => fetchLotsInDepot(ligne.articleType, ligne.articleId, depotSourceId))
      );
  for (const [index, ligne] of lignesValides.entries()) {
    if (sansControleStock) break;
    const disponible = totalAvailable(lotsParLigne[index]);
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

  const label = await fetchTransferOrderLabel(transferOrderId);
  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "TransferOrder",
    action: "modification",
    cible: label,
    resume: `Transfer Order ${label} approuve (repartition FEFO des lots)`,
    avant: { statut: transferOrder.statut },
    apres: { statut: "approuve" },
  });

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

// Modifie les lignes (article/quantite, ajout/suppression) d'un Transfer
// Order encore "en_attente" - avant approbation, aucun lot n'est encore
// reserve (transfer_order_ligne_lots ne se remplit qu'a l'approbation), donc
// pas de picker de lot ici, juste article + quantite demandee. Demande
// explicite : pouvoir changer l'article choisi par erreur AVANT d'approuver,
// jusqu'ici impossible (page en lecture seule tant que "en_attente").
// "existing_ligne_id" = 0/vide pour une ligne toute nouvelle (ajoutee en
// mode Modifier), sinon l'id reel de la ligne existante a mettre a jour.
// "article_type"/"article_id"/"quantite_demandee" : memes noms de champ que
// TransferArticlePicker/TransferOrderLinesForm (formulaire de creation) -
// reutilise TransferArticlePicker tel quel ici (meme aperçu "Disponible :
// X" en direct), pas besoin de noms distincts.
export async function updateTransferOrderLignesEnAttenteAction(formData: FormData) {
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
  if (transferOrder.statut !== "en_attente") {
    throw new Error("Ce Transfer Order n'est plus en attente - impossible de modifier ses lignes ici.");
  }

  const supprimerIds = new Set(
    formData
      .getAll("supprimer_ligne_id")
      .map((raw) => Number(raw || "0"))
      .filter((id) => id > 0)
  );

  const ligneIdsRaw = formData.getAll("existing_ligne_id");
  const articleTypes = formData.getAll("article_type");
  const articleIds = formData.getAll("article_id");
  const quantites = formData.getAll("quantite_demandee");

  const lignes = ligneIdsRaw
    .map((rawLigneId, index) => ({
      ligneId: Number(rawLigneId || "0"),
      articleType: parseArticleType(articleTypes[index]),
      articleId: Number(articleIds[index] || "0"),
      quantiteDemandee: Number(String(quantites[index] || "0").replace(",", ".")),
    }))
    .filter((ligne) => !supprimerIds.has(ligne.ligneId) && ligne.articleId > 0 && ligne.quantiteDemandee > 0);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins un article avec une quantite.");
  }

  for (const ligne of lignes) {
    const lots = await fetchLotsInDepot(
      ligne.articleType,
      ligne.articleId,
      transferOrder.depot_source_id,
      transferOrderId
    );
    const disponible = totalAvailable(lots);
    if (ligne.quantiteDemandee > disponible + 1e-6) {
      throw new Error(
        `Stock insuffisant dans le depot source pour un des articles - disponible : ${disponible.toLocaleString("fr-FR")}.`
      );
    }
  }

  if (supprimerIds.size > 0) {
    const { error: deleteError } = await supabaseServer
      .from("transfer_order_lignes")
      .delete()
      .in("id", [...supprimerIds]);
    if (deleteError) throw new Error(deleteError.message);
  }

  const existingLignes = lignes.filter((l) => l.ligneId > 0);
  const newLignes = lignes.filter((l) => l.ligneId <= 0);

  for (const ligne of existingLignes) {
    const { error: updateError } = await supabaseServer
      .from("transfer_order_lignes")
      .update({
        article_type: ligne.articleType,
        article_id: ligne.articleId,
        quantite_demandee: ligne.quantiteDemandee,
      })
      .eq("id", ligne.ligneId);
    if (updateError) throw new Error(updateError.message);
  }

  if (newLignes.length > 0) {
    const { error: insertError } = await supabaseServer.from("transfer_order_lignes").insert(
      newLignes.map((ligne) => ({
        transfer_order_id: transferOrderId,
        article_type: ligne.articleType,
        article_id: ligne.articleId,
        quantite_demandee: ligne.quantiteDemandee,
      }))
    );
    if (insertError) throw new Error(insertError.message);
  }

  const label = await fetchTransferOrderLabel(transferOrderId);
  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "TransferOrder",
    action: "modification",
    cible: label,
    resume: `Transfer Order ${label} modifie (lignes, avant approbation)`,
  });

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

// Supprime UNE SEULE ligne d'un Transfer Order "Approuve"/"Partiellement
// fini", en un clic depuis le tableau verrouille - jamais besoin d'ouvrir
// "Modifier" juste pour ca (demande explicite : meme bouton simple qu'au
// Transfer Invoice). Reprend exactement la meme suppression que la case a
// cocher "Supprimer" du mode Modifier (transfer_order_ligne_lots puis
// transfer_order_lignes), juste declenchee directement.
export async function deleteTransferOrderLigneAction(formData: FormData) {
  await requireWriteAccess();

  const ligneId = Number(formData.get("delete_transfer_order_ligne_id") || "0");
  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { data: ligneData, error: ligneError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, transfer_order_id")
    .eq("id", ligneId)
    .maybeSingle();

  if (ligneError || !ligneData) {
    throw new Error("Ligne introuvable.");
  }
  const transferOrderId = (ligneData as { transfer_order_id: number }).transfer_order_id;

  const { data: transferOrderData, error: transferOrderError } = await supabaseServer
    .from("transfer_orders")
    .select("id, statut")
    .eq("id", transferOrderId)
    .maybeSingle();
  if (transferOrderError || !transferOrderData) {
    throw new Error("Transfer Order introuvable.");
  }
  const statut = (transferOrderData as { statut: string }).statut;
  if (statut !== "approuve" && statut !== "partiellement_fini") {
    throw new Error(
      'Cette ligne ne peut etre supprimee que si le Transfer Order est "Approuve" ou "Partiellement fini".'
    );
  }

  try {
    const { error: lotsError } = await supabaseServer
      .from("transfer_order_ligne_lots")
      .delete()
      .eq("transfer_order_ligne_id", ligneId);
    if (lotsError) throw new Error(lotsError.message);

    const { error: ligneDeleteError } = await supabaseServer.from("transfer_order_lignes").delete().eq("id", ligneId);
    if (ligneDeleteError) throw new Error(ligneDeleteError.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant la suppression.";
    redirect(`/depots/transfer-order/${transferOrderId}?avertissement=${encodeURIComponent(message)}`);
  }

  const label = await fetchTransferOrderLabel(transferOrderId);
  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "TransferOrder",
    action: "modification",
    cible: label,
    resume: `Transfer Order ${label} : 1 ligne supprimee`,
  });

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
}

// Augmenter la quantite demandee de lignes d'un Transfer Order DEJA traite (approuve, partiellement fini ou poste) -
// demande explicite : "modifier la quantite demandee meme si le TO est termine, mais jamais diminuer ce qui est deja
// transforme en Transfer Invoice, seulement augmenter". La quantite EN PLUS est reservee tout de suite sur le stock
// disponible du depot source (lot le plus proche de l'expiration en premier, deduction faite des autres reservations
// ET de ce qui est deja reserve par ce TO) ; si le stock ne suffit pas, rien n'est enregistre. Le reste a livrer
// part ensuite dans un nouveau Transfer Invoice ("Poster") : un TO "Poste" dont tous les Transfer Invoice sont
// valides repasse "Partiellement fini" ; s'il reste un Transfer Invoice en attente, le statut ne bouge pas (la
// validation de ce Transfer Invoice laissera de toute facon le supplement sur le TO).
export async function augmenterQuantitesDemandeesAction(formData: FormData) {
  await requireWriteAccess();

  const transferOrderId = Number(formData.get("transfer_order_id") || "0");
  if (!transferOrderId) {
    throw new Error("Transfer Order invalide.");
  }

  // Meme regle que les autres enregistrements de cette page : un throw depuis une Server Action voit son message
  // efface en production - on le capte et on redirige avec le vrai message en avertissement.
  try {
    await augmenterQuantitesDemandeesCore(formData, transferOrderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant l'enregistrement.";
    redirect(`/depots/transfer-order/${transferOrderId}?avertissement=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
  revalidatePath("/depots/transfer-order");
  redirect(`/depots/transfer-order/${transferOrderId}`);
}

async function augmenterQuantitesDemandeesCore(formData: FormData, transferOrderId: number) {
  const { data: transferOrderData, error: transferOrderError } = await supabaseServer
    .from("transfer_orders")
    .select("id, depot_source_id, statut")
    .eq("id", transferOrderId)
    .maybeSingle();
  if (transferOrderError || !transferOrderData) {
    throw new Error("Transfer Order introuvable.");
  }
  const transferOrder = transferOrderData as { id: number; depot_source_id: number; statut: string };
  if (transferOrder.statut === "en_attente") {
    throw new Error('Ce Transfer Order est encore "En attente" : modifiez ses lignes avec le bouton "Modifier".');
  }

  const ligneIds = formData.getAll("ligne_id").map((v) => Number(v || "0"));
  const nouvelles = formData.getAll("nouvelle_quantite").map((v) => Number(String(v || "0").replace(",", ".")));

  const { data: lignesData, error: lignesError } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, transfer_order_id, article_type, article_id, quantite_demandee")
    .eq("transfer_order_id", transferOrderId);
  if (lignesError) {
    throw new Error(lignesError.message);
  }
  const ligneParId = new Map(
    (
      (lignesData ?? []) as {
        id: number;
        article_type: ArticleType;
        article_id: number;
        quantite_demandee: number;
      }[]
    ).map((l) => [l.id, l])
  );

  // 1. Verifications (aucune ecriture tant que tout n'est pas valide)
  const changements: { ligneId: number; articleType: ArticleType; articleId: number; actuelle: number; nouvelle: number; delta: number }[] = [];
  ligneIds.forEach((ligneId, index) => {
    const ligne = ligneParId.get(ligneId);
    const nouvelle = nouvelles[index];
    if (!ligne || !Number.isFinite(nouvelle)) return;
    const actuelle = Number(ligne.quantite_demandee ?? 0);
    if (nouvelle < actuelle - 1e-9) {
      throw new Error(
        `Impossible de diminuer la quantite demandee d'une ligne d'un Transfer Order deja traite (demande actuelle : ${actuelle.toLocaleString("fr-FR")}). Seule l'augmentation est possible.`
      );
    }
    const delta = Math.round((nouvelle - actuelle) * 1000) / 1000;
    if (delta > 1e-9) {
      changements.push({ ligneId, articleType: ligne.article_type, articleId: ligne.article_id, actuelle, nouvelle, delta });
    }
  });
  if (changements.length === 0) {
    throw new Error("Aucune quantite augmentee : saisissez une quantite plus grande que la quantite demandee actuelle.");
  }

  // 2. Repartition FEFO du supplement sur le stock disponible (net de TOUTES les reservations, y compris celles de
  // ce TO : le supplement ne doit pas reprendre ce qui lui est deja reserve).
  const lotsParArticle = new Map<string, DepotLot[]>();
  const repartitions: { ligneId: number; allocations: { numero_lot: string; quantite: number }[] }[] = [];
  for (const changement of changements) {
    const cle = `${changement.articleType}::${changement.articleId}`;
    let lots = lotsParArticle.get(cle);
    if (!lots) {
      lots = (await fetchLotsInDepot(changement.articleType, changement.articleId, transferOrder.depot_source_id)).map((l) => ({ ...l }));
      lotsParArticle.set(cle, lots);
    }
    const { allocations, covered } = allocateFefo(lots, changement.delta);
    if (!covered) {
      const table = changement.articleType === "MP" ? "articles_matiere_premiere" : "articles";
      const { data: article } = await supabaseServer.from(table).select("nom_article").eq("id", changement.articleId).maybeSingle();
      const nom = (article as { nom_article: string } | null)?.nom_article ?? `#${changement.articleId}`;
      throw new Error(
        `Stock insuffisant pour "${nom}" : il manque de quoi ajouter ${changement.delta.toLocaleString("fr-FR")} (disponible dans le depot source : ${totalAvailable(lots).toLocaleString("fr-FR")}).`
      );
    }
    for (const allocation of allocations) {
      const lot = lots.find((l) => l.numeroLot === allocation.numero_lot);
      if (lot) lot.solde -= allocation.quantite;
    }
    repartitions.push({ ligneId: changement.ligneId, allocations });
  }

  // 3. Ecriture : reservations (on ajoute au lot deja reserve s'il existe) puis nouvelle quantite demandee
  for (const [index, changement] of changements.entries()) {
    const { data: existantesData, error: existantesError } = await supabaseServer
      .from("transfer_order_ligne_lots")
      .select("id, numero_lot, quantite")
      .eq("transfer_order_ligne_id", changement.ligneId);
    if (existantesError) throw new Error(existantesError.message);
    const existantes = (existantesData ?? []) as { id: number; numero_lot: string | null; quantite: number }[];

    for (const allocation of repartitions[index].allocations) {
      const existante = existantes.find((e) => (e.numero_lot ?? "") === allocation.numero_lot);
      if (existante) {
        const { error } = await supabaseServer
          .from("transfer_order_ligne_lots")
          .update({ quantite: Math.round((Number(existante.quantite ?? 0) + allocation.quantite) * 1000) / 1000 })
          .eq("id", existante.id);
        if (error) throw new Error(error.message);
        existante.quantite = Number(existante.quantite ?? 0) + allocation.quantite;
      } else {
        const { error } = await supabaseServer.from("transfer_order_ligne_lots").insert({
          transfer_order_ligne_id: changement.ligneId,
          numero_lot: allocation.numero_lot || null,
          quantite: allocation.quantite,
        });
        if (error) throw new Error(error.message);
      }
    }

    const { error: ligneError } = await supabaseServer
      .from("transfer_order_lignes")
      .update({ quantite_demandee: changement.nouvelle })
      .eq("id", changement.ligneId);
    if (ligneError) throw new Error(ligneError.message);
  }

  // 4. Statut : un TO "Poste" dont tous les Transfer Invoice sont valides a de nouveau du reste a livrer
  let nouveauStatut = transferOrder.statut;
  if (transferOrder.statut === "poste") {
    const { data: enAttenteData, error: enAttenteError } = await supabaseServer
      .from("invoice_orders")
      .select("id")
      .eq("transfer_order_id", transferOrderId)
      .neq("statut", "valide")
      .limit(1);
    if (enAttenteError) throw new Error(enAttenteError.message);
    if (((enAttenteData ?? []) as { id: number }[]).length === 0) {
      const { error: statutError } = await supabaseServer
        .from("transfer_orders")
        .update({ statut: "partiellement_fini" })
        .eq("id", transferOrderId);
      if (statutError) throw new Error(statutError.message);
      nouveauStatut = "partiellement_fini";
    }
  }

  const label = await fetchTransferOrderLabel(transferOrderId);
  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "TransferOrder",
    action: "modification",
    cible: label,
    resume: `Transfer Order ${label} : quantite demandee augmentee sur ${changements.length} ligne(s)`,
    avant: { statut: transferOrder.statut, lignes: changements.map((c) => ({ ligne: c.ligneId, quantite_demandee: c.actuelle })) },
    apres: { statut: nouveauStatut, lignes: changements.map((c) => ({ ligne: c.ligneId, quantite_demandee: c.nouvelle })) },
  });
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

  // Meme regle que partout ailleurs dans cette session (formulaire natif
  // <form action>, jamais de catch cote client possible) : un throw depuis
  // une Server Action voit son message efface en production par Next.js.
  // Capture ici et redirige avec le vrai message en avertissement (deja
  // affiche sur cette page, voir app/depots/transfer-order/[id]/page.tsx)
  // plutot que de laisser planter - important desormais que "Stock
  // insuffisant" doit reellement etre LU par l'utilisateur, pas juste
  // bloquer silencieusement.
  try {
    await updateAllLigneLotsCore(formData, transferOrderId, depotSourceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant l'enregistrement.";
    redirect(`/depots/transfer-order/${transferOrderId}?avertissement=${encodeURIComponent(message)}`);
  }
}

// Enregistrement du mode "Modifier" d'un Transfer Order approuve / partiellement fini : l'utilisateur change la quantite
// DEMANDEE (et/ou l'article, le lot prefere, les suppressions) ; la quantite a transferer par lot n'est JAMAIS saisie, elle
// se recalcule toute seule = quantite demandee - deja livre, repartie d'abord sur le(s) lot(s) choisi(s) puis sur les autres
// lots (le plus proche de l'expiration en premier) - voir repartition.ts, meme calcul que l'apercu a l'ecran. La quantite
// demandee ne peut pas descendre sous ce qui est deja livre. Rien n'est ecrit tant que tout n'est pas valide (stock suffisant).
async function updateAllLigneLotsCore(formData: FormData, transferOrderId: number, depotSourceId: number) {
  const deletedLigneIds = await deleteFlaggedLignes(formData);
  await applyArticleChanges(formData, deletedLigneIds);

  // Lots choisis par ligne (dans l'ordre de saisie) : seulement une preference
  const lotsChoisisParLigne = new Map<number, string[]>();
  const ligneIdsRaw = formData.getAll("ligne_id");
  const numeroLots = formData.getAll("numero_lot");
  ligneIdsRaw.forEach((raw, index) => {
    const ligneId = Number(raw || "0");
    if (ligneId <= 0 || deletedLigneIds.has(ligneId)) return;
    const liste = lotsChoisisParLigne.get(ligneId) ?? [];
    const numeroLot = String(numeroLots[index] ?? "").trim();
    if (numeroLot) liste.push(numeroLot);
    lotsChoisisParLigne.set(ligneId, liste);
  });

  // Nouvelle quantite demandee par ligne (champ vide = inchangee)
  const nouvelleDemandeParLigne = new Map<number, number>();
  const demandeIds = formData.getAll("demande_ligne_id");
  const demandes = formData.getAll("nouvelle_demande");
  demandeIds.forEach((raw, index) => {
    const ligneId = Number(raw || "0");
    const texte = String(demandes[index] ?? "").trim().replace(",", ".");
    if (ligneId <= 0 || deletedLigneIds.has(ligneId) || texte === "") return;
    nouvelleDemandeParLigne.set(ligneId, Number(texte));
  });

  const ligneIds = [...new Set([...lotsChoisisParLigne.keys(), ...nouvelleDemandeParLigne.keys()])];
  // Rien a faire ici ne veut pas forcement dire rien a faire du tout - une suppression ou un changement d'article seul
  // (deja enregistres au-dessus) doit quand meme revalider la page normalement.
  const changementsDemande: { ligne: number; avant: number; apres: number }[] = [];
  if (ligneIds.length > 0) {
    const { data: lignesData, error: lignesError } = await supabaseServer
      .from("transfer_order_lignes")
      .select("id, article_type, article_id, quantite_demandee")
      .eq("transfer_order_id", transferOrderId)
      .in("id", ligneIds)
      .order("id", { ascending: true });
    if (lignesError) throw new Error(lignesError.message);
    const lignes = (lignesData ?? []) as { id: number; article_type: ArticleType; article_id: number; quantite_demandee: number }[];

    // Deja livre par ligne (Transfer Invoice valides)
    const livreParLigne = new Map<number, number>();
    const { data: tiValides, error: tiError } = await supabaseServer
      .from("invoice_orders")
      .select("id")
      .eq("transfer_order_id", transferOrderId)
      .eq("statut", "valide");
    if (tiError) throw new Error(tiError.message);
    const idsTiValides = ((tiValides ?? []) as { id: number }[]).map((ti) => ti.id);
    if (idsTiValides.length > 0) {
      const { data: livraisons, error: livraisonsError } = await supabaseServer
        .from("invoice_order_lignes")
        .select("transfer_order_ligne_id, quantite")
        .in("invoice_order_id", idsTiValides);
      if (livraisonsError) throw new Error(livraisonsError.message);
      for (const livraison of (livraisons ?? []) as { transfer_order_ligne_id: number; quantite: number }[]) {
        livreParLigne.set(
          livraison.transfer_order_ligne_id,
          (livreParLigne.get(livraison.transfer_order_ligne_id) ?? 0) + Number(livraison.quantite ?? 0)
        );
      }
    }

    // Noms des articles (pour les messages) et lots du depot source (net des autres reservations, hors ce TO)
    const nomsParCle = new Map<string, string>();
    for (const type of ["MP", "PF"] as const) {
      const ids = [...new Set(lignes.filter((l) => l.article_type === type).map((l) => l.article_id))];
      if (ids.length === 0) continue;
      const { data: articles } = await supabaseServer
        .from(type === "MP" ? "articles_matiere_premiere" : "articles")
        .select("id, nom_article")
        .in("id", ids);
      for (const article of (articles ?? []) as { id: number; nom_article: string }[]) {
        nomsParCle.set(`${type}::${article.id}`, article.nom_article);
      }
    }
    const lotsParArticle = new Map<string, { numeroLot: string; solde: number }[]>();
    for (const ligne of lignes) {
      const cle = `${ligne.article_type}::${ligne.article_id}`;
      if (lotsParArticle.has(cle)) continue;
      const lots = await fetchLotsInDepot(ligne.article_type, ligne.article_id, depotSourceId, transferOrderId);
      lotsParArticle.set(cle, lots.map((lot) => ({ numeroLot: lot.numeroLot, solde: lot.solde })));
    }

    const entrees: EntreeLigne[] = lignes.map((ligne) => {
      const cle = `${ligne.article_type}::${ligne.article_id}`;
      const actuelle = Number(ligne.quantite_demandee ?? 0);
      return {
        id: ligne.id,
        articleType: ligne.article_type,
        articleId: ligne.article_id,
        nom: nomsParCle.get(cle) ?? `#${ligne.article_id}`,
        actuelle,
        nouvelle: nouvelleDemandeParLigne.get(ligne.id) ?? actuelle,
        livre: livreParLigne.get(ligne.id) ?? 0,
        lotsChoisis: lotsChoisisParLigne.get(ligne.id) ?? [],
      };
    });

    // 1. Calcul et verifications (aucune ecriture tant que tout n'est pas valide)
    const plan = planifierLignes(entrees, lotsParArticle);

    // 2. Ecriture : lots de chaque ligne remplaces, puis nouvelle quantite demandee
    for (const ligne of plan) {
      const { error: deleteError } = await supabaseServer
        .from("transfer_order_ligne_lots")
        .delete()
        .eq("transfer_order_ligne_id", ligne.ligneId);
      if (deleteError) throw new Error(deleteError.message);

      if (ligne.allocations.length > 0) {
        const { error: insertError } = await supabaseServer.from("transfer_order_ligne_lots").insert(
          ligne.allocations.map((allocation) => ({
            transfer_order_ligne_id: ligne.ligneId,
            numero_lot: allocation.numeroLot === "" ? null : allocation.numeroLot,
            quantite: allocation.quantite,
          }))
        );
        if (insertError) throw new Error(insertError.message);
      }

      if (ligne.demandeChangee) {
        const { error: demandeError } = await supabaseServer
          .from("transfer_order_lignes")
          .update({ quantite_demandee: ligne.nouvelle })
          .eq("id", ligne.ligneId);
        if (demandeError) throw new Error(demandeError.message);
        const avant = entrees.find((e) => e.id === ligne.ligneId)?.actuelle ?? 0;
        changementsDemande.push({ ligne: ligne.ligneId, avant, apres: ligne.nouvelle });
      }
    }
  }

  const label = await fetchTransferOrderLabel(transferOrderId);
  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "TransferOrder",
    action: "modification",
    cible: label,
    resume: `Transfer Order ${label} modifie (lignes/lots)${deletedLigneIds.size > 0 ? ` - ${deletedLigneIds.size} ligne(s) supprimee(s)` : ""}${changementsDemande.length > 0 ? ` - quantite demandee modifiee sur ${changementsDemande.length} ligne(s)` : ""}`,
    ...(changementsDemande.length > 0
      ? {
          avant: { lignes: changementsDemande.map((c) => ({ ligne: c.ligne, quantite_demandee: c.avant })) },
          apres: { lignes: changementsDemande.map((c) => ({ ligne: c.ligne, quantite_demandee: c.apres })) },
        }
      : {}),
  });

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
  revalidatePath("/depots/transfer-order");
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
  // Compteur permanent (voir lib/document-numbers.ts) : le numero d'un TI
  // supprime n'est jamais reattribue.
  const numero = await prochainNumero(
    "TI",
    Number(year),
    (lastInvoiceOrder as { numero: number | null } | null)?.numero ?? 0
  );

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
  const label = await fetchTransferOrderLabel(transferOrderId);
  const { data: transferOrderSnapshot } = await supabaseServer
    .from("transfer_orders")
    .select("*")
    .eq("id", transferOrderId)
    .maybeSingle();
  const { data: lignesSnapshot } = await supabaseServer
    .from("transfer_order_lignes")
    .select("*")
    .eq("transfer_order_id", transferOrderId);

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

  await logAudit({
    utilisateur: await getCurrentStockUser(),
    module: "TransferOrder",
    action: "suppression",
    cible: label,
    resume: `Transfer Order ${label} supprime`,
    avant: { transferOrder: transferOrderSnapshot ?? null, lignes: lignesSnapshot ?? [] },
  });
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

  const { data: avantData } = await supabaseServer
    .from("transfer_orders")
    .select("remarque")
    .eq("id", transferOrderId)
    .maybeSingle();
  const remarqueAvant = (avantData as { remarque: string | null } | null)?.remarque ?? null;
  const remarqueApres = String(formData.get("remarque") || "").trim() || null;

  const { error } = await supabaseServer
    .from("transfer_orders")
    .update({ remarque: remarqueApres })
    .eq("id", transferOrderId);

  if (error) {
    throw new Error(error.message);
  }

  if (remarqueAvant !== remarqueApres) {
    const label = await fetchTransferOrderLabel(transferOrderId);
    await logAudit({
      utilisateur: await getCurrentStockUser(),
      module: "TransferOrder",
      action: "modification",
      cible: label,
      resume: `Remarque modifiee sur Transfer Order ${label}`,
      avant: { remarque: remarqueAvant },
      apres: { remarque: remarqueApres },
    });
  }

  revalidatePath(`/depots/transfer-order/${transferOrderId}`);
}
