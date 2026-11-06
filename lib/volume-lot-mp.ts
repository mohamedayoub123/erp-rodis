import { nombreColis, volumeColisLitres, volumeQuantiteM3 } from "@/lib/volume-colis";

// Module "Volume par lot MP" (Stock > Matiere premiere) : on choisit un article et un de ses lots, on tape longueur / largeur /
// hauteur d'UN colis (cm) et le volume sort tout seul. Fichier PUR (aucun import serveur), utilise par l'action qui lit les lots
// et par le formulaire (navigateur). Rien n'est enregistre : le volume est toujours recalcule.
//
// Un lot de la table lots_stock_matiere_premiere est un JOURNAL : chaque ligne est une entree OU une sortie de ce lot dans un depot.
// Le stock d'un lot dans un depot = somme (qte_entree - qte_sortie) de ses lignes.

export type LigneLotMp = {
  numero_lot: string | null;
  depot_id: number | null;
  qte_entree: number | null;
  qte_sortie: number | null;
  date_expiration?: string | null;
  contenance?: number | null;
  conditionnement?: string | null;
};

export type LotVolume = {
  cle: string; // "numero_lot|depot" : identifie le lot dans la liste deroulante
  numeroLot: string;
  depotId: number | null;
  stock: number;
  // contenance REELLE de ce lot (un meme article arrive en sacs de 25 kg dans un lot et de 20 kg dans un autre) ; null si inconnue
  contenance: number | null;
  conditionnement: string | null;
  datePeremption: string | null;
};

// En dessous de ce stock (1 g / 0,001 piece), un lot est considere vide : evite les lots "fantomes" nes des arrondis des mouvements.
const STOCK_MINIMUM = 0.001;

function arrondir4(valeur: number) {
  return Math.round(valeur * 10000) / 10000;
}

// Lots d'un article ENCORE EN STOCK, par lot et par depot (un lot present dans 2 depots donne 2 lignes : les colis ne sont pas
// au meme endroit). Contenance / type / peremption : ceux de la derniere ENTREE qui les renseigne.
export function regrouperLotsArticle(lignes: LigneLotMp[]): LotVolume[] {
  const parCle = new Map<string, LotVolume>();

  for (const ligne of lignes) {
    const numeroLot = String(ligne.numero_lot ?? "").trim() || "(sans lot)";
    const depotId = ligne.depot_id ?? null;
    const cle = `${numeroLot}|${depotId ?? ""}`;
    const entree = Number(ligne.qte_entree ?? 0);
    const sortie = Number(ligne.qte_sortie ?? 0);

    let lot = parCle.get(cle);
    if (!lot) {
      lot = { cle, numeroLot, depotId, stock: 0, contenance: null, conditionnement: null, datePeremption: null };
      parCle.set(cle, lot);
    }
    lot.stock += entree - sortie;

    if (entree > 0) {
      const contenance = Number(ligne.contenance ?? 0);
      if (Number.isFinite(contenance) && contenance > 0) lot.contenance = contenance;
      if (ligne.conditionnement) lot.conditionnement = ligne.conditionnement;
      if (ligne.date_expiration) lot.datePeremption = ligne.date_expiration;
    }
  }

  return [...parCle.values()]
    .map((lot) => ({ ...lot, stock: arrondir4(lot.stock) }))
    .filter((lot) => lot.stock > STOCK_MINIMUM)
    .sort(
      (a, b) =>
        a.numeroLot.localeCompare(b.numeroLot, "fr", { numeric: true, sensitivity: "base" }) ||
        (a.depotId ?? 0) - (b.depotId ?? 0)
    );
}

export type VolumeLot = {
  litresColis: number | null;
  m3Colis: number | null;
  colis: number | null; // nombre de colis du lot (peut etre decimal : 1 000 pieces en cartons de 300 = 3,33)
  m3Lot: number | null;
};

// Volume d'un colis (3 dimensions en cm) et volume du lot (stock du lot / contenance = nombre de colis, x volume d'un colis).
// Chaque valeur est null tant qu'il manque de quoi la calculer : jamais un volume devine.
export function calculerVolumeLot(entree: {
  longueur: number | null;
  largeur: number | null;
  hauteur: number | null;
  stock: number | null;
  contenance: number | null;
}): VolumeLot {
  const litresColis = volumeColisLitres(entree.longueur, entree.largeur, entree.hauteur);
  return {
    litresColis,
    m3Colis: litresColis === null ? null : litresColis / 1000,
    colis: nombreColis(entree.stock, entree.contenance),
    m3Lot: volumeQuantiteM3(entree.stock, entree.contenance, litresColis),
  };
}

// Nombre tape dans un champ ("40", "25,5") : null si vide ou invalide
export function lireNombreSaisi(texte: string): number | null {
  const propre = texte.trim().replace(",", ".");
  if (!propre) return null;
  const nombre = Number(propre);
  return Number.isFinite(nombre) ? nombre : null;
}
