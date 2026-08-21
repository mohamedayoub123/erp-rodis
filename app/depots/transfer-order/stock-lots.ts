import { supabaseServer } from "@/lib/supabase-server";
import { convertirEnFcfa } from "@/lib/prix-devise";

export type ArticleType = "MP" | "PF";

export type DepotLot = {
  numeroLot: string;
  solde: number;
  dateTri: string | null;
  // Prix reel du dossier d'achat qui a cree ce lot (FCFA, converti) - null
  // pour un article PF (pas de prix par lot) ou un lot MP sans prix connu.
  // Utilise par lib/prix-revient.ts pour couter par dossier reel (FEFO)
  // plutot que par "dernier prix connu" toutes dates/tous depots confondus.
  prixUnitaireFcfa: number | null;
  nDossErp: string | null;
  nDoss4d: string | null;
};

async function fetchAllRows<T>(table: string, select: string, articleId: number): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(select)
      .eq("article_id", articleId)
      .range(from, from + pageSize - 1);

    if (error) break;

    rows.push(...((data ?? []) as T[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export function stockTableFor(articleType: ArticleType) {
  return articleType === "MP" ? "lots_stock_matiere_premiere" : "lots_stock";
}

export async function fetchArticleDefaultDepotId(
  articleType: ArticleType,
  articleId: number
): Promise<number | null> {
  const table = articleType === "MP" ? "articles_matiere_premiere" : "articles";
  const { data } = await supabaseServer.from(table).select("depot_id").eq("id", articleId).maybeSingle();
  return (data as { depot_id: number | null } | null)?.depot_id ?? null;
}

// Une ligne par lot deja "promis" a un AUTRE Transfer Order (approuve, donc
// avec des transfer_order_ligne_lots) pour ce meme article - jointure
// manuelle en 3 requetes (pas de relation FK exposee dans le cache
// PostgREST), meme convention que le reste de l'appli. La quantite d'un
// transfer_order_ligne_lots represente toujours ce qui reste ENCORE a
// livrer (reduite au fur et a mesure par validateInvoiceOrderAction quand
// le stock bouge reellement) - jamais de double-compte possible.
async function fetchReservationRows(
  articleType: ArticleType,
  articleId: number
): Promise<{ transferOrderId: number; depotSourceId: number; numeroLot: string | null; quantite: number }[]> {
  const { data: lignesData } = await supabaseServer
    .from("transfer_order_lignes")
    .select("id, transfer_order_id")
    .eq("article_type", articleType)
    .eq("article_id", articleId);

  const lignes = (lignesData ?? []) as { id: number; transfer_order_id: number }[];
  if (lignes.length === 0) return [];

  const transferOrderIdByLigneId = new Map(lignes.map((l) => [l.id, l.transfer_order_id]));
  const transferOrderIds = [...new Set(lignes.map((l) => l.transfer_order_id))];

  const [{ data: ligneLotsData }, { data: transferOrdersData }] = await Promise.all([
    supabaseServer
      .from("transfer_order_ligne_lots")
      .select("transfer_order_ligne_id, numero_lot, quantite")
      .in("transfer_order_ligne_id", lignes.map((l) => l.id)),
    supabaseServer.from("transfer_orders").select("id, depot_source_id").in("id", transferOrderIds),
  ]);

  const depotSourceByTransferOrderId = new Map(
    ((transferOrdersData ?? []) as { id: number; depot_source_id: number }[]).map((t) => [t.id, t.depot_source_id])
  );

  return (
    (ligneLotsData ?? []) as { transfer_order_ligne_id: number; numero_lot: string | null; quantite: number }[]
  )
    .map((row) => {
      const transferOrderId = transferOrderIdByLigneId.get(row.transfer_order_ligne_id);
      const depotSourceId = transferOrderId ? depotSourceByTransferOrderId.get(transferOrderId) : null;
      return transferOrderId && depotSourceId
        ? { transferOrderId, depotSourceId, numeroLot: row.numero_lot, quantite: Number(row.quantite ?? 0) }
        : null;
    })
    .filter((row): row is { transferOrderId: number; depotSourceId: number; numeroLot: string | null; quantite: number } => row !== null);
}

// Quantite deja reservee par numero_lot, dans UN depot precis - exclut
// eventuellement le Transfer Order en cours d'approbation/edition lui-meme
// (sa propre reservation ne doit pas se bloquer elle-meme).
export async function fetchReservedByLot(
  articleType: ArticleType,
  articleId: number,
  depotId: number,
  excludeTransferOrderId?: number
): Promise<Map<string, number>> {
  const rows = await fetchReservationRows(articleType, articleId);
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.depotSourceId !== depotId) continue;
    if (excludeTransferOrderId && row.transferOrderId === excludeTransferOrderId) continue;
    const key = row.numeroLot || "";
    map.set(key, (map.get(key) ?? 0) + row.quantite);
  }
  return map;
}

// Quantite deja reservee, total par depot source - utilise pour affichage
// (page Produit), tous depots confondus pour un article.
export async function fetchReservedTotalsByDepot(
  articleType: ArticleType,
  articleId: number
): Promise<Map<number, number>> {
  const rows = await fetchReservationRows(articleType, articleId);
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.depotSourceId, (map.get(row.depotSourceId) ?? 0) + row.quantite);
  }
  return map;
}

