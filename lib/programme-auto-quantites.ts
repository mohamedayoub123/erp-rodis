import { HEURES_PAR_JOUR, findCapaciteFabrication, type MachineCapacite } from "@/lib/machine-capacite";

// Programme par ligne : quantites calculees a partir de la capacite des machines (Equipements > machine >
// produits). Fonctions pures (aucun acces base), partagees par la grille (programme-table.tsx).
//
// Quand la chaine de conditionnement a la capacite du produit choisi (ex : 60 pieces/min), Qt carton et
// Vrac a fabriquer se remplissent tout seuls avec ce que la chaine peut produire sur une journee :
// 60 pieces/min x 60 x 8 h = 28 800 pieces, / 48 pieces par carton = 600 cartons, puis vrac = cartons x
// pieces par carton x contenance. C'est la chaine qui decide de la quantite (jamais limitee par la
// fabrication). Quand on choisit la machine de Fabrication, son Max est la taille d'un batch (ex : 3000 kg) :
// le vrac est arrondi au nombre de batchs entiers le plus proche (total / max = 1,9 -> 2 batchs ; 3,4 -> 3 ;
// 3,5 et plus -> 4), le vrac devient batchs x max (6000) et la Qt carton est recalculee depuis ce vrac.
// Le vrac reste modifiable : tant qu'il a ete saisi a la main il n'est plus jamais remplace, et la Qt carton
// suit ce que l'utilisateur ecrit.

// Un carton ou un vrac "juste a la limite" ne doit pas basculer a cause des decimales de l'ordinateur
// (ex : 5760.000000000001 / 0.2 / 48 = 600.0000000000001 donnerait 601 cartons avec un arrondi superieur
// brut) : marge minuscule, sans effet sur une vraie quantite.
export const TOLERANCE_CARTON = 1e-9;

export type ArticleQuantites = {
  id: number;
  contenance: number | null;
  piecePerCarton: number | null;
  // Article vrac derriere le produit fini : la capacite Fabrication est normalement saisie dessus
  vracArticleId: number | null;
};

export function parseVrac(texte: string): number {
  return Number(texte.replace(",", "."));
}

// Qt carton = (vrac / contenance) / pieces par carton, TOUJOURS arrondi au carton superieur (un carton
// entame compte comme un carton entier, meme convention que lib/dispatcher-shared.ts).
export function computeQtCarton(vrac: number, article: ArticleQuantites | null): number | null {
  if (!article || !vrac || vrac <= 0) return null;
  if (!article.contenance || article.contenance <= 0) return null;
  if (!article.piecePerCarton || article.piecePerCarton <= 0) return null;

  const nbPieces = vrac / article.contenance;
  return Math.ceil(nbPieces / article.piecePerCarton - TOLERANCE_CARTON);
}

// "Max possible" sur cette ligne = le plus limitant des 2 machines (jamais juste Conditionnement) -
// demande explicite : "toujours on prend le machine qui peut fait moins". Conditionnement connu via
// (machine Conditionnement, article fini) ; Fabrication connue via (machine Fabrication, article VRAC).
// Une seule des 2 connue = son propre max sert de limite ; aucune des 2 connue = pas de limite calculable
// (retourne null, jamais 0 - une capacite non renseignee n'est pas "zero").
export function computeMaxPossible(
  article: ArticleQuantites | null,
  machineConditionnementId: number | null,
  machineFabricationId: number | null,
  capacites: Map<string, MachineCapacite>
): { maxKg: number; maxCarton: number | null; limitant: "conditionnement" | "fabrication" | "les deux" } | null {
  if (!article) return null;

  const capaCondi =
    machineConditionnementId != null ? capacites.get(`${machineConditionnementId}::${article.id}`) : undefined;
  const capaFab = findCapaciteFabrication(capacites, machineFabricationId, article.vracArticleId, article.id);

  let maxKgCondi: number | null = null;
  if (capaCondi?.capacite && article.contenance && article.contenance > 0) {
    const maxPieces = capaCondi.capacite * HEURES_PAR_JOUR * 60;
    maxKgCondi = maxPieces * article.contenance;
  }

  let maxKgFab: number | null = null;
  if (capaFab?.capaciteMax) {
    maxKgFab = capaFab.capaciteMax * HEURES_PAR_JOUR;
  }

  if (maxKgCondi === null && maxKgFab === null) return null;

  let maxKg: number;
  let limitant: "conditionnement" | "fabrication" | "les deux";
  if (maxKgCondi !== null && maxKgFab !== null) {
    if (Math.abs(maxKgCondi - maxKgFab) < 0.01) {
      maxKg = maxKgCondi;
      limitant = "les deux";
    } else if (maxKgCondi < maxKgFab) {
      maxKg = maxKgCondi;
      limitant = "conditionnement";
    } else {
      maxKg = maxKgFab;
      limitant = "fabrication";
    }
  } else if (maxKgCondi !== null) {
    maxKg = maxKgCondi;
    limitant = "conditionnement";
  } else {
    maxKg = maxKgFab!;
    limitant = "fabrication";
  }

  const maxCarton =
    article.contenance && article.contenance > 0 && article.piecePerCarton && article.piecePerCarton > 0
      ? Math.floor(maxKg / article.contenance / article.piecePerCarton + TOLERANCE_CARTON)
      : null;

  return { maxKg, maxCarton, limitant };
}

