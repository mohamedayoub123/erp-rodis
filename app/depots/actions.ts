"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchReservedByLot, type ArticleType } from "./transfer-order/stock-lots";
import { fetchCoutsReelsMpDepotB } from "@/lib/prix-revient";
import { COMPTE_PERTES_STOCK, COMPTE_STOCK_MP, creerEcriture } from "@/lib/comptabilite";

// Ecriture comptable Perte sur stock (Debit Pertes / Credit Stock MP) - MP
// uniquement (pas de compte de perte PF pour l'instant), et uniquement si
// coche explicitement "C'est une perte" (jamais devine depuis une simple
// correction de comptage). Jamais generee si le prix n'est pas connu.
// Try/catch qui n'interrompt jamais la correction de stock elle-meme.
async function creerEcriturePerteMp(articleId: number, numeroLot: string, quantitePerdue: number, currentUser: string | null) {
  try {
    const couts = await fetchCoutsReelsMpDepotB([{ articleMpId: articleId, quantite: quantitePerdue }]);
    const montant = couts.get(articleId)?.coutFcfa;
    if (montant === undefined || montant <= 0) return;

    const { data: articleData } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("nom_article")
      .eq("id", articleId)
      .maybeSingle();
    const nomArticle = (articleData as { nom_article: string } | null)?.nom_article ?? `#${articleId}`;

    await creerEcriture({
      dateEcriture: new Date().toISOString().slice(0, 10),
      pieceReference: numeroLot || null,
      libelle: `Perte MP - ${nomArticle}${numeroLot ? ` - ${numeroLot}` : ""}`,
      sourceType: "perte_mp_correction",
      sourceId: `${articleId}-${numeroLot}-${Date.now()}`,
      createdBy: currentUser,
      lignes: [
        { compteCode: COMPTE_PERTES_STOCK, debit: montant, credit: 0 },
        { compteCode: COMPTE_STOCK_MP, debit: 0, credit: montant },
      ],
    });
  } catch (comptaError) {
    console.error("Ecriture comptable perte MP (correction stock) echouee:", comptaError);
  }
}

export async function createDepotAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les depots.");
  }

  const nom = String(formData.get("nom") || "").trim();
  if (!nom) {
    throw new Error("Nom du depot obligatoire.");
  }

  const { error } = await supabaseServer.from("depots").insert({ nom });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/depots");
}

// Le depot n'est qu'un champ sur chaque article (depot_id, voir Articles
// Produit Fini / Articles Matiere Premiere) - le detacher des articles avant
// de supprimer, sinon la contrainte de cle etrangere bloque la suppression
// des qu'au moins un article y est rattache.
export async function deleteDepotAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de depot.");
  }

  const depotId = Number(formData.get("depot_id") || "0");
  if (!depotId) {
    throw new Error("Depot invalide.");
  }

  const [{ error: unlinkPfError }, { error: unlinkMpError }] = await Promise.all([
    supabaseServer.from("articles").update({ depot_id: null }).eq("depot_id", depotId),
    supabaseServer.from("articles_matiere_premiere").update({ depot_id: null }).eq("depot_id", depotId),
  ]);

  if (unlinkPfError) {
    throw new Error(unlinkPfError.message);
  }
  if (unlinkMpError) {
    throw new Error(unlinkMpError.message);
  }

  const { error } = await supabaseServer.from("depots").delete().eq("id", depotId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/depots");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/articles/matiere-premiere");
}

function stockTableForType(articleType: ArticleType) {
  return articleType === "MP" ? "lots_stock_matiere_premiere" : "lots_stock";
}

// Solde actuel + deja reserve pour un article+lot precis dans UN depot -
// partage entre la correction ligne par ligne et la correction en lot, pour
// ne jamais dupliquer cette logique (voir updateDepotLotStockAction/
// updateDepotStockBatchAction).
async function computeSoldeEtReserve(
  articleType: ArticleType,
  articleId: number,
  numeroLot: string,
  depotId: number
): Promise<{ solde: number; reserve: number; table: string }> {
  const table = stockTableForType(articleType);
  const articlesTable = articleType === "MP" ? "articles_matiere_premiere" : "articles";

  const { data: articleData } = await supabaseServer
    .from(articlesTable)
    .select("depot_id")
    .eq("id", articleId)
    .maybeSingle();
  const defaultDepotId = (articleData as { depot_id: number | null } | null)?.depot_id ?? null;

  const { data: lotsData, error: lotsError } = await supabaseServer
    .from(table)
    .select("qte_entree, qte_sortie, depot_id, numero_lot")
    .eq("article_id", articleId);

  if (lotsError) {
    throw new Error(lotsError.message);
  }

  let solde = 0;
  for (const lot of (lotsData ?? []) as {
    qte_entree: number;
    qte_sortie: number;
    depot_id: number | null;
    numero_lot: string | null;
  }[]) {
    if ((lot.numero_lot || "").trim() !== numeroLot) continue;
    const effectiveDepotId = lot.depot_id ?? defaultDepotId;
    if (effectiveDepotId !== depotId) continue;
    solde += Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0);
  }

  const reservedByLot = await fetchReservedByLot(articleType, articleId, depotId);
  let reserve = reservedByLot.get(numeroLot) ?? 0;

  if (articleType === "MP") {
    const { data: reserveData } = await supabaseServer
      .from("production_mp_reserve")
      .select("quantite")
      .eq("depot_id", depotId)
      .eq("article_mp_id", articleId)
      .eq("numero_lot", numeroLot);
    reserve += ((reserveData ?? []) as { quantite: number }[]).reduce(
      (sum, r) => sum + Number(r.quantite ?? 0),
      0
    );
  }

  return { solde, reserve, table };
}