// Solde par numero_lot pour un article, dans UN depot precis - un lot dont
// depot_id est encore vide (jamais transfere) est considere dans le depot
// par DEFAUT de l'article (voir articles.depot_id), pas invisible partout.
// Le solde est deja net de ce qui est reserve par un AUTRE Transfer Order
// approuve sur ce meme lot (voir fetchReservedByLot) - jamais deux Transfer
// Order ne peuvent se disputer le meme stock. Trie FEFO : date d'expiration
// la plus proche en premier pour la MP (seule a avoir cette colonne) ; a
// defaut (PF), date de fabrication la plus ancienne en premier ; sans
// aucune date, ordre alphabetique du numero de lot.
export async function fetchLotsInDepot(
  articleType: ArticleType,
  articleId: number,
  depotId: number,
  excludeTransferOrderId?: number
): Promise<DepotLot[]> {
  const table = stockTableFor(articleType);
  const dateField = articleType === "MP" ? "date_expiration" : "date_fabrication";
  const prixFields = articleType === "MP" ? ", prix_unitaire, devise, taux_change, n_doss_erp, n_doss_4d" : "";

  const [rows, defaultDepotId, reservedByLot] = await Promise.all([
    fetchAllRows<{ numero_lot: string | null; qte_entree: number; qte_sortie: number; depot_id: number | null; [key: string]: unknown }>(
      table,
      `numero_lot, qte_entree, qte_sortie, depot_id, ${dateField}${prixFields}`,
      articleId
    ),
    fetchArticleDefaultDepotId(articleType, articleId),
    fetchReservedByLot(articleType, articleId, depotId, excludeTransferOrderId),
  ]);

  const byLot = new Map<string, DepotLot>();
  for (const row of rows) {
    const effectiveDepotId = row.depot_id ?? defaultDepotId;
    if (effectiveDepotId !== depotId) continue;

    const key = row.numero_lot || "";
    const existing = byLot.get(key) ?? { numeroLot: key, solde: 0, dateTri: null, prixUnitaireFcfa: null, nDossErp: null, nDoss4d: null };
    existing.solde += Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    const dateVal = (row[dateField] as string | null) ?? null;
    if (dateVal && !existing.dateTri) existing.dateTri = dateVal;

    // Le prix/dossier vient de la ligne d'ENTREE (la reception qui a cree ce
    // lot) - une ligne de sortie n'a jamais son propre prix. Premiere entree
    // rencontree avec un prix connu qui gagne (un numero_lot ne devrait
    // normalement correspondre qu'a UNE seule reception).
    if (existing.prixUnitaireFcfa === null && Number(row.qte_entree ?? 0) > 0 && row.prix_unitaire != null) {
      existing.prixUnitaireFcfa = convertirEnFcfa(
        row.prix_unitaire as number,
        (row.devise as string | null) ?? null,
        (row.taux_change as number | null) ?? null
      );
      existing.nDossErp = (row.n_doss_erp as string | null) ?? null;
      existing.nDoss4d = (row.n_doss_4d as string | null) ?? null;
    }

    byLot.set(key, existing);
  }

  for (const [numeroLot, reserved] of reservedByLot.entries()) {
    const existing = byLot.get(numeroLot);
    if (existing) existing.solde -= reserved;
  }

  return [...byLot.values()]
    .filter((lot) => lot.solde > 1e-6)
    .sort((a, b) => {
      if (a.dateTri && b.dateTri) return a.dateTri.localeCompare(b.dateTri);
      if (a.dateTri) return -1;
      if (b.dateTri) return 1;
      return a.numeroLot.localeCompare(b.numeroLot, "fr", { sensitivity: "base" });
    });
}