const arrondir6 = (valeur: number) => Math.round(valeur * 1e6) / 1e6;

// Taille maximum d'un batch sur la machine de Fabrication choisie (Equipements > machine Fabrication >
// produit : champ Max, une QUANTITE de vrac en kg), null si pas de machine ou pas de Max renseigne.
export function capaciteBatch(
  article: ArticleQuantites | null,
  machineFabricationId: number | null,
  capacites: Map<string, MachineCapacite>
): number | null {
  if (!article || machineFabricationId == null) return null;
  const capa = findCapaciteFabrication(capacites, machineFabricationId, article.vracArticleId, article.id);
  return capa?.capaciteMax && capa.capaciteMax > 0 ? capa.capaciteMax : null;
}

// Arrondi du vrac en batchs entiers : total / max = 3,4 -> 3 batchs, 3,5 et plus -> 4 batchs, et le vrac
// devient batchs x max (batchs pleins) ; de meme 0,96 -> 1 batch plein (2 880 kg pour un max de 3 000 ->
// 3 000). Un vrac qui n'atteint pas la moitie d'un batch reste tel quel (un seul batch partiel, on ne le
// gonfle pas jusqu'au max).
export function arrondirEnBatchs(vrac: number, maxBatch: number): { batchs: number; vrac: number } {
  if (!(vrac > 0) || !(maxBatch > 0)) return { batchs: 0, vrac };
  const ratio = vrac / maxBatch;
  if (ratio < 0.5 - TOLERANCE_CARTON) return { batchs: 1, vrac };
  const batchs = Math.max(1, Math.floor(ratio + 0.5 + TOLERANCE_CARTON));
  return { batchs, vrac: arrondir6(batchs * maxBatch) };
}


export type QuantitesLigne = {
  vracInput: string;
  vrac: number | null;
  qtCarton: number | null;
  // Temps de chaine utilise par cette ligne (cartons x pieces par carton / pieces par minute), null si la
  // chaine n'a pas la capacite de ce produit
  minutes: number | null;
};

const LIGNE_VIDE: QuantitesLigne = { vracInput: "", vrac: null, qtCarton: null, minutes: null };

export type EntreeRepartition = {
  key: string;
  // Chaine de conditionnement choisie sur cette ligne : les lignes d'une meme chaine se partagent sa journee
  machineConditionnementId: number | null;
  article: ArticleQuantites | null;
  // Texte du champ Vrac (ne compte que si vracManuel)
  vracInput: string;
  // true des que le vrac a ete ecrit a la main (ou vient d'un programme de l'historique) : jamais remplace
  vracManuel: boolean;
  machineFabricationId: number | null;
};

export function formatHeures(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const heures = Math.floor(total / 60);
  const reste = total - heures * 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}

