// Lecture d'une longue liste (ex: tous les mouvements Produit Fini) partagee entre les affichages, SANS jamais
// montrer une liste perimee apres un enregistrement.
//
// Avant : chaque ouverture d'une page de mouvements relisait toute la liste, page de 1000 lignes apres page de
// 1000 lignes (8 allers-retours d'affilee, ~13 000 lectures en une journee). Maintenant, a chaque affichage on ne
// fait qu'une toute petite requete d'"empreinte" (nombre de lignes + dernier numero) :
// - empreinte inchangee -> la liste deja lue est reutilisee (plus de relecture) ;
// - empreinte differente (une ligne a ete ajoutee ou supprimee, par n'importe quelle instance du serveur) -> la
//   liste est relue tout de suite, donc un mouvement qu'on vient d'enregistrer apparait immediatement ;
// - plusieurs affichages simultanes avec la meme empreinte partagent UNE seule lecture.
// Seule une modification "sur place" d'une ligne existante (ni ajout ni suppression) peut rester invisible
// jusqu'a "dureeMaxMs" - c'est la limite de garde de la liste.

export function creerLecteurValide<T>(options: {
  lireEmpreinte: () => Promise<string>;
  lireTout: () => Promise<T[]>;
  dureeMaxMs: number;
}) {
  let cache: { empreinte: string; jusqua: number; lignes: T[] } | null = null;
  let enCours: { empreinte: string; promesse: Promise<T[]> } | null = null;

  return async function lire(): Promise<T[]> {
    const empreinte = await options.lireEmpreinte();

    if (cache && cache.empreinte === empreinte && cache.jusqua > Date.now()) return [...cache.lignes];
    if (enCours && enCours.empreinte === empreinte) return [...(await enCours.promesse)];

    const promesse: Promise<T[]> = options
      .lireTout()
      .then((lignes) => {
        cache = { empreinte, jusqua: Date.now() + options.dureeMaxMs, lignes };
        return lignes;
      })
      .finally(() => {
        if (enCours?.promesse === promesse) enCours = null;
      });
    enCours = { empreinte, promesse };
    return [...(await promesse)];
  };
}

// Lit toutes les pages d'une requete PostgREST (1000 lignes max par page) avec un nombre LIMITE de pages en
// parallele : plus rapide qu'une page a la fois, sans lancer d'un coup des dizaines de requetes sur la base.
export async function lirePagesAvecLimite<T>(
  compter: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  lirePage: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  parallele = 6,
  taillePage = 1000
): Promise<T[]> {
  const { count, error: erreurCompte } = await compter();
  if (erreurCompte) throw new Error(erreurCompte.message);

  const total = count ?? 0;
  const debuts: number[] = [];
  for (let debut = 0; debut < total; debut += taillePage) debuts.push(debut);

  const pages: T[][] = [];
  for (let i = 0; i < debuts.length; i += parallele) {
    const lot = debuts.slice(i, i + parallele);
    const resultats = await Promise.all(lot.map((debut) => lirePage(debut, debut + taillePage - 1)));
    for (const { data, error } of resultats) {
      if (error) throw new Error(error.message);
      pages.push(data ?? []);
    }
  }
  return pages.flat();
}
