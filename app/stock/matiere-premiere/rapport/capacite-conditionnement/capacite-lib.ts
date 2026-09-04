import { supabaseServer } from "@/lib/supabase-server";

export type StockActuelMpRow = {
  article_id: number;
  nom_article: string;
  unite: string | null;
  stock_actuel: number;
};

export type RecetteLigneRow = {
  id: number;
  article_pf_id: number;
  article_mp_id: number;
  quantite: number;
};

export type LigneCapacite = {
  ligneId: number;
  nomArticle: string;
  unite: string | null;
  quantiteParCarton: number | null;
  stockActuel: number;
  cartonsPossibles: number | null;
};

export async function fetchStockActuelMp(): Promise<StockActuelMpRow[]> {
  const rows: StockActuelMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.rpc("stock_actuel_mp_rows").range(from, from + pageSize - 1);
    if (error) return rows;
    const chunk = (data ?? []) as StockActuelMpRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Pour chaque article de la recette, combien de cartons son stock actuel
// permet a lui seul (stock / quantite necessaire par carton) - le plus
// petit de tous est le goulot d'etranglement de la production reelle.
export function computeLignesCapacite(
  lignes: { id: number; article_mp_id: number; quantite: number }[],
  quantiteRecetteBase: number | null,
  stockById: Map<number, StockActuelMpRow>
): LigneCapacite[] {
  return lignes.map((ligne) => {
    const stockInfo = stockById.get(ligne.article_mp_id);
    const quantiteParCarton =
      quantiteRecetteBase && quantiteRecetteBase > 0 ? ligne.quantite / quantiteRecetteBase : null;
    const stockActuel = stockInfo?.stock_actuel ?? 0;
    const cartonsPossibles =
      quantiteParCarton !== null && quantiteParCarton > 0 ? Math.floor(stockActuel / quantiteParCarton) : null;

    return {
      ligneId: ligne.id,
      nomArticle: stockInfo?.nom_article || `Article #${ligne.article_mp_id}`,
      unite: stockInfo?.unite ?? null,
      quantiteParCarton,
      stockActuel,
      cartonsPossibles,
    };
  });
}

export function computeCartonsPossiblesTotal(lignesCapacite: LigneCapacite[]): number | null {
  const valeurs = lignesCapacite
    .map((ligne) => ligne.cartonsPossibles)
    .filter((value): value is number => value !== null);
  return valeurs.length > 0 ? Math.min(...valeurs) : null;
}

export function findLigneLimitante(
  lignesCapacite: LigneCapacite[],
  cartonsPossiblesTotal: number | null
): LigneCapacite | null {
  if (cartonsPossiblesTotal === null) return null;
  return lignesCapacite.find((ligne) => ligne.cartonsPossibles === cartonsPossiblesTotal) ?? null;
}
