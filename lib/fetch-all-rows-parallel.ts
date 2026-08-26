// Recupere toutes les pages d'une requete PostgREST EN PARALLELE plutot
// qu'une par une - une pagination sequentielle (une page apres l'autre) sur
// une table volumineuse ou peu filtree peut a elle seule prendre plusieurs
// secondes (constate sur lots_stock/lots_stock_matiere_premiere : 10s+ pour
// ~18000 lignes en 18 pages sequentielles). Le count exact permet de
// connaitre le nombre de pages a l'avance et de toutes les lancer d'un coup.
export async function fetchAllRowsParallel<T>(
  countQuery: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  pageQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const { count, error: countError } = await countQuery();

  if (countError) {
    throw new Error(countError.message);
  }

  const total = count ?? 0;
  if (total === 0) return [];

  const pageStarts: number[] = [];
  for (let from = 0; from < total; from += pageSize) {
    pageStarts.push(from);
  }

  const pages = await Promise.all(pageStarts.map((from) => pageQuery(from, from + pageSize - 1)));

  const rows: T[] = [];
  for (const { data, error } of pages) {
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
  }

  return rows;
}
