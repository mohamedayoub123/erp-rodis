// Consommation d'eau (traitement) saisie AVEC UNE DATE, par ligne de production
// (Ligne 1 et Ligne 2) : chaque saisie dit "ce jour-la, tel element a ete
// consomme en telle quantite" (filtres changes, produits utilises, sel,
// electricite en kWh...). Plusieurs saisies possibles dans le meme mois ; la page
// affiche les saisies du mois choisi et leur total.
//
// L'eau produite et l'electricite du mois ne sont PAS saisies : elles sont
// calculees automatiquement a partir du vrac fabrique (voir
// lib/cout-eau-fabrication.ts). Le calcul du prix
// du litre viendra ensuite (prix du module "Eau - Prix" x consommation du mois).

export type SaisieConsoEau = {
  id: number;
  // AAAA-MM-JJ
  date: string;
  cle: string;
  libelle: string;
  // Quantite consommee ce jour-la sur la Ligne 1 / la Ligne 2 (null = rien)
  ligne1: number | null;
  ligne2: number | null;
  // Unite libre (pieces, kg, L, kWh...)
  unite: string;
  par: string | null;
};

export const ELEMENTS_CONSO: { cle: string; libelle: string; unite: string }[] = [
  { cle: "filtre_10", libelle: "Filtre 10 micron", unite: "pieces" },
  { cle: "filtre_5", libelle: "Filtre 5 micron", unite: "pieces" },
  { cle: "filtre_1", libelle: "Filtre 1 micron", unite: "pieces" },
  { cle: "th_a", libelle: "Produit test TH (durete) A", unite: "U" },
  { cle: "th_b", libelle: "Produit test TH (durete) B", unite: "U" },
  { cle: "th_c", libelle: "Produit test TH (durete) C", unite: "U" },
  { cle: "test_chlore", libelle: "Produit test chlore", unite: "tests" },
  { cle: "chlore", libelle: "Produit chlore", unite: "L" },
  { cle: "bisulfite", libelle: "Produit bisulfite", unite: "L" },
  { cle: "uv", libelle: "UV (lampe)", unite: "pieces" },
  { cle: "membrane", libelle: "Membrane", unite: "pieces" },
  { cle: "sel", libelle: "Sel", unite: "kg" },
];

// Elements ajoutes par l'utilisateur dans une saisie, en plus des habituels.
export const MAX_ELEMENTS_PAR_SAISIE = 40;

export function nombreValide(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".").trim()) : Number(value);
  return value !== null && value !== "" && value !== undefined && Number.isFinite(n) && n >= 0 ? n : null;
}

export function texteNettoye(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

// "AAAA-MM-JJ" reel (le 31 fevrier est refuse), entre 2000 et 2100. Renvoie la
// date ou null.
export function dateValide(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const annee = Number(value.slice(0, 4));
  const mois = Number(value.slice(5, 7));
  const jour = Number(value.slice(8, 10));
  if (annee < 2000 || annee > 2100) return null;
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour ? value : null;
}

export function moisDeDate(date: string): { annee: number; mois: number } {
  return { annee: Number(date.slice(0, 4)), mois: Number(date.slice(5, 7)) };
}

export function premierDuMois(annee: number, mois: number): string {
  return `${annee}-${String(mois).padStart(2, "0")}-01`;
}

// Premier jour du mois suivant (borne haute exclue pour lire un mois entier).
export function debutMoisSuivant(annee: number, mois: number): string {
  return mois === 12 ? premierDuMois(annee + 1, 1) : premierDuMois(annee, mois + 1);
}

// 2026-09-05 -> 05-09-2026
export function dateFr(date: string): string {
  return `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`;
}

// Cle d'un element ajoute par l'utilisateur : la meme ecriture donne la meme cle,
// ce qui regroupe ses saisies dans le total du mois.
export function cleElementPerso(libelle: string): string {
  const slug = libelle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 33);
  return `perso_${slug || "element"}`;
}

export function totalLigne1Ligne2(ligne: { ligne1: number | null; ligne2: number | null }): number | null {
  if (ligne.ligne1 === null && ligne.ligne2 === null) return null;
  return (ligne.ligne1 ?? 0) + (ligne.ligne2 ?? 0);
}

export type TotalElement = {
  cle: string;
  libelle: string;
  unite: string;
  ligne1: number;
  ligne2: number;
  total: number;
  nombre: number;
};

// Total du mois par element (somme des saisies datees), dans l'ordre des
// elements habituels puis les elements ajoutes par ordre alphabetique.
export function totauxDuMois(saisies: SaisieConsoEau[]): TotalElement[] {
  const parCle = new Map<string, TotalElement>();
  for (const s of saisies) {
    const existant = parCle.get(s.cle) ?? {
      cle: s.cle,
      libelle: s.libelle,
      unite: s.unite,
      ligne1: 0,
      ligne2: 0,
      total: 0,
      nombre: 0,
    };
    existant.ligne1 += s.ligne1 ?? 0;
    existant.ligne2 += s.ligne2 ?? 0;
    existant.total = existant.ligne1 + existant.ligne2;
    existant.nombre += 1;
    parCle.set(s.cle, existant);
  }

  const ordreDefaut = new Map(ELEMENTS_CONSO.map((e, index) => [e.cle, index]));
  return [...parCle.values()].sort((a, b) => {
    const ia = ordreDefaut.get(a.cle);
    const ib = ordreDefaut.get(b.cle);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.libelle.localeCompare(b.libelle, "fr");
  });
}

export function formaterQuantite(value: number | null): string {
  return value === null ? "-" : value.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

// ---------------------------------------------------------------------------
// Prix de chaque element (saisis dans "Prix des consommables") et cout.
// ---------------------------------------------------------------------------

// Une ligne de prix : prix d'UNE unite (FCFA) et la precision de cette unite
// (U, L, KG, "bidon de 25 L"...).
export type LignePrixElement = { cle: string; libelle: string; prix: number | null; precision: string };

function nomNormalise(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Prix d'un element de consommation : meme cle (elements habituels), sinon meme
// nom (elements ajoutes a la main des deux cotes, ex. "Produit test TH (durete) A").
export function prixDeElement(
  lignesPrix: LignePrixElement[],
  element: { cle: string; libelle: string }
): { prix: number | null; precision: string } | null {
  const nom = nomNormalise(element.libelle);
  const trouve =
    (element.cle ? lignesPrix.find((l) => l.cle === element.cle) : undefined) ??
    (nom ? lignesPrix.find((l) => nomNormalise(l.libelle) === nom) : undefined);
  return trouve ? { prix: trouve.prix, precision: trouve.precision } : null;
}

export function coutDe(quantite: number | null, prix: number | null): number | null {
  return quantite === null || prix === null ? null : quantite * prix;
}

// Les prix d une unite gardent jusqu a 4 decimales (ex. 211,888 le kg de sel) ; les couts 2.
export function formaterFcfa(value: number | null, decimales = 2): string {
  return value === null ? "-" : value.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

export type TotalElementAvecPrix = TotalElement & {
  prix: number | null;
  precision: string;
  cout: number | null;
};

export function totauxAvecPrix(totaux: TotalElement[], lignesPrix: LignePrixElement[]): TotalElementAvecPrix[] {
  return totaux.map((t) => {
    const p = prixDeElement(lignesPrix, t);
    const prix = p?.prix ?? null;
    return { ...t, prix, precision: p?.precision ?? "", cout: coutDe(t.total, prix) };
  });
}
