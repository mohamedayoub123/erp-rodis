"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  CATEGORIES_PLASTIQUE,
  DEPOT_PLASTIQUE_DEST_DEFAULT,
  DEPOT_PLASTIQUE_SOURCE_DEFAULT,
  type RecettePlastiqueLigne,
} from "./shared";
import { createTransferOrder } from "@/app/depots/transfer-order/actions";
import { fetchLotsInDepot, allocateFefo, totalAvailable } from "@/app/depots/transfer-order/stock-lots";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "productionPlastique"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les recettes plastique.");
  }
  return currentUser;
}

function parsePourcentage(formData: FormData) {
  const raw = String(formData.get("pourcentage") || "").trim().replace(",", ".");
  const value = Number(raw);
  return Number.isNaN(value) ? 0 : value;
}

function revalidateRecettePlastiquePages(articleProduitId: number) {
  revalidatePath("/production-plastique/recettes");
  revalidatePath(`/production-plastique/recettes/${articleProduitId}`);
}

export async function addRecettePlastiqueLigneAction(formData: FormData) {
  await requireWriteAccess();

  const articleProduitId = Number(formData.get("article_produit_id") || "0");
  // ProduitPickerField (composant partage) ecrit toujours son champ cache
  // sous le nom "article_id".
  const articleMatiereId = Number(formData.get("article_id") || "0");
  const pourcentage = parsePourcentage(formData);

  if (!articleProduitId || !articleMatiereId) {
    throw new Error("Article invalide.");
  }
  if (articleMatiereId === articleProduitId) {
    throw new Error("Un article ne peut pas etre sa propre matiere.");
  }

  const { error } = await supabaseServer
    .from("recettes_plastique")
    .upsert(
      { article_produit_id: articleProduitId, article_matiere_id: articleMatiereId, pourcentage },
      { onConflict: "article_produit_id,article_matiere_id" }
    );

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePlastiquePages(articleProduitId);
}

export async function updateRecettePlastiqueLigneAction(formData: FormData) {
  await requireWriteAccess();

  const ligneId = Number(formData.get("ligne_id") || "0");
  const articleProduitId = Number(formData.get("article_produit_id") || "0");
  const pourcentage = parsePourcentage(formData);

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("recettes_plastique")
    .update({ pourcentage })
    .eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePlastiquePages(articleProduitId);
}

export async function deleteRecettePlastiqueLigneAction(formData: FormData) {
  await requireWriteAccess();

  const ligneId = Number(formData.get("ligne_id") || "0");
  const articleProduitId = Number(formData.get("article_produit_id") || "0");

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("recettes_plastique").delete().eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePlastiquePages(articleProduitId);
}

export async function updatePoidsNetAction(formData: FormData) {
  await requireWriteAccess();

  const articleProduitId = Number(formData.get("article_produit_id") || "0");
  if (!articleProduitId) {
    throw new Error("Article invalide.");
  }

  const raw = String(formData.get("poids_net") || "").trim().replace(",", ".");
  const poidsNet = raw ? Number(raw) : null;

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ poids_net: Number.isNaN(poidsNet) ? null : poidsNet })
    .eq("id", articleProduitId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRecettePlastiquePages(articleProduitId);
}

export async function updateArticlePlastiqueDepotAction(formData: FormData) {
  await requireWriteAccess();

  const articleId = Number(formData.get("article_id") || "0");
  if (!articleId) {
    throw new Error("Article invalide.");
  }

  const depotIdRaw = String(formData.get("depot_id") || "").trim();
  const depotId = depotIdRaw ? Number(depotIdRaw) : null;

  const { error } = await supabaseServer
    .from("articles_matiere_premiere")
    .update({ depot_id: depotId })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production-plastique/articles");
}

type PendingProgrammePlastiqueRow = {
  article_id: number;
  quantite: number;
  numero_lot?: string;
};

