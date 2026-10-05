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

// Electricite d'UNE ligne (Ligne 1 ou Ligne 2), saisie separement pour chaque
// ligne.
export type ElectriciteLigneCoutEau = {
  // Consommation electrique de la ligne quand la machine tourne, en kW
  puissanceKw: number | null;
  // Prix du kWh, en FCFA
  prixKwh: number | null;
};

export type ElectriciteCoutEau = {
  ligne1: ElectriciteLigneCoutEau;
  ligne2: ElectriciteLigneCoutEau;
};

export type ConfigCoutEau = {
  lignes: LigneCoutEau[];
  electricite: ElectriciteCoutEau;
  // Pourcentage d'eau : litres d'eau = kg fabriques AVEC eau x ce pourcentage.
  // null = pas saisi (60 % par defaut, ou celui du mois precedent).
  pourcentageEau: number | null;
};

export const LIGNES_PAR_DEFAUT: { cle: string; libelle: string }[] = [
  { cle: "filtre_10", libelle: "Filtre 10 micron" },
  { cle: "filtre_5", libelle: "Filtre 5 micron" },
  { cle: "filtre_1", libelle: "Filtre 1 micron" },
  { cle: "test_th", libelle: "Produit test TH (durete)" },
  { cle: "test_chlore_a", libelle: "Produit test chlore A" },
  { cle: "test_chlore_b", libelle: "Produit test chlore B" },
  { cle: "test_chlore_c", libelle: "Produit test chlore C" },
  { cle: "chlore", libelle: "Produit chlore" },
  { cle: "bisulfite", libelle: "Produit bisulfite" },
  { cle: "uv", libelle: "UV (lampe)" },
  { cle: "membrane", libelle: "Membrane" },
  { cle: "sel", libelle: "Sel" },
];

export const MAX_LIGNES = 40;

// Lignes supprimees de la liste : un prix deja enregistre sous cette cle n'est plus
// affiche. "Produit test chlore" (une seule ligne) est remplace par Produit test chlore A / B / C.
const CLES_RETIREES = new Set(["test_chlore"]);

// Anciennes cles reprises sous leur nouvelle cle : les 3 lignes saisies d'abord sous le
// nom "Produit TH A / B / C" sont en fait Produit test chlore A / B / C (prix conserves).
const CLES_RENOMMEES: Record<string, string> = {
  th_a: "test_chlore_a",
  th_b: "test_chlore_b",
  th_c: "test_chlore_c",
  chlore_a: "test_chlore_a",
  chlore_b: "test_chlore_b",
  chlore_c: "test_chlore_c",
};
function cleActuelle(cle: string): string {
  return CLES_RENOMMEES[cle] ?? cle;
}

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
      parCle.set(cleActuelle((ligne as LigneCoutEau).cle), ligne as Partial<LigneCoutEau>);
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
    if (!l || typeof l.cle !== "string") continue;
    const cle = cleActuelle(l.cle);
    if (clesDefaut.has(cle) || CLES_RETIREES.has(cle) || lignes.length >= MAX_LIGNES) continue;
    lignes.push({
      cle: l.cle.slice(0, 40),
      libelle: texteNettoye(l.libelle, 80),
      prix: nombreValide(l.prix),
      precision: texteNettoye(l.precision, 60),
      perso: true,
    });
  }

  // Ancien format (une seule electricite pour toute l'installation, sans ligne1 /
  // ligne2) : les memes valeurs sont reprises pour les deux lignes.
  const el = (source.electricite && typeof source.electricite === "object" ? source.electricite : {}) as Record<
    string,
    unknown
  >;
  const ancienFormat = "ligne1" in el || "ligne2" in el ? null : el;
  return {
    lignes,
    electricite: {
      ligne1: electriciteLigne(el.ligne1 ?? ancienFormat),
      ligne2: electriciteLigne(el.ligne2 ?? ancienFormat),
    },
    pourcentageEau: pourcentageValide(source.pourcentageEau),
  };
}

// Entre 0 et 100 % (0 exclu : 0 % ne donnerait jamais d'eau), sinon vide.
function pourcentageValide(value: unknown): number | null {
  const n = nombreValide(value);
  return n !== null && n > 0 && n <= 100 ? n : null;
}

function electriciteLigne(brute: unknown): ElectriciteLigneCoutEau {
  const l = (brute && typeof brute === "object" ? brute : {}) as Partial<ElectriciteLigneCoutEau>;
  return {
    puissanceKw: nombreValide(l.puissanceKw),
    prixKwh: nombreValide(l.prixKwh),
  };
}

export const MOIS_NOMS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

export function libelleMois(annee: number, mois: number): string {
  return `${MOIS_NOMS[mois - 1] ?? mois} ${annee}`;
}

export function moisValide(annee: number, mois: number): boolean {
  return Number.isInteger(annee) && annee >= 2020 && annee <= 2100 && Number.isInteger(mois) && mois >= 1 && mois <= 12;
}

// Nombre de valeurs reellement saisies (prix des lignes + electricite des deux
// lignes).
export function nombreDePrix(config: ConfigCoutEau): number {
  const nombreElec = (l: ElectriciteLigneCoutEau) =>
    (l.puissanceKw !== null ? 1 : 0) + (l.prixKwh !== null ? 1 : 0);
  return (
    config.lignes.filter((ligne) => ligne.prix !== null).length +
    nombreElec(config.electricite.ligne1) +
    nombreElec(config.electricite.ligne2)
  );
}
