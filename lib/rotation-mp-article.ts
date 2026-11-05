// Rotation d'UN article matiere premiere, affichee sur les ecrans Entree / Sortie MP :
// - par MOIS : sorties des 6 derniers mois complets + du mois en cours, moyenne sur 3 et 6 mois, et combien de
//   mois le stock actuel peut tenir a ce rythme ;
// - par AN : meme definition que le rapport "Rotation de Stock MP" (stock/matiere-premiere/rotation) :
//   rotation = sorties des 12 derniers mois / stock MOYEN (moyenne entre le stock d'il y a 12 mois et le stock
//   actuel), avec le meme niveau Forte / Moyenne / Faible / Dormant.
// Aucun import serveur : fonction pure, testable.

export type LigneMouvementMp = {
  qte_entree: number | null;
  qte_sortie: number | null;
  date_jour: string | null;
};

export type NiveauRotationMp = "FORTE" | "MOYENNE" | "FAIBLE" | "DORMANT";

export type MoisSorties = {
  cle: string; // "AAAA-MM"
  libelle: string; // "Oct 26"
  sorties: number;
  enCours: boolean; // mois en cours (incomplet)
};

export type RotationArticleMp = {
  stockActuel: number;
  mois: MoisSorties[]; // du plus ancien au mois en cours
  moyenne3Mois: number;
  moyenne6Mois: number;
  // stock actuel / moyenne des 3 derniers mois complets ; null s'il n'y a eu aucune sortie sur ces 3 mois
  couvertureMois: number | null;
  sorties12Mois: number;
  stockMoyen: number;
  rotation: number | null;
  niveau: NiveauRotationMp | null;
  joursCouverture: number | null;
};

const NOMS_MOIS = ["Janv", "Fev", "Mars", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"];

function arrondir2(valeur: number) {
  return Math.round(valeur * 100) / 100;
}

function cleMois(annee: number, moisIndex: number) {
  const date = new Date(Date.UTC(annee, moisIndex, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// "AAAA-MM-JJ" d'il y a N mois - meme principe que isoMoisAvant (lib/mp-agregats.ts) du rapport de rotation.
export function dateIlYaNMois(aujourdhuiIso: string, mois: number): string {
  const date = new Date(`${aujourdhuiIso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - mois);
  return date.toISOString().slice(0, 10);
}

// Classification par la rotation PAR AN - les memes seuils pour le rapport "Rotation de Stock MP" et pour cette carte :
// Forte = 2 fois ou plus ; Moyenne = de 1 a moins de 2 ; Faible = de 0,5 a moins de 1 ; Dormant = moins de 0,5 (0 compris).
// Pas de classification si la rotation n'a pas de sens (stock moyen nul).
export const SEUIL_ROTATION_FORTE = 2;
export const SEUIL_ROTATION_MOYENNE = 1;
export const SEUIL_ROTATION_FAIBLE = 0.5;

export function niveauRotationMp(rotation: number | null): NiveauRotationMp | null {
  if (rotation === null) return null;
  if (rotation >= SEUIL_ROTATION_FORTE) return "FORTE";
  if (rotation >= SEUIL_ROTATION_MOYENNE) return "MOYENNE";
  if (rotation >= SEUIL_ROTATION_FAIBLE) return "FAIBLE";
  return "DORMANT";
}

export function calculerRotationArticleMp(lignes: LigneMouvementMp[], aujourdhuiIso: string): RotationArticleMp {
  const debut12Mois = dateIlYaNMois(aujourdhuiIso, 12);
  const annee = Number(aujourdhuiIso.slice(0, 4));
  const moisIndex = Number(aujourdhuiIso.slice(5, 7)) - 1;

  // 6 mois complets + le mois en cours
  const mois: MoisSorties[] = [];
  for (let decalage = 6; decalage >= 0; decalage--) {
    const cle = cleMois(annee, moisIndex - decalage);
    const [anneeMois, numeroMois] = cle.split("-").map(Number);
    mois.push({
      cle,
      libelle: `${NOMS_MOIS[numeroMois - 1]} ${String(anneeMois).slice(2)}`,
      sorties: 0,
      enCours: decalage === 0,
    });
  }
  const moisParCle = new Map(mois.map((m) => [m.cle, m]));

  let stockActuel = 0;
  let stockAvant12Mois = 0;
  let sorties12Mois = 0;

  for (const ligne of lignes) {
    const entree = Number(ligne.qte_entree ?? 0);
    const sortie = Number(ligne.qte_sortie ?? 0);
    stockActuel += entree - sortie;

    if (!ligne.date_jour || ligne.date_jour < debut12Mois) stockAvant12Mois += entree - sortie;
    if (ligne.date_jour && ligne.date_jour >= debut12Mois) sorties12Mois += sortie;

    if (ligne.date_jour) {
      const moisTrouve = moisParCle.get(ligne.date_jour.slice(0, 7));
      if (moisTrouve) moisTrouve.sorties += sortie;
    }
  }

  for (const m of mois) m.sorties = arrondir2(m.sorties);

  const completsRecents = mois.filter((m) => !m.enCours).reverse(); // du plus recent au plus ancien
  const moyenne = (n: number) => arrondir2(completsRecents.slice(0, n).reduce((total, m) => total + m.sorties, 0) / n);
  const moyenne3Mois = moyenne(3);
  const moyenne6Mois = moyenne(6);

  const stockMoyen = (stockAvant12Mois + stockActuel) / 2;
  const rotation = stockMoyen > 0 ? sorties12Mois / stockMoyen : null;

  return {
    stockActuel: arrondir2(stockActuel),
    mois,
    moyenne3Mois,
    moyenne6Mois,
    couvertureMois: moyenne3Mois > 0 ? arrondir2(stockActuel / moyenne3Mois) : null,
    sorties12Mois: arrondir2(sorties12Mois),
    stockMoyen: arrondir2(stockMoyen),
    rotation: rotation === null ? null : arrondir2(rotation),
    niveau: niveauRotationMp(rotation),
    joursCouverture: sorties12Mois > 0 ? Math.round((stockActuel * 365) / sorties12Mois) : null,
  };
}
