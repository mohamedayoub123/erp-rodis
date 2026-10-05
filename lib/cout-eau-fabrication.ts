// Eau utilisee dans le mois, calculee AUTOMATIQUEMENT a partir des quantites du
// Rapport Test labo du mois (quantites commandees PD des preparations passees au
// Test labo, en kg - pas les quantites reellement fabriquees) :
//   litres d'eau = kg AVEC eau x 60 %
// Les produits SAVON, HUILE, SERUM et TALC n'utilisent pas d'eau : leur
// quantite est comptee (affichee) mais elle n'entre pas dans la base du calcul.

// Pourcentage d'eau par defaut : modifiable mois par mois dans "Prix des consommables".
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
  // Tout le vrac du mois (kg)
  kgTotal: number;
  // Part des produits sans eau (kg), au total puis par famille
  kgSansEau: number;
  parFamille: Record<FamilleSansEau, number>;
  // Base du calcul : kg avec eau
  kgAvecEau: number;
  pourcentage: number;
  litres: number;
  // Nombre de preparations comptees
  nombreEntrees: number;
};

// Electricite du mois, calculee a partir des litres d'eau : la machine produit
// "debit" litres par heure et consomme "puissance" kW quand elle tourne.
//   heures de marche = litres / debit      kWh = heures x puissance
// Le debit de l'osmose est FIXE (9000 litres par heure, rien a saisir) ; les kW de
// chaque ligne sont ceux SAISIS dans "Prix des consommables" (aucune valeur par
// defaut). Exemple : 30 kW -> 9000 L = 30 kWh, 18000 L = 60 kWh.
export const DEBIT_OSMOSE_LITRES_HEURE = 9000;

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
// Ligne 1 et la Ligne 2 (avec les memes kW sur les deux lignes, le total est
// identique quelle que soit la repartition).
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
  ligne1: { puissanceKw: number | null },
  ligne2: { puissanceKw: number | null }
): ElectriciteDuMois {
  const part = litres * PART_EAU_PAR_LIGNE;
  const l1 = calculerElectricite(part, DEBIT_OSMOSE_LITRES_HEURE, ligne1.puissanceKw);
  const l2 = calculerElectricite(part, DEBIT_OSMOSE_LITRES_HEURE, ligne2.puissanceKw);
  return {
    ligne1: l1,
    ligne2: l2,
    litres,
    heures: (l1?.heures ?? 0) + (l2?.heures ?? 0),
    kwh: (l1?.kwh ?? 0) + (l2?.kwh ?? 0),
  };
}

type EntreeFabrication = { quantite: number; famille: FamilleSansEau | null };

export function calculerEauDuMois(entrees: EntreeFabrication[], pourcentage: number = POURCENTAGE_EAU): EauDuMois {
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
    pourcentage,
    litres: (kgAvecEau * pourcentage) / 100,
    nombreEntrees: entrees.filter((e) => Number.isFinite(e.quantite) && e.quantite > 0).length,
  };
}

// Cartons du mois (quantites commandees PD des preparations du Rapport Test labo), toutes
// familles confondues, avec la part des produits sans eau (savon, huile, serum,
// talc) : ils sont comptes aussi.
export type CartonsDuMois = {
  total: number;
  sansEau: number;
  parFamille: Record<FamilleSansEau, number>;
  nombreEntrees: number;
};

export function calculerCartonsDuMois(entrees: EntreeFabrication[]): CartonsDuMois {
  const parFamille: Record<FamilleSansEau, number> = { savon: 0, huile: 0, serum: 0, talc: 0 };
  let total = 0;
  let sansEau = 0;
  let nombreEntrees = 0;

  for (const entree of entrees) {
    if (!Number.isFinite(entree.quantite) || entree.quantite <= 0) continue;
    nombreEntrees += 1;
    total += entree.quantite;
    if (entree.famille) {
      parFamille[entree.famille] += entree.quantite;
      sansEau += entree.quantite;
    }
  }

  return { total, sansEau, parFamille, nombreEntrees };
}

// Cout de l'electricite du mois = kWh de chaque ligne x prix du kWh de cette ligne
// (null tant qu'aucune ligne n'a a la fois ses kWh et son prix).
export function coutElectriciteDuMois(
  electricite: ElectriciteDuMois,
  prixKwhLigne1: number | null,
  prixKwhLigne2: number | null
): number | null {
  const couts = [
    electricite.ligne1 && prixKwhLigne1 !== null ? electricite.ligne1.kwh * prixKwhLigne1 : null,
    electricite.ligne2 && prixKwhLigne2 !== null ? electricite.ligne2.kwh * prixKwhLigne2 : null,
  ];
  return couts.some((c) => c !== null) ? couts.reduce<number>((somme, c) => somme + (c ?? 0), 0) : null;
}

// Cout d'UN litre d'eau = (cout des consommables + cout de l'electricite) / litres
// du mois (null si aucun litre).
export function coutDuLitre(coutConsommables: number, coutElectricite: number | null, litres: number): number | null {
  if (!(litres > 0)) return null;
  return (coutConsommables + (coutElectricite ?? 0)) / litres;
}
