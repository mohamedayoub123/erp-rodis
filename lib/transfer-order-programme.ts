// "Verifier stock" d'un programme -> "Creer les Transfer Order" : comment le besoin est reparti entre les TO. Calcul pur (aucun acces base),
// partage par Programme par ligne et Programme MB.
//
// - Articles de CONDITIONNEMENT (sleeve, carton, flacon, capsule...) : UNE SEULE TO pour tout le programme, toutes familles de produit
//   confondues (le meme article n'y apparait qu'une fois, avec son besoin total).
// - Colorant / Base / MP : comme avant, une TO par famille de produit fini.
// Une TO ne part que d'un seul depot : des articles ranges dans 2 depots differents donnent forcement 2 TO.

export type SousGroupe = "Colorant-Base" | "Autre";

export type TransferOrderPrevu = {
  depotSourceId: number;
  typeMp: "MP" | "Conditionnement";
  famille: string;
  lignes: { mpArticleId: number; besoin: number }[];
};

export function repartirEnTransferOrders(args: {
  // besoin par famille de produit fini, puis par article MP
  besoinParGroupeMp: Map<string, Map<number, number>>;
  articleMp: (mpArticleId: number) => { nom_article: string; categorie: string | null; depot_id: number | null } | undefined;
  sousGroupeDe: (categorie: string | null) => SousGroupe;
  depotDestinationId: number;
}): { transferOrders: TransferOrderPrevu[]; articlesSansDepot: string[] } {
  const sansDepot = new Set<string>();
  const parCle = new Map<string, { depotSourceId: number; typeMp: "MP" | "Conditionnement"; familles: Set<string>; lignes: Map<number, number> }>();

  for (const [famille, besoinMap] of args.besoinParGroupeMp) {
    for (const [mpArticleId, besoin] of besoinMap) {
      if (besoin <= 0) continue;
      const article = args.articleMp(mpArticleId);
      const depotSourceId = article?.depot_id ?? null;
      // Pas de depot par defaut connu : impossible de savoir d'ou transferer (jamais devine, signale a l'ecran)
      if (!depotSourceId) {
        sansDepot.add(article?.nom_article ?? `#${mpArticleId}`);
        continue;
      }
      if (depotSourceId === args.depotDestinationId) continue; // deja au depot de destination

      const conditionnement = args.sousGroupeDe(article?.categorie ?? null) === "Autre";
      const cle = conditionnement ? `Conditionnement::${depotSourceId}` : `MP::${famille}::${depotSourceId}`;
      const prevu = parCle.get(cle) ?? {
        depotSourceId,
        typeMp: conditionnement ? ("Conditionnement" as const) : ("MP" as const),
        familles: new Set<string>(),
        lignes: new Map<number, number>(),
      };
      prevu.familles.add(famille);
      prevu.lignes.set(mpArticleId, (prevu.lignes.get(mpArticleId) ?? 0) + besoin);
      parCle.set(cle, prevu);
    }
  }

  return {
    transferOrders: [...parCle.values()].map((prevu) => ({
      depotSourceId: prevu.depotSourceId,
      typeMp: prevu.typeMp,
      famille: [...prevu.familles].join(" + "),
      lignes: [...prevu.lignes].map(([mpArticleId, besoin]) => ({ mpArticleId, besoin })),
    })),
    articlesSansDepot: [...sansDepot],
  };
}

// Quantite demandee sur la TO : plafonnee au disponible ; le conditionnement se compte en pieces entieres (313,2 cartons = 314), le
// colorant et la base gardent 3 decimales. La petite marge evite qu'un total comme 100,0000000001 devienne 101.
export function quantiteDemandee(besoin: number, disponible: number, typeMp: "MP" | "Conditionnement"): number {
  const brute = Math.min(besoin, disponible);
  return typeMp === "MP" ? Math.round(brute * 1000) / 1000 : Math.ceil(brute - 1e-6);
}
