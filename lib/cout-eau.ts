// Calcul du prix de revient d'1 litre d'eau (traitement : filtres, produits,
// UV, membrane, electricite, sel). Fonctions pures, utilisees par la page
// (affichage en direct) ET par l'enregistrement (journal) - un seul calcul.
//
// Principe : pour chaque consommable on saisit le PRIX d'un achat et le nombre
// de LITRES d'eau produits avec cet achat (sa duree de vie) ; le cout par litre
// est prix / litres. L'electricite se calcule a part : puissance (kW) x prix du
// kWh / litres produits par heure.

export type LigneCoutEau = {
  cle: string;
  libelle: string;
  // Prix d'un achat, en FCFA (null = pas encore saisi)
  prix: number | null;
  // Litres d'eau produits avec cet achat (duree de vie / consommation)
  litres: number | null;
  // Ligne ajoutee par l'utilisateur (peut etre supprimee)
  perso?: boolean;
};

export type ElectriciteCoutEau = {
  puissanceKw: number | null;
  prixKwh: number | null;
  litresParHeure: number | null;
};

export type ConfigCoutEau = {
  lignes: LigneCoutEau[];
  electricite: ElectriciteCoutEau;
};

export const LIGNES_PAR_DEFAUT: LigneCoutEau[] = [
  { cle: "filtre_10", libelle: "Filtre 10 micron", prix: null, litres: null },
  { cle: "filtre_5", libelle: "Filtre 5 micron", prix: null, litres: null },
  { cle: "filtre_1", libelle: "Filtre 1 micron", prix: null, litres: null },
  { cle: "test_th", libelle: "Produit test TH (durete)", prix: null, litres: null },
  { cle: "test_chlore", libelle: "Produit test chlore", prix: null, litres: null },
  { cle: "chlore", libelle: "Produit chlore", prix: null, litres: null },
  { cle: "bisulfite", libelle: "Produit bisulfite", prix: null, litres: null },
  { cle: "uv", libelle: "UV (lampe)", prix: null, litres: null },
  { cle: "membrane", libelle: "Membrane", prix: null, litres: null },
  { cle: "sel", libelle: "Sel", prix: null, litres: null },
];

export const ELECTRICITE_PAR_DEFAUT: ElectriciteCoutEau = {
  puissanceKw: null,
  prixKwh: null,
  litresParHeure: null,
};

export const MAX_LIGNES = 40;

function nombreValide(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".").trim()) : Number(value);
  return value !== null && value !== "" && value !== undefined && Number.isFinite(n) && n >= 0 ? n : null;
}

// Remet une config lue en base (ou envoyee par le navigateur) dans un etat
// sain : lignes par defaut toujours presentes et dans l'ordre, valeurs
// numeriques valides ou vides, libelles nettoyes.
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
      litres: nombreValide(stockee?.litres),
    };
  });

  const clesDefaut = new Set(LIGNES_PAR_DEFAUT.map((l) => l.cle));
  for (const ligne of lignesSource) {
    const l = ligne as Partial<LigneCoutEau> | null;
    if (!l || typeof l.cle !== "string" || clesDefaut.has(l.cle) || lignes.length >= MAX_LIGNES) continue;
    lignes.push({
      cle: l.cle.slice(0, 40),
      libelle: String(l.libelle ?? "").trim().slice(0, 80),
      prix: nombreValide(l.prix),
      litres: nombreValide(l.litres),
      perso: true,
    });
  }

  const el = (source.electricite ?? {}) as Partial<ElectriciteCoutEau>;
  return {
    lignes,
    electricite: {
      puissanceKw: nombreValide(el.puissanceKw),
      prixKwh: nombreValide(el.prixKwh),
      litresParHeure: nombreValide(el.litresParHeure),
    },
  };
}

// Cout par litre d'une ligne, ou null si elle est incomplete (prix ou litres
// manquant, litres a 0).
export function coutParLitreLigne(ligne: Pick<LigneCoutEau, "prix" | "litres">): number | null {
  if (ligne.prix === null || ligne.litres === null || ligne.litres <= 0) return null;
  return ligne.prix / ligne.litres;
}

export function coutParLitreElectricite(electricite: ElectriciteCoutEau): number | null {
  const { puissanceKw, prixKwh, litresParHeure } = electricite;
  if (puissanceKw === null || prixKwh === null || litresParHeure === null || litresParHeure <= 0) return null;
  return (puissanceKw * prixKwh) / litresParHeure;
}

export type ResultatCoutEau = {
  // FCFA par litre, somme des lignes completes + electricite
  totalParLitre: number;
  totalPour1000Litres: number;
  // lignes (ou electricite) commencees mais incompletes : non comptees
  lignesIncompletes: string[];
};

export function calculerCoutEau(config: ConfigCoutEau): ResultatCoutEau {
  let total = 0;
  const incompletes: string[] = [];

  for (const ligne of config.lignes) {
    const cout = coutParLitreLigne(ligne);
    if (cout !== null) {
      total += cout;
    } else if (ligne.prix !== null || ligne.litres !== null) {
      incompletes.push(ligne.libelle || "(ligne sans nom)");
    }
  }

  const el = config.electricite;
  const coutElec = coutParLitreElectricite(el);
  if (coutElec !== null) {
    total += coutElec;
  } else if (el.puissanceKw !== null || el.prixKwh !== null || el.litresParHeure !== null) {
    incompletes.push("Electricite");
  }

  return { totalParLitre: total, totalPour1000Litres: total * 1000, lignesIncompletes: incompletes };
}