// Corrige le stock d'un article+lot precis dans un depot (fiche
// /depots/[id]) - insere une ligne d'ajustement (entree ou sortie, jamais
// une modification des lignes existantes) pour amener le solde a la
// nouvelle quantite demandee. Ne descend jamais en dessous de ce qui est
// deja reserve sur ce meme lot (Transfer Order en attente/approuve, ou
// validation Salle de pesage/conditionnement pour la MP) - la reservation
// existante n'est jamais touchee, seulement protegee.
export async function updateDepotLotStockAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le stock des depots.");
  }

  const depotId = Number(formData.get("depot_id") || "0");
  const articleType: ArticleType = String(formData.get("article_type") || "") === "MP" ? "MP" : "PF";
  const articleId = Number(formData.get("article_id") || "0");
  const numeroLot = String(formData.get("numero_lot") || "").trim();
  const nouvelleQuantiteRaw = String(formData.get("nouvelle_quantite") || "").trim().replace(",", ".");
  const nouvelleQuantite = Number(nouvelleQuantiteRaw);
  const estPerte = String(formData.get("est_perte") || "") === "1";

  if (!depotId || !articleId || nouvelleQuantiteRaw === "" || Number.isNaN(nouvelleQuantite)) {
    throw new Error("Correction de stock invalide.");
  }
  if (nouvelleQuantite < 0) {
    throw new Error("La quantite ne peut pas etre negative.");
  }

  const { solde, reserve, table } = await computeSoldeEtReserve(articleType, articleId, numeroLot, depotId);

  if (nouvelleQuantite < reserve - 1e-6) {
    throw new Error(
      `Impossible de descendre sous ${reserve.toLocaleString("fr-FR")} : deja reserve par ailleurs sur ce lot.`
    );
  }

  const delta = nouvelleQuantite - solde;
  if (Math.abs(delta) < 1e-9) {
    return;
  }

  const { error: insertError } = await supabaseServer.from(table).insert({
    article_id: articleId,
    numero_lot: numeroLot,
    code_normalise: numeroLot.toUpperCase(),
    date_jour: new Date().toISOString().slice(0, 10),
    qte_entree: delta > 0 ? delta : 0,
    qte_sortie: delta < 0 ? -delta : 0,
    depot_id: depotId,
    utilisateur: currentUser,
    note: "Correction de stock (fiche Depot)",
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  if (estPerte && delta < 0 && articleType === "MP") {
    await creerEcriturePerteMp(articleId, numeroLot, -delta, currentUser);
  }

  revalidatePath(`/depots/${depotId}`);
}

// Aligne AUTOMATIQUEMENT le stock de TOUS les articles/lots d'un depot sur
// leur quantite deja reservee (Transfer Order + Salle de pesage/
// conditionnement pour la MP) - demande explicite "operation automatique
// sur tous les articles". Un lot pas du tout reserve tombe donc a 0 : le
// bouton cote page.tsx affiche une confirmation explicite avant d'envoyer,
// cette action elle-meme ne re-demande rien (deja protegee par
// canWritePageUser). Solde/reserve viennent directement de ce que la page
// affichait au moment du clic (memes valeurs que le tableau a l'ecran),
// pas recalcules ici - simple et coherent avec ce que l'utilisateur voit.
export async function syncDepotStockToReserveAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le stock des depots.");
  }

  const depotId = Number(formData.get("depot_id") || "0");
  if (!depotId) {
    throw new Error("Depot invalide.");
  }

  const articleTypes = formData.getAll("article_type");
  const articleIds = formData.getAll("article_id");
  const numeroLots = formData.getAll("numero_lot");
  const soldes = formData.getAll("solde");
  const reserves = formData.getAll("reserve");

  const byTable = new Map<string, Record<string, unknown>[]>();

  for (let i = 0; i < articleIds.length; i++) {
    const articleType: ArticleType = String(articleTypes[i] || "") === "MP" ? "MP" : "PF";
    const articleId = Number(articleIds[i] || "0");
    const numeroLot = String(numeroLots[i] || "").trim();
    const solde = Number(soldes[i] || "0");
    const reserve = Number(reserves[i] || "0");

    if (!articleId) continue;

    const delta = reserve - solde;
    if (Math.abs(delta) < 1e-9) continue;

    const table = stockTableForType(articleType);
    const list = byTable.get(table) ?? [];
    list.push({
      article_id: articleId,
      numero_lot: numeroLot,
      code_normalise: numeroLot.toUpperCase(),
      date_jour: new Date().toISOString().slice(0, 10),
      qte_entree: delta > 0 ? delta : 0,
      qte_sortie: delta < 0 ? -delta : 0,
      depot_id: depotId,
      utilisateur: currentUser,
      note: "Alignement stock = reserve, tous articles (fiche Depot)",
    });
    byTable.set(table, list);
  }

  for (const [table, rows] of byTable.entries()) {
    if (rows.length === 0) continue;
    const { error } = await supabaseServer.from(table).insert(rows);
    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath(`/depots/${depotId}`);
}