// Sort reellement (qte_sortie) la resine + le colorant du DEPOT SOURCE
// uniquement (jamais des autres depots, meme si l'article MP en a ailleurs)
// et chiffre le prix depuis les MEMES lots consommes - demande explicite :
// la production plastique consomme physiquement sa matiere dans le depot ou
// elle est fabriquee, jamais ailleurs. Si le depot source n'a pas assez
// (FEFO ne couvre pas tout), sort quand meme le reste (stock qui peut
// devenir negatif) plutot que de bloquer l'enregistrement - la quantite
// manquante est alors sans prix connu (aucun lot reel ne la justifie).
async function consommerIngredientsDepotSource(
  poidsNetGrammes: number | null,
  quantitePieces: number,
  recetteLignes: RecettePlastiqueLigne[],
  depotSourceId: number,
  dateJour: string,
  currentUser: string | null
): Promise<{ coutTotal: number; lignesSansPrix: number[]; consommationLotIds: number[] }> {
  let coutTotal = 0;
  const lignesSansPrix: number[] = [];
  const consommationLotIds: number[] = [];

  if (!poidsNetGrammes || poidsNetGrammes <= 0 || quantitePieces <= 0 || recetteLignes.length === 0) {
    return { coutTotal: 0, lignesSansPrix: recetteLignes.map((l) => l.article_matiere_id), consommationLotIds };
  }

  for (const ligne of recetteLignes) {
    const quantiteKg = (poidsNetGrammes * (ligne.pourcentage / 100) * quantitePieces) / 1000;
    if (quantiteKg <= 0) continue;

    const lots = await fetchLotsInDepot("MP", ligne.article_matiere_id, depotSourceId);
    const { allocations, covered } = allocateFefo(lots, quantiteKg);

    let quantiteRestante = quantiteKg;
    let prixConnuPourTout = allocations.length > 0;

    for (const allocation of allocations) {
      const lot = lots.find((l) => l.numeroLot === allocation.numero_lot);
      if (lot?.prixUnitaireFcfa != null) {
        coutTotal += lot.prixUnitaireFcfa * allocation.quantite;
      } else {
        prixConnuPourTout = false;
      }

      const { data: inserted, error } = await supabaseServer
        .from("lots_stock_matiere_premiere")
        .insert({
          article_id: ligne.article_matiere_id,
          numero_lot: allocation.numero_lot || null,
          qte_entree: 0,
          qte_sortie: allocation.quantite,
          depot_id: depotSourceId,
          date_jour: dateJour,
          utilisateur: currentUser,
          note: "Consommation programme plastique",
          source_import: "web:programme-plastique",
        })
        .select("id")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      consommationLotIds.push((inserted as { id: number }).id);
      quantiteRestante -= allocation.quantite;
    }

    if (!covered && quantiteRestante > 1e-6) {
      const { data: inserted, error } = await supabaseServer
        .from("lots_stock_matiere_premiere")
        .insert({
          article_id: ligne.article_matiere_id,
          numero_lot: null,
          qte_entree: 0,
          qte_sortie: quantiteRestante,
          depot_id: depotSourceId,
          date_jour: dateJour,
          utilisateur: currentUser,
          note: "Consommation programme plastique (stock insuffisant dans le depot source)",
          source_import: "web:programme-plastique",
        })
        .select("id")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      consommationLotIds.push((inserted as { id: number }).id);
      prixConnuPourTout = false;
    }

    if (!prixConnuPourTout) {
      lignesSansPrix.push(ligne.article_matiere_id);
    }
  }

  return { coutTotal, lignesSansPrix, consommationLotIds };
}