// Quantites de TOUTES les lignes du programme. Les lignes d'une meme chaine se partagent sa journee de 8 h :
// - ligne saisie a la main : son vrac reste tel quel, la Qt carton suit, et elle consomme du temps de chaine
//   (cartons x pieces par carton / pieces par minute) ;
// - lignes automatiques (rien saisi) qui ont la capacite sur cette chaine : elles se partagent ce qu'il reste
//   de la journee (8 h moins le temps des lignes saisies a la main), dans l'ordre de la grille, chacune a parts
//   egales de ce qu'il reste : cartons entiers, puis vrac = cartons x pieces par carton x contenance. Une seule
//   ligne = la journee complete ;
// - quand une machine Fabrication avec un Max est choisie sur une ligne automatique, son vrac est arrondi en
//   batchs entiers (arrondirEnBatchs) et la Qt carton est recalculee depuis ce vrac ; le temps reellement
//   utilise apres cet arrondi est retire de ce qui reste pour les lignes suivantes (le 1er article prend son
//   batch plein, le reste du temps va a l'autre) ;
// - ligne automatique sans capacite sur cette chaine : vide (un vrac rempli pour un autre produit ne reste pas).
// Changer une ligne a la main recalcule donc les autres lignes automatiques de la chaine pour garder 8 h.
export function repartirJournee(
  entrees: EntreeRepartition[],
  capacites: Map<string, MachineCapacite>
): Map<string, QuantitesLigne> {
  const minutesJour = HEURES_PAR_JOUR * 60;
  const resultat = new Map<string, QuantitesLigne>();

  type Capa = { capacite: number; contenance: number; piecePerCarton: number };
  const capaDe = (entree: EntreeRepartition): Capa | null => {
    const article = entree.article;
    if (!article || entree.machineConditionnementId == null) return null;
    const capacite = capacites.get(`${entree.machineConditionnementId}::${article.id}`)?.capacite;
    if (!capacite || capacite <= 0) return null;
    if (!article.contenance || article.contenance <= 0) return null;
    if (!article.piecePerCarton || article.piecePerCarton <= 0) return null;
    return { capacite, contenance: article.contenance, piecePerCarton: article.piecePerCarton };
  };
  const minutesDe = (qtCarton: number | null, capa: Capa | null) =>
    qtCarton != null && capa ? (qtCarton * capa.piecePerCarton) / capa.capacite : null;

  const minutesManuelles = new Map<number, number>();
  const autosParChaine = new Map<number, EntreeRepartition[]>();

  for (const entree of entrees) {
    const capa = capaDe(entree);
    if (entree.vracManuel) {
      const nombre = parseVrac(entree.vracInput);
      const qtCarton = computeQtCarton(nombre, entree.article);
      const minutes = minutesDe(qtCarton, capa);
      resultat.set(entree.key, { vracInput: entree.vracInput, vrac: nombre > 0 ? nombre : null, qtCarton, minutes });
      if (minutes != null && entree.machineConditionnementId != null) {
        minutesManuelles.set(entree.machineConditionnementId, (minutesManuelles.get(entree.machineConditionnementId) ?? 0) + minutes);
      }
    } else if (capa && entree.machineConditionnementId != null) {
      autosParChaine.set(entree.machineConditionnementId, [...(autosParChaine.get(entree.machineConditionnementId) ?? []), entree]);
    } else {
      resultat.set(entree.key, LIGNE_VIDE);
    }
  }

  for (const [chaineId, autos] of autosParChaine) {
    // Les lignes automatiques se servent dans l'ordre de la grille : chacune prend sa part a parts egales de
    // ce qu'il reste (restant / nombre de lignes pas encore servies), puis son vrac est arrondi en batchs
    // entiers, et c'est le temps REELLEMENT utilise (apres arrondi) qui est retire de ce qui reste pour les
    // suivantes : "le 1er prend son batch plein (3 000), le reste va a l'autre article".
    let restant = Math.max(0, minutesJour - (minutesManuelles.get(chaineId) ?? 0));
    let nonServies = autos.length;

    for (const entree of autos) {
      const part = restant / nonServies;
      nonServies--;
      const capa = capaDe(entree)!;
      const cartons = Math.floor((capa.capacite * part) / capa.piecePerCarton + TOLERANCE_CARTON);
      if (cartons <= 0) {
        resultat.set(entree.key, LIGNE_VIDE);
        continue;
      }

      let vrac = arrondir6(cartons * capa.piecePerCarton * capa.contenance);
      let qtCarton = cartons;
      const maxBatch = capaciteBatch(entree.article, entree.machineFabricationId, capacites);
      if (maxBatch) {
        const arrondi = arrondirEnBatchs(vrac, maxBatch);
        if (arrondi.vrac !== vrac) {
          vrac = arrondi.vrac;
          qtCarton = computeQtCarton(vrac, entree.article) ?? cartons;
        }
      }
      const minutes = minutesDe(qtCarton, capa);
      resultat.set(entree.key, { vracInput: String(vrac), vrac, qtCarton, minutes });
      restant = Math.max(0, restant - (minutes ?? 0));
    }
  }

  return resultat;
}
