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

// Variante en UN SEUL aller-retour pour les cas courants : la 1re page est demandee avec le compte exact dans la meme requete (au lieu
// d'une requete de comptage PUIS les pages). Si tout tient dans cette page (<= pageSize lignes), c'est fini ; sinon les pages restantes
// partent d'un coup, en parallele. pageQuery recoit avecCompte = true uniquement pour la 1re page. La requete doit etre triee sur une
// colonne UNIQUE (ou finir par l'id), sinon des lignes peuvent etre doublees ou sautees d'une page a l'autre.
export async function fetchAllRowsFirstPageCount<T>(
  pageQuery: (
    from: number,
    to: number,
    avecCompte: boolean
  ) => PromiseLike<{ data: T[] | null; count?: number | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const premiere = await pageQuery(0, pageSize - 1, true);
  if (premiere.error) throw new Error(premiere.error.message);

  const rows: T[] = [...(premiere.data ?? [])];
  const total = premiere.count ?? rows.length;
  if (total <= pageSize) return rows;

  const departs: number[] = [];
  for (let from = pageSize; from < total; from += pageSize) departs.push(from);

  const pages = await Promise.all(departs.map((from) => pageQuery(from, from + pageSize - 1, false)));
  for (const { data, error } of pages) {
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}
