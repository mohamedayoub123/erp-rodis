export type ArticleType = "MP" | "PF";

type LotRow = {
  article_id: number | null;
  qte_entree: number;
  qte_sortie: number;
  depot_id: number | null;
};

// Solde par (article, depot) - un lot dont depot_id est encore vide (jamais
// transfere) est considere dans le depot par DEFAUT de son article (voir
// articles.depot_id / articles_matiere_premiere.depot_id), meme regle que
// app/depots/[id]/page.tsx et app/depots/transfer-order/stock-lots.ts.
export function computeStockByArticleDepot(
  lots: LotRow[],
  defaultDepotIdByArticleId: Map<number, number | null>
): Map<string, number> {
  const map = new Map<string, number>();

  for (const lot of lots) {
    if (!lot.article_id) continue;
    const effectiveDepotId = lot.depot_id ?? defaultDepotIdByArticleId.get(lot.article_id) ?? null;
    if (effectiveDepotId === null) continue;

    const key = `${lot.article_id}::${effectiveDepotId}`;
    map.set(key, (map.get(key) ?? 0) + Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0));
  }

  return map;
}

export function stockKey(articleId: number, depotId: number) {
  return `${articleId}::${depotId}`;
}
