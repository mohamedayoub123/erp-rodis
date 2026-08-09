import { supabaseServer } from "@/lib/supabase-server";

export type ArticleType = "MP" | "PF";

export type DepotLot = { numeroLot: string; solde: number; dateTri: string | null };

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

// Solde par numero_lot pour un article, dans UN depot precis - un lot dont
// depot_id est encore vide (jamais transfere) est considere dans le depot
// par DEFAUT de l'article (voir articles.depot_id), pas invisible partout.
// Trie FEFO : date d'expiration la plus proche en premier pour la MP (seule
// a avoir cette colonne) ; a defaut (PF), date de fabrication la plus
// ancienne en premier ; sans aucune date, ordre alphabetique du numero de
// lot.
export async function fetchLotsInDepot(
  articleType: ArticleType,
  articleId: number,
  depotId: number
): Promise<DepotLot[]> {
  const table = stockTableFor(articleType);
  const dateField = articleType === "MP" ? "date_expiration" : "date_fabrication";

  const [rows, defaultDepotId] = await Promise.all([
    fetchAllRows<{ numero_lot: string | null; qte_entree: number; qte_sortie: number; depot_id: number | null; [key: string]: unknown }>(
      table,
      `numero_lot, qte_entree, qte_sortie, depot_id, ${dateField}`,
      articleId
    ),
    fetchArticleDefaultDepotId(articleType, articleId),
  ]);

  const byLot = new Map<string, DepotLot>();
  for (const row of rows) {
    const effectiveDepotId = row.depot_id ?? defaultDepotId;
    if (effectiveDepotId !== depotId) continue;

    const key = row.numero_lot || "";
    const existing = byLot.get(key) ?? { numeroLot: key, solde: 0, dateTri: null };
    existing.solde += Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    const dateVal = (row[dateField] as string | null) ?? null;
    if (dateVal && !existing.dateTri) existing.dateTri = dateVal;
    byLot.set(key, existing);
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
