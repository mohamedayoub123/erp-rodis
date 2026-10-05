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

// articleMp : l'element se calcule TOUT SEUL a partir des sorties de cet article dans les
// mouvements MP du mois (pas de saisie a la main) - meme chiffre que le Rapport
// mouvements MP.
export const ELEMENTS_CONSO: { cle: string; libelle: string; unite: string; articleMp?: string }[] = [
  { cle: "filtre_10", libelle: "Filtre 10 micron", unite: "pieces" },
  { cle: "filtre_5", libelle: "Filtre 5 micron", unite: "pieces" },
  { cle: "filtre_1", libelle: "Filtre 1 micron", unite: "pieces" },
  { cle: "test_th", libelle: "Produit test TH (durete)", unite: "pieces" },
  { cle: "test_chlore_a", libelle: "Produit test chlore A", unite: "pieces" },
  { cle: "test_chlore_b", libelle: "Produit test chlore B", unite: "pieces" },
  { cle: "test_chlore_c", libelle: "Produit test chlore C", unite: "pieces" },
  // Le chlore se compte en LITRES (prix par L) : la quantite des mouvements MP (article en kg,
  // des bidons de 50) est reprise telle quelle, sans conversion.
  { cle: "chlore", libelle: "Produit chlore", unite: "L", articleMp: "CHLORE AU 15%" },
  // Produit realement utilise : SODIUM SULPHITE (et non le metabisulfite / bisulfite). La cle
  // "bisulfite" est gardee pour conserver le prix deja saisi.
  { cle: "bisulfite", libelle: "SODIUM SULPHITE ANHYDROUS", unite: "kg", articleMp: "SODIUM SULPHITE ANHYDROUS" },
  { cle: "uv", libelle: "UV (lampe)", unite: "pieces" },
  { cle: "membrane", libelle: "Membrane", unite: "pieces" },
  { cle: "sel", libelle: "Sel", unite: "kg", articleMp: "TABLETTE SEL HYPERPUR POUR ADOUCISSEUR" },
];

// Elements saisis a la main (ceux de la grille "Nouvelle saisie") et elements automatiques.
export const ELEMENTS_SAISISSABLES = ELEMENTS_CONSO.filter((e) => !e.articleMp);
export const ELEMENTS_AUTO_MP = ELEMENTS_CONSO.filter(
  (e): e is (typeof ELEMENTS_CONSO)[number] & { articleMp: string } => !!e.articleMp
);

// La quantite qui sort des mouvements MP est divisee a parts egales entre la Ligne 1 et la Ligne 2.
export const PART_AUTO_PAR_LIGNE = 0.5;

// Consommation automatique d'un element : sorties de son article dans les mouvements MP du mois.
export type ConsoAutoMp = {
  cle: string;
  libelle: string;
  unite: string;
  quantite: number;
  // Nombre de mouvements de sortie comptes
  nombre: number;
  articleMp: string;
  // Utilisateurs qui ont fait ces mouvements MP (noms distincts)
  par: string[];
};

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
  // Element calcule automatiquement (mouvements MP) : quantite divisee sur les 2 lignes
  auto?: boolean;
  // Utilisateurs qui ont saisi cet element dans le mois (noms distincts)
  par?: string[];
};

// Total du mois par element (somme des saisies datees + elements automatiques des
// mouvements MP), dans l'ordre des elements habituels puis les elements ajoutes par
// ordre alphabetique. Une saisie a la main d'un element automatique n'est PAS comptee.
export function totauxDuMois(saisies: SaisieConsoEau[], autos: ConsoAutoMp[] = []): TotalElement[] {
  const parCle = new Map<string, TotalElement>();
  const clesAuto = new Set(autos.map((a) => a.cle));
  const nomsAuto = new Set(autos.map((a) => nomNormalise(a.libelle)));

  for (const a of autos) {
    parCle.set(a.cle, {
      cle: a.cle,
      libelle: a.libelle,
      unite: a.unite,
      ligne1: a.quantite * PART_AUTO_PAR_LIGNE,
      ligne2: a.quantite * PART_AUTO_PAR_LIGNE,
      total: a.quantite,
      nombre: a.nombre,
      auto: true,
      par: a.par,
    });
  }

  for (const s of saisies) {
    if (clesAuto.has(s.cle) || nomsAuto.has(nomNormalise(s.libelle))) continue;
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
    if (s.par && !(existant.par ?? []).includes(s.par)) existant.par = [...(existant.par ?? []), s.par];
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

// Unite proposee dans une nouvelle saisie : la precision du prix, sauf "U" / "unite" /
// "piece" qui veulent dire des pieces.
export function uniteProposee(precision: string | undefined, uniteParDefaut: string): string {
  const p = nomNormalise(precision ?? "");
  if (!p) return uniteParDefaut;
  if (p === "u" || p === "unite" || p === "unites" || p === "piece" || p === "pieces") return "pieces";
  return (precision ?? "").trim().slice(0, 20);
}

// Vrai si l'unite de la quantite correspond a la precision du prix (kg/KG, U/pieces...) ;
// vide d'un cote ou de l'autre = pas de comparaison possible.
export function unitesCompatibles(unite: string, precision: string): boolean {
  const u = uniteProposee(unite, "").toLowerCase();
  const p = uniteProposee(precision, "").toLowerCase();
  return !u || !p || u === p;
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