// Enregistre un lot de production plastique (article/qte/lot par ligne, lot
// optionnel) en une seule action : 1) entre le stock dans le depot source
// (prix auto depuis la recette, comme Entree MP - ces articles sont
// fabriques en interne, jamais achetes) 2) cree un Transfer Order vers le
// depot destination, statut "en attente" (demande explicite : le programme
// cree SEULEMENT le TO - l'utilisateur l'approuve lui-meme puis fait le TI
// lui-meme depuis les pages Depots normales, plus d'auto-approbation/poste/
// validation ici). Verifie uniquement la permission "productionPlastique" -
// jamais "depots" - pour que cette action reste utilisable par qui gere le
// plastique sans lui donner acces au module Depots entier.
// Retourne {ok,message} au lieu de "throw" pour toute erreur attendue -
// Next.js efface le .message d'une Error jetee depuis une Server Action en
// production, meme catchee cote client (voir DeleteGroupButton pour le
// meme correctif applique aux suppressions) : sans ce correctif l'utilisateur
// ne voit qu'un message generique "An error occurred..." et jamais la vraie
// raison (ex: "aucun stock du tout pour tel article").
export async function saveProgrammePlastiqueAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string; transferOrderId?: number }> {
  const currentUser = await requireWriteAccess();

  const depotSourceId = Number(formData.get("depot_source_id") || "0") || DEPOT_PLASTIQUE_SOURCE_DEFAULT;
  const depotDestinationId = Number(formData.get("depot_destination_id") || "0") || DEPOT_PLASTIQUE_DEST_DEFAULT;
  const dateJour = new Date().toISOString().slice(0, 10);

  const rawPayload = String(formData.get("payload") || "").trim();
  if (!rawPayload) {
    return { ok: false, message: "Aucune ligne a enregistrer." };
  }

  let rows: PendingProgrammePlastiqueRow[] = [];
  try {
    rows = JSON.parse(rawPayload) as PendingProgrammePlastiqueRow[];
  } catch {
    return { ok: false, message: "Le contenu du programme est invalide." };
  }

  const lignes = rows
    .map((row) => ({
      articleId: Number(row.article_id),
      quantite: Number(row.quantite),
      numeroLot: String(row.numero_lot || "").trim(),
    }))
    .filter((row) => row.articleId > 0 && row.quantite > 0);

  if (lignes.length === 0) {
    return { ok: false, message: "Ajoute au moins un article avec une quantite." };
  }

  try {

  const articleIds = [...new Set(lignes.map((l) => l.articleId))];
  const { data: articlesData } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article, categorie, poids_net, unite")
    .in("id", articleIds);
  const articles = (articlesData ?? []) as {
    id: number;
    nom_article: string;
    categorie: string | null;
    poids_net: number | null;
    unite: string | null;
  }[];
  const articleById = new Map(articles.map((a) => [a.id, a]));

  const plastiqueIds = articles
    .filter((a) => (CATEGORIES_PLASTIQUE as readonly string[]).includes(a.categorie || ""))
    .map((a) => a.id);

  const { data: recettesData } = await supabaseServer
    .from("recettes_plastique")
    .select("id, article_produit_id, article_matiere_id, pourcentage")
    .in("article_produit_id", plastiqueIds.length > 0 ? plastiqueIds : [0]);
  const recettes = (recettesData ?? []) as RecettePlastiqueLigne[];
  const lignesParArticle = new Map<number, RecettePlastiqueLigne[]>();
  for (const ligne of recettes) {
    const list = lignesParArticle.get(ligne.article_produit_id) ?? [];
    list.push(ligne);
    lignesParArticle.set(ligne.article_produit_id, list);
  }

  // Quantite totale par article (plusieurs lignes/lots du meme article
  // consomment leur matiere ENSEMBLE, une seule fois, pas lot par lot) -
  // chaque ligne de stock recoit ensuite le meme prix moyen par piece.
  const quantiteTotaleParArticle = new Map<number, number>();
  for (const ligne of lignes) {
    quantiteTotaleParArticle.set(ligne.articleId, (quantiteTotaleParArticle.get(ligne.articleId) ?? 0) + ligne.quantite);
  }

  // Bloque tout l'enregistrement si une matiere de recette n'a STRICTEMENT
  // AUCUN stock reel dans le depot source (demande explicite : une matiere
  // "pas assez" peut quand meme sortir en negatif pour le reste manquant,
  // mais une matiere totalement absente du depot source - meme si elle
  // existe ailleurs, ex: Depot E - ne doit jamais creer un negatif complet
  // a partir de rien). Verifie AVANT toute ecriture (aucune transaction ici,
  // donc rien ne doit etre ecrit tant que ce n'est pas confirme).
  const matieresSansStock: string[] = [];
  for (const articleId of plastiqueIds) {
    const recetteLignes = lignesParArticle.get(articleId) ?? [];
    for (const ligne of recetteLignes) {
      const lots = await fetchLotsInDepot("MP", ligne.article_matiere_id, depotSourceId);
      if (totalAvailable(lots) <= 0) {
        const matiere = articleById.get(ligne.article_matiere_id);
        const nom = matiere?.nom_article ?? `Article #${ligne.article_matiere_id}`;
        if (!matieresSansStock.includes(nom)) matieresSansStock.push(nom);
      }
    }
  }
  if (matieresSansStock.length > 0) {
    return {
      ok: false,
      message: `Impossible d'enregistrer - aucun stock du tout dans le depot source pour : ${matieresSansStock.join(", ")}.`,
    };
  }

  const prixAutoByArticleId = new Map<number, number>();
  const consommationLotIds: number[] = [];
  for (const articleId of plastiqueIds) {
    const article = articleById.get(articleId);
    const recetteLignes = lignesParArticle.get(articleId) ?? [];
    const quantitePieces = quantiteTotaleParArticle.get(articleId) ?? 0;
    const { coutTotal, consommationLotIds: lotIds } = await consommerIngredientsDepotSource(
      article?.poids_net ?? null,
      quantitePieces,
      recetteLignes,
      depotSourceId,
      dateJour,
      currentUser
    );
    consommationLotIds.push(...lotIds);
    // Prix = ce qui EST connu (matieres avec prix reel), meme si une autre
    // matiere de la meme recette n'a aucun prix - demande explicite : un prix
    // partiel visible vaut mieux que "Prix inconnu" pour tout le lot quand
    // une partie est reellement chiffrable. coutTotal ne compte deja QUE les
    // matieres avec un prix reel (voir consommerIngredientsDepotSource).
    if (quantitePieces > 0 && coutTotal > 0) {
      prixAutoByArticleId.set(articleId, coutTotal / quantitePieces);
    }
  }

  const payload = lignes.map((ligne) => {
    const article = articleById.get(ligne.articleId);
    const numeroLot = ligne.numeroLot || null;

    return {
      article_id: ligne.articleId,
      date_jour: dateJour,
      date_reception: dateJour,
      numero_lot: numeroLot,
      code_normalise: numeroLot ? numeroLot.toUpperCase() : null,
      qte_entree: ligne.quantite,
      qte_sortie: 0,
      unite: article?.unite ?? null,
      depot_id: depotSourceId,
      prix_unitaire: prixAutoByArticleId.get(ligne.articleId) ?? null,
      devise: "FCFA",
      utilisateur: currentUser,
      source_import: "web:programme-plastique",
    };
  });

  const { data: insertedRows, error: insertError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .insert(payload)
    .select("id");
  if (insertError) {
    throw new Error(insertError.message);
  }

  // Regroupe le stock produit ET la matiere consommee sous un seul
  // mouvement_groupe_id (meme convention que partout ailleurs - voir
  // createEntreeMpBatchAction) - demande explicite : supprimer ce programme
  // plus tard (depuis Mouvements MP, ou il apparait deja sous l'etiquette
  // "Plastique") doit tout effacer d'un coup, matiere consommee comprise.
  const producedIds = ((insertedRows ?? []) as { id: number }[]).map((row) => row.id);
  const groupeId = Math.min(...producedIds, ...consommationLotIds);
  const allGroupIds = [...producedIds, ...consommationLotIds];
  if (allGroupIds.length > 0) {
    const { error: groupError } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .update({ mouvement_groupe_id: groupeId })
      .in("id", allGroupIds);
    if (groupError) {
      throw new Error(groupError.message);
    }
  }

  const transferOrderId = await createTransferOrder({
    depotSourceId,
    depotDestinationId,
    dateJour,
    creePar: currentUser,
    remarque: `Programme plastique #${groupeId}`,
    lignes: lignes.map((ligne) => ({ articleType: "MP" as const, articleId: ligne.articleId, quantiteDemandee: ligne.quantite })),
  });

  revalidatePath("/production-plastique/programme");
  revalidatePath("/stock/matiere-premiere/stock");
  revalidatePath("/mouvements/matiere-premiere");
  revalidatePath("/depots/transfer-order");

  return { ok: true, transferOrderId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Erreur pendant l'enregistrement du programme.",
    };
  }
}
