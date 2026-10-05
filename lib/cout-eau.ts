// Prix du traitement de l'eau (filtres, produits, UV, membrane, sel,
// electricite). Pour l'instant on SAISIT seulement les prix (un prix par
// element : le prix d'UNE unite - 1 filtre, 1 lampe UV, 1 membrane, 1 sac de
// sel...). Le calcul du prix de revient d'1 litre sera ajoute quand la formule
// sera definie.

export type LigneCoutEau = {
  cle: string;
  libelle: string;
  // Prix d'UNE unite, en FCFA (null = pas encore saisi)
  prix: number | null;
  // Texte libre pour preciser l'unite (ex: "bidon de 25 L", "sac de 25 kg")
  precision: string;
  // Ligne ajoutee par l'utilisateur (peut etre supprimee)
  perso?: boolean;
};

export type ElectriciteCoutEau = {
  // Consommation de l'installation, en kW
  puissanceKw: number | null;
  // Prix du kWh, en FCFA
  prixKwh: number | null;
};

export type ConfigCoutEau = {
  lignes: LigneCoutEau[];
  electricite: ElectriciteCoutEau;
};

export const LIGNES_PAR_DEFAUT: { cle: string; libelle: string }[] = [
  { cle: "filtre_10", libelle: "Filtre 10 micron" },
  { cle: "filtre_5", libelle: "Filtre 5 micron" },
  { cle: "filtre_1", libelle: "Filtre 1 micron" },
  { cle: "test_th", libelle: "Produit test TH (durete)" },
  { cle: "test_chlore", libelle: "Produit test chlore" },
  { cle: "chlore", libelle: "Produit chlore" },
  { cle: "bisulfite", libelle: "Produit bisulfite" },
  { cle: "uv", libelle: "UV (lampe)" },
  { cle: "membrane", libelle: "Membrane" },
  { cle: "sel", libelle: "Sel" },
];

export const MAX_LIGNES = 40;

function nombreValide(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".").trim()) : Number(value);
  return value !== null && value !== "" && value !== undefined && Number.isFinite(n) && n >= 0 ? n : null;
}

function texteNettoye(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

// Remet une config lue en base (ou envoyee par le navigateur) dans un etat
// sain : lignes par defaut toujours presentes et dans l'ordre, valeurs
// numeriques valides ou vides, textes nettoyes.
export function normaliserConfig(brute: unknown): ConfigCoutEau {
  const source = (brute && typeof brute === "object" ? brute : {}) as Partial<ConfigCoutEau>;
  const lignesSource = Array.isArray(source.lignes) ? source.lignes : [];
  const parCle = new Map<string, Partial<LigneCoutEau>>();
  for (const ligne of lignesSource) {
    if (ligne && typeof ligne === "object" && typeof (ligne as LigneCoutEau).cle === "string") {
      parCle.set((ligne as LigneCoutEau).cle, ligne as Partial<LigneCoutEau>);
    }
  }

  const lignes: LigneCoutEau[] = LIGNES_PAR_DEFAUT.map((defaut) => {
    const stockee = parCle.get(defaut.cle);
    return {
      cle: defaut.cle,
      libelle: defaut.libelle,
      prix: nombreValide(stockee?.prix),
      precision: texteNettoye(stockee?.precision, 60),
    };
  });

  const clesDefaut = new Set(LIGNES_PAR_DEFAUT.map((l) => l.cle));
  for (const ligne of lignesSource) {
    const l = ligne as Partial<LigneCoutEau> | null;
    if (!l || typeof l.cle !== "string" || clesDefaut.has(l.cle) || lignes.length >= MAX_LIGNES) continue;
    lignes.push({
      cle: l.cle.slice(0, 40),
      libelle: texteNettoye(l.libelle, 80),
      prix: nombreValide(l.prix),
      precision: texteNettoye(l.precision, 60),
      perso: true,
    });
  }

  const el = (source.electricite ?? {}) as Partial<ElectriciteCoutEau>;
  return {
    lignes,
    electricite: {
      puissanceKw: nombreValide(el.puissanceKw),
      prixKwh: nombreValide(el.prixKwh),
    },
  };
}