// Meme correction que updateDepotLotStockAction, mais pour PLUSIEURS
// articles/lots en une seule saisie ("+ Ajouter une ligne", meme motif que
// Transfer Order) - demande explicite : "changer tout le stock d'un coup".
// Valide TOUTES les lignes (solde, reserve) avant d'ecrire quoi que ce soit :
// si une seule ligne descendrait sous sa reservation, aucune correction
// n'est appliquee (tout ou rien), plutot que d'appliquer les lignes
// valides et laisser l'utilisateur deviner laquelle a echoue.
export async function updateDepotStockBatchAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "depots"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le stock des depots.");
  }

  const depotId = Number(formData.get("depot_id") || "0");
  if (!depotId) {
    throw new Error("Depot invalide.");
  }

  const articleTypes = formData.getAll("article_type");
  const articleIds = formData.getAll("article_id");
  const numeroLots = formData.getAll("numero_lot");
  const nouvellesQuantites = formData.getAll("nouvelle_quantite");
  const estPertes = formData.getAll("est_perte");

  const lignes = articleIds
    .map((raw, index) => ({
      articleType: (String(articleTypes[index] || "") === "MP" ? "MP" : "PF") as ArticleType,
      articleId: Number(raw || "0"),
      numeroLot: String(numeroLots[index] || "").trim(),
      nouvelleQuantite: Number(String(nouvellesQuantites[index] || "").trim().replace(",", ".")),
      estPerte: String(estPertes[index] || "") === "1",
    }))
    .filter((ligne) => ligne.articleId > 0 && ligne.numeroLot);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins une ligne valide (article, numero de lot, quantite).");
  }

  const aCorreger: { table: string; insert: Record<string, unknown>; perte?: { articleId: number; numeroLot: string; quantite: number } }[] = [];

  for (const ligne of lignes) {
    if (Number.isNaN(ligne.nouvelleQuantite) || ligne.nouvelleQuantite < 0) {
      throw new Error(`Quantite invalide pour le lot ${ligne.numeroLot}.`);
    }

    const { solde, reserve, table } = await computeSoldeEtReserve(
      ligne.articleType,
      ligne.articleId,
      ligne.numeroLot,
      depotId
    );

    if (ligne.nouvelleQuantite < reserve - 1e-6) {
      throw new Error(
        `Lot ${ligne.numeroLot} : impossible de descendre sous ${reserve.toLocaleString("fr-FR")}, deja reserve par ailleurs.`
      );
    }

    const delta = ligne.nouvelleQuantite - solde;
    if (Math.abs(delta) < 1e-9) continue;

    aCorreger.push({
      table,
      perte:
        ligne.estPerte && delta < 0 && ligne.articleType === "MP"
          ? { articleId: ligne.articleId, numeroLot: ligne.numeroLot, quantite: -delta }
          : undefined,
      insert: {
        article_id: ligne.articleId,
        numero_lot: ligne.numeroLot,
        code_normalise: ligne.numeroLot.toUpperCase(),
        date_jour: new Date().toISOString().slice(0, 10),
        qte_entree: delta > 0 ? delta : 0,
        qte_sortie: delta < 0 ? -delta : 0,
        depot_id: depotId,
        utilisateur: currentUser,
        note: "Correction de stock en lot (fiche Depot)",
      },
    });
  }

  const byTable = new Map<string, Record<string, unknown>[]>();
  for (const item of aCorreger) {
    const list = byTable.get(item.table) ?? [];
    list.push(item.insert);
    byTable.set(item.table, list);
  }

  for (const [table, rows] of byTable.entries()) {
    const { error } = await supabaseServer.from(table).insert(rows);
    if (error) {
      throw new Error(error.message);
    }
  }

  for (const item of aCorreger) {
    if (!item.perte) continue;
    await creerEcriturePerteMp(item.perte.articleId, item.perte.numeroLot, item.perte.quantite, currentUser);
  }

  revalidatePath(`/depots/${depotId}`);
}
