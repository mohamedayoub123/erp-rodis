import { formaterM3, volumeColisLitres } from "@/lib/volume-colis";

// Module "Volume par lot MP" (Stock > Matiere premiere) : on choisit un article puis un de ses lots, on tape la longueur, la largeur
// et la hauteur du LOT ENTIER (cm) et le volume en m3 sort tout seul (L x l x h). Les dimensions sont ENREGISTREES par article + lot
// (table lots_mp_dimensions, scripts/sql/add_dimensions_lot_mp.sql) et la colonne "Volume" de la page Stock MP les reprend sur
// chaque ligne du lot. Fichier PUR (aucun import serveur) : sert a l'action qui lit les lots, au formulaire et a la page Stock.
//
// Un lot de la table lots_stock_matiere_premiere est un JOURNAL : chaque ligne est une entree OU une sortie de ce lot dans un depot.
// Le stock d'un lot = somme (qte_entree - qte_sortie) de ses lignes, tous depots confondus.

export type LigneLotMp = {
  numero_lot: string | null;
  depot_id: number | null;
  qte_entree: number | null;
  qte_sortie: number | null;
  date_expiration?: string | null;
};

export type LotVolume = {
  cle: string; // numero de lot normalise (voir codeLot) : identifie le lot, dimensions comprises
  numeroLot: string; // tel qu'ecrit (premiere ecriture rencontree)
  stock: number;
  // detail par depot, soldes negatifs compris (anciennes lignes sans depot) : leur somme est toujours egale au stock du lot
  depots: { depotId: number | null; stock: number }[];
  datePeremption: string | null;
};

// Meme lot ecrit "ab12", "AB12" ou " AB12 " = un seul lot (comme code_normalise du reste de l'ERP) ; "" si pas de numero de lot
export function codeLot(numeroLot: string | null | undefined): string {
  return String(numeroLot ?? "").trim().toUpperCase();
}

// Cle d'une ligne de la page Stock pour retrouver les dimensions de son lot ; null si la ligne n'a pas d'article ou de lot
export function cleDimensionsLot(articleId: number | null | undefined, numeroLot: string | null | undefined): string | null {
  const code = codeLot(numeroLot);
  if (!articleId || !code) return null;
  return `${articleId}|${code}`;
}

// En dessous de ce stock (1 g / 0,001 piece), un lot est considere vide : evite les lots "fantomes" nes des arrondis des mouvements.
const STOCK_MINIMUM = 0.001;

function arrondir4(valeur: number) {
  return Math.round(valeur * 10000) / 10000;
}

// Lots d'un article ENCORE EN STOCK (un par numero de lot, tous depots confondus, avec le detail par depot). Les lignes sans numero
// de lot sont ignorees : on ne peut pas enregistrer de dimensions sur "aucun lot".
export function regrouperLotsArticle(lignes: LigneLotMp[]): LotVolume[] {
  const parCle = new Map<string, LotVolume & { parDepot: Map<number | null, number> }>();

  for (const ligne of lignes) {
    const cle = codeLot(ligne.numero_lot);
    if (!cle) continue;
    const depotId = ligne.depot_id ?? null;
    const mouvement = Number(ligne.qte_entree ?? 0) - Number(ligne.qte_sortie ?? 0);

    let lot = parCle.get(cle);
    if (!lot) {
      lot = { cle, numeroLot: String(ligne.numero_lot).trim(), stock: 0, depots: [], datePeremption: null, parDepot: new Map() };
      parCle.set(cle, lot);
    }
    lot.stock += mouvement;
    lot.parDepot.set(depotId, (lot.parDepot.get(depotId) ?? 0) + mouvement);
    if (Number(ligne.qte_entree ?? 0) > 0 && ligne.date_expiration) lot.datePeremption = ligne.date_expiration;
  }

  return [...parCle.values()]
    .map(({ parDepot, ...lot }) => ({
      ...lot,
      stock: arrondir4(lot.stock),
      depots: [...parDepot.entries()]
        .map(([depotId, stock]) => ({ depotId, stock: arrondir4(stock) }))
        .filter((depot) => Math.abs(depot.stock) > STOCK_MINIMUM)
        .sort((a, b) => (a.depotId ?? 0) - (b.depotId ?? 0)),
    }))
    .filter((lot) => lot.stock > STOCK_MINIMUM)
    .sort((a, b) => a.numeroLot.localeCompare(b.numeroLot, "fr", { numeric: true, sensitivity: "base" }));
}

export type VolumeLot = { litres: number; m3: number };

// Volume du lot a partir de ses 3 dimensions en cm ; null tant qu'une dimension manque ou n'est pas superieure a 0 (jamais devine)
export function calculerVolumeLot(
  longueur: number | null | undefined,
  largeur: number | null | undefined,
  hauteur: number | null | undefined
): VolumeLot | null {
  const litres = volumeColisLitres(longueur, largeur, hauteur);
  return litres === null ? null : { litres, m3: litres / 1000 };
}

// "1,800 m³" ; 4 decimales sous 0,01 m3 pour qu'un petit lot ne s'affiche pas "0,000 m³" ; "-" si inconnu
export function formaterVolumeLot(m3: number | null | undefined): string {
  if (typeof m3 !== "number" || !Number.isFinite(m3)) return "-";
  return formaterM3(m3, m3 < 0.01 ? 4 : 3);
}

// Nombre tape dans un champ ("40", "25,5") : null si vide ou invalide
export function lireNombreSaisi(texte: string): number | null {
  const propre = texte.trim().replace(",", ".");
  if (!propre) return null;
  const nombre = Number(propre);
  return Number.isFinite(nombre) ? nombre : null;
}
