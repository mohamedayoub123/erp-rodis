// Consommation d'eau (traitement) saisie PAR MOIS et PAR LIGNE de production
// (Ligne 1 et Ligne 2) : quantite consommee de chaque element dans le mois
// (filtres changes, produits utilises, sel, electricite en kWh...). L'eau
// produite du mois n'est PAS saisie : elle est calculee automatiquement a
// partir du vrac fabrique (voir lib/cout-eau-fabrication.ts). Le calcul du prix
// du litre viendra ensuite (prix du module "Eau - Prix" x consommation du
// mois).

export type LigneConsoEau = {
  cle: string;
  libelle: string;
  // Quantite consommee dans le mois sur la Ligne 1 / la Ligne 2 de production
  // (null = pas encore saisie)
  ligne1: number | null;
  ligne2: number | null;
  // Unite libre (pieces, kg, L, kWh...)
  unite: string;
  // Ligne du tableau ajoutee par l'utilisateur (peut etre supprimee)
  perso?: boolean;
};

export type ConfigConsoEau = { lignes: LigneConsoEau[] };

export const LIGNES_CONSO_PAR_DEFAUT: { cle: string; libelle: string; unite: string }[] = [
  { cle: "filtre_10", libelle: "Filtre 10 micron", unite: "pieces" },
  { cle: "filtre_5", libelle: "Filtre 5 micron", unite: "pieces" },
  { cle: "filtre_1", libelle: "Filtre 1 micron", unite: "pieces" },
  { cle: "test_th", libelle: "Produit test TH (durete)", unite: "tests" },
  { cle: "test_chlore", libelle: "Produit test chlore", unite: "tests" },
  { cle: "chlore", libelle: "Produit chlore", unite: "L" },
  { cle: "bisulfite", libelle: "Produit bisulfite", unite: "L" },
  { cle: "uv", libelle: "UV (lampe)", unite: "pieces" },
  { cle: "membrane", libelle: "Membrane", unite: "pieces" },
  { cle: "sel", libelle: "Sel", unite: "kg" },
  { cle: "electricite", libelle: "Electricite (consommation du mois)", unite: "kWh" },
];

export const MAX_LIGNES_CONSO = 40;

function nombreValide(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".").trim()) : Number(value);
  return value !== null && value !== "" && value !== undefined && Number.isFinite(n) && n >= 0 ? n : null;
}

function texteNettoye(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

// Remet une config lue en base (ou envoyee par le navigateur) dans un etat
// sain : lignes par defaut toujours presentes et dans l'ordre, quantites
// valides ou vides, textes nettoyes.
export function normaliserConsoEau(brute: unknown): ConfigConsoEau {
  const source = (brute && typeof brute === "object" ? brute : {}) as Partial<ConfigConsoEau>;
  const lignesSource = Array.isArray(source.lignes) ? source.lignes : [];
  const parCle = new Map<string, Partial<LigneConsoEau>>();
  for (const ligne of lignesSource) {
    if (ligne && typeof ligne === "object" && typeof (ligne as LigneConsoEau).cle === "string") {
      parCle.set((ligne as LigneConsoEau).cle, ligne as Partial<LigneConsoEau>);
    }
  }

  const lignes: LigneConsoEau[] = LIGNES_CONSO_PAR_DEFAUT.map((defaut) => {
    const stockee = parCle.get(defaut.cle);
    return {
      cle: defaut.cle,
      libelle: defaut.libelle,
      ligne1: nombreValide(stockee?.ligne1),
      ligne2: nombreValide(stockee?.ligne2),
      unite: stockee && "unite" in stockee ? texteNettoye(stockee.unite, 20) : defaut.unite,
    };
  });

  const clesDefaut = new Set(LIGNES_CONSO_PAR_DEFAUT.map((l) => l.cle));
  // Ancienne ligne manuelle "eau produite" : remplacee par le calcul automatique.
  clesDefaut.add("eau_produite");
  for (const ligne of lignesSource) {
    const l = ligne as Partial<LigneConsoEau> | null;
    if (!l || typeof l.cle !== "string" || clesDefaut.has(l.cle) || lignes.length >= MAX_LIGNES_CONSO) continue;
    lignes.push({
      cle: l.cle.slice(0, 40),
      libelle: texteNettoye(l.libelle, 80),
      ligne1: nombreValide(l.ligne1),
      ligne2: nombreValide(l.ligne2),
      unite: texteNettoye(l.unite, 20),
      perso: true,
    });
  }

  return { lignes };
}

// Nombre d'elements pour lesquels au moins une quantite est saisie.
export function nombreDeQuantites(config: ConfigConsoEau): number {
  return config.lignes.filter((ligne) => ligne.ligne1 !== null || ligne.ligne2 !== null).length;
}

// Total Ligne 1 + Ligne 2 (null si aucune des deux n'est saisie).
export function totalDesLignes(ligne: Pick<LigneConsoEau, "ligne1" | "ligne2">): number | null {
  if (ligne.ligne1 === null && ligne.ligne2 === null) return null;
  return (ligne.ligne1 ?? 0) + (ligne.ligne2 ?? 0);
}
