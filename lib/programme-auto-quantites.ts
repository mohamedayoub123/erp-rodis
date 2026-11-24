import { HEURES_PAR_JOUR, findCapaciteFabrication, type MachineCapacite } from "@/lib/machine-capacite";

// Programme par ligne : quantites calculees a partir de la capacite des machines (Equipements > machine >
// produits). Fonctions pures (aucun acces base), partagees par la grille (programme-table.tsx).
//
// Quand la chaine de conditionnement a la capacite du produit choisi (ex : 60 pieces/min), Qt carton et
// Vrac a fabriquer se remplissent tout seuls avec ce que la chaine peut produire sur une journee :
// 60 pieces/min x 60 x 8 h = 28 800 pieces, / 48 pieces par carton = 600 cartons, puis vrac = cartons x
// pieces par carton x contenance. Le vrac reste modifiable : tant qu'il a ete saisi a la main il n'est plus
// jamais remplace, et la Qt carton suit ce que l'utilisateur ecrit.

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

// Quantites proposees automatiquement : le maximum de cartons que la machine la plus limitante peut faire
// sur une journee (cartons entiers), et le vrac correspondant. null si on ne peut pas les calculer
// (aucune capacite, ou contenance / pieces par carton inconnues).
export function calculerQuantitesAuto(
  article: ArticleQuantites | null,
  machineConditionnementId: number | null,
  machineFabricationId: number | null,
  capacites: Map<string, MachineCapacite>
): { cartons: number; vrac: number } | null {
  const max = computeMaxPossible(article, machineConditionnementId, machineFabricationId, capacites);
  if (!max || !article || max.maxCarton === null || max.maxCarton <= 0) return null;
  const { contenance, piecePerCarton } = article;
  if (!contenance || !piecePerCarton) return null;
  return { cartons: max.maxCarton, vrac: arrondir6(max.maxCarton * piecePerCarton * contenance) };
}

export type QuantitesLigne = {
  vracInput: string;
  vrac: number | null;
  qtCarton: number | null;
};

// Quantites de la ligne apres un choix de produit (ou de machine Fabrication) :
// - vrac saisi a la main : il reste tel quel, la Qt carton suit (comportement d'avant) ;
// - sinon : quantites automatiques de la machine si elle a la capacite du produit, sinon rien (un vrac
//   rempli automatiquement pour l'ancien produit ne doit pas rester sur le nouveau).
export function quantitesLigne(params: {
  article: ArticleQuantites | null;
  vracInput: string;
  vracManuel: boolean;
  machineConditionnementId: number | null;
  machineFabricationId: number | null;
  capacites: Map<string, MachineCapacite>;
}): QuantitesLigne {
  const { article, vracInput, vracManuel, machineConditionnementId, machineFabricationId, capacites } = params;

  if (vracManuel) {
    const nombre = parseVrac(vracInput);
    return { vracInput, vrac: nombre > 0 ? nombre : null, qtCarton: computeQtCarton(nombre, article) };
  }

  const auto = calculerQuantitesAuto(article, machineConditionnementId, machineFabricationId, capacites);
  if (!auto) return { vracInput: "", vrac: null, qtCarton: null };
  return { vracInput: String(auto.vrac), vrac: auto.vrac, qtCarton: auto.cartons };
}