export function totalAvailable(lots: { solde: number }[]) {
  return lots.reduce((sum, lot) => sum + lot.solde, 0);
}

// Total reel au depot, TOUS lots confondus (pas de regroupement par
// numero_lot) moins deja reserve - contrairement a fetchLotsInDepot (qui
// regroupe par lot et exclut les lots au solde negatif, pense pour choisir
// un lot precis a transferer), celle-ci repond juste a "y a-t-il assez au
// total", peu importe le lot. Necessaire car une sortie peut arriver sans
// numero_lot precis (ex: consommation production automatique) - avec
// fetchLotsInDepot, une telle sortie se retrouve isolee dans son propre
// groupe "lot vide", qui devient negatif et se fait filtrer, faisant
// paraitre disponible un stock qui ne l'est plus (le solde du/des VRAIS
// lots reste affiche seul, sans jamais voir cette sortie).
export async function fetchTotalStockInDepot(
  articleType: ArticleType,
  articleId: number,
  depotId: number,
  excludeTransferOrderId?: number
): Promise<number> {
  const table = stockTableFor(articleType);

  const [rows, defaultDepotId, reservedByLot] = await Promise.all([
    fetchAllRows<{ qte_entree: number; qte_sortie: number; depot_id: number | null }>(
      table,
      "qte_entree, qte_sortie, depot_id",
      articleId
    ),
    fetchArticleDefaultDepotId(articleType, articleId),
    fetchReservedByLot(articleType, articleId, depotId, excludeTransferOrderId),
  ]);

  let total = 0;
  for (const row of rows) {
    const effectiveDepotId = row.depot_id ?? defaultDepotId;
    if (effectiveDepotId !== depotId) continue;
    total += Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
  }

  let totalReserved = 0;
  for (const reserved of reservedByLot.values()) {
    totalReserved += reserved;
  }

  return total - totalReserved;
}

// Repartit une quantite demandee sur les lots disponibles, dans l'ORDRE
// deja trie FEFO par fetchLotsInDepot - vide en premier le lot avec la date
// d'expiration/fabrication la plus proche.
export function allocateFefo(
  lots: DepotLot[],
  quantite: number
): { allocations: { numero_lot: string; quantite: number }[]; covered: boolean } {
  const allocations: { numero_lot: string; quantite: number }[] = [];
  let remaining = quantite;

  for (const lot of lots) {
    if (remaining <= 1e-9) break;
    const take = Math.min(lot.solde, remaining);
    if (take > 1e-9) {
      allocations.push({ numero_lot: lot.numeroLot, quantite: Math.round(take * 1000) / 1000 });
      remaining -= take;
    }
  }

  return { allocations, covered: remaining <= 1e-6 };
}
