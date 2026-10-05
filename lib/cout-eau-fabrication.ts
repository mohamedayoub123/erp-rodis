// Eau utilisee dans le mois, calculee AUTOMATIQUEMENT a partir de ce qui a ete
// fabrique (vrac fabrique saisi dans Entree production, en kg) :
//   litres d'eau = kg fabriques AVEC eau x 60 %
// Les produits SAVON, HUILE, SERUM et TALC n'utilisent pas d'eau : leur
// quantite est comptee (affichee) mais elle n'entre pas dans la base du calcul.

export const POURCENTAGE_EAU = 60;

// Familles de produits qui n'utilisent pas d'eau (cle = nom normalise).
export const FAMILLES_SANS_EAU = ["savon", "huile", "serum", "talc"] as const;
export type FamilleSansEau = (typeof FAMILLES_SANS_EAU)[number];

export const LIBELLES_SANS_EAU: Record<FamilleSansEau, string> = {
  savon: "Savon",
  huile: "Huile",
  serum: "Serum",
  talc: "Talc",
};

function normaliser(texte: string | null | undefined): string {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Famille "sans eau" d'une ligne de programme : le type de l'article quand il
// est renseigne, sinon le debut du nom du produit (SAVON ..., HUILE ...) - meme
// repere que le Tableau de commande. null = produit avec eau.
export function familleSansEau(
  typeArticle: string | null | undefined,
  produit: string | null | undefined
): FamilleSansEau | null {
  const type = normaliser(typeArticle);
  const nom = normaliser(produit);
  for (const famille of FAMILLES_SANS_EAU) {
    if (type === famille) return famille;
  }
  for (const famille of FAMILLES_SANS_EAU) {
    if (nom === famille || nom.startsWith(`${famille} `)) return famille;
  }
  return null;
}

export type EauDuMois = {
  // Tout le vrac fabrique dans le mois (kg)
  kgTotal: number;
  // Part des produits sans eau (kg), au total puis par famille
  kgSansEau: number;
  parFamille: Record<FamilleSansEau, number>;
  // Base du calcul : kg fabriques avec eau
  kgAvecEau: number;
  pourcentage: number;
  litres: number;
  // Nombre d'entrees de fabrication comptees
  nombreEntrees: number;
};

// Electricite du mois, calculee a partir des litres d'eau : la machine produit
// "debit" litres par heure et consomme "puissance" kW quand elle tourne.
//   heures de marche = litres / debit      kWh = heures x puissance
// Exemple : debit 9000 L/h, 30 kW -> 9000 L = 30 kWh, 18000 L = 60 kWh.
export const DEBIT_MACHINE_PAR_DEFAUT = 9000;
export const PUISSANCE_LIGNE_PAR_DEFAUT_KW = 30;

export type ElectriciteLigneDuMois = {
  litres: number;
  debitLitresHeure: number;
  puissanceKw: number;
  heures: number;
  kwh: number;
};

export function calculerElectricite(
  litres: number,
  debitLitresHeure: number | null,
  puissanceKw: number | null
): ElectriciteLigneDuMois | null {
  if (!debitLitresHeure || debitLitresHeure <= 0 || puissanceKw === null) return null;
  const heures = litres / debitLitresHeure;
  return { litres, debitLitresHeure, puissanceKw, heures, kwh: heures * puissanceKw };
}

// Les litres du mois ne sont pas connus ligne par ligne : tant que la part de
// chaque ligne n'est pas saisie, l'eau est repartie a parts egales entre la
// Ligne 1 et la Ligne 2 (avec les memes kW et le meme debit sur les deux lignes,
// le total est identique quelle que soit la repartition).
export const PART_EAU_PAR_LIGNE = 0.5;

export type ElectriciteDuMois = {
  ligne1: ElectriciteLigneDuMois | null;
  ligne2: ElectriciteLigneDuMois | null;
  litres: number;
  heures: number;
  kwh: number;
};

export function calculerElectriciteDuMois(
  litres: number,
  ligne1: { debitLitresHeure: number | null; puissanceKw: number | null },
  ligne2: { debitLitresHeure: number | null; puissanceKw: number | null }
): ElectriciteDuMois {
  const part = litres * PART_EAU_PAR_LIGNE;
  const l1 = calculerElectricite(part, ligne1.debitLitresHeure, ligne1.puissanceKw);
  const l2 = calculerElectricite(part, ligne2.debitLitresHeure, ligne2.puissanceKw);
  return {
    ligne1: l1,
    ligne2: l2,
    litres,
    heures: (l1?.heures ?? 0) + (l2?.heures ?? 0),
    kwh: (l1?.kwh ?? 0) + (l2?.kwh ?? 0),
  };
}

type EntreeFabrication = { quantite: number; famille: FamilleSansEau | null };

export function calculerEauDuMois(entrees: EntreeFabrication[]): EauDuMois {
  const parFamille: Record<FamilleSansEau, number> = { savon: 0, huile: 0, serum: 0, talc: 0 };
  let kgTotal = 0;
  let kgSansEau = 0;

  for (const entree of entrees) {
    if (!Number.isFinite(entree.quantite) || entree.quantite <= 0) continue;
    kgTotal += entree.quantite;
    if (entree.famille) {
      parFamille[entree.famille] += entree.quantite;
      kgSansEau += entree.quantite;
    }
  }

  const kgAvecEau = kgTotal - kgSansEau;
  return {
    kgTotal,
    kgSansEau,
    parFamille,
    kgAvecEau,
    pourcentage: POURCENTAGE_EAU,
    litres: (kgAvecEau * POURCENTAGE_EAU) / 100,
    nombreEntrees: entrees.filter((e) => Number.isFinite(e.quantite) && e.quantite > 0).length,
  };
}
