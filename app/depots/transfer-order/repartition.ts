// Repartition de la quantite a transferer d'un Transfer Order sur les lots du depot source. Fichier SANS acces base de
// donnees, partage par l'ecran (apercu en direct quand on change la quantite demandee) et par le serveur (enregistrement) :
// les deux calculent exactement la meme chose.
export type LotRepartition = { numeroLot: string; solde: number };

export type Allocation = { numeroLot: string; quantite: number };

// Pas d'arrondi au millieme : des quantites comme 0,0007 (colorant) doivent rester exactes. Seul le bruit des calculs
// flottants (6e decimale) est supprime.
export const arrondiQuantite = (valeur: number) => Math.round(valeur * 1e6) / 1e6;

// Repartit [aTransferer] : d'abord sur les lots choisis (dans l'ordre), puis, pour le reste, sur les autres lots dans
// l'ordre de la liste (deja trie du plus proche de l'expiration au plus lointain). [manque] > 0 = stock insuffisant.
export function repartirQuantite(
  lots: LotRepartition[],
  lotsChoisis: string[],
  aTransferer: number
): { allocations: Allocation[]; manque: number } {
  let reste = arrondiQuantite(Math.max(0, aTransferer));
  const soldes = new Map(lots.map((lot) => [lot.numeroLot, Math.max(0, lot.solde)]));
  const allocations: Allocation[] = [];

  const prendre = (numeroLot: string) => {
    if (reste <= 1e-9) return;
    const disponible = soldes.get(numeroLot) ?? 0;
    const pris = Math.min(disponible, reste);
    if (pris > 1e-9) {
      allocations.push({ numeroLot, quantite: arrondiQuantite(pris) });
      soldes.set(numeroLot, disponible - pris);
      reste = arrondiQuantite(reste - pris);
    }
  };

  const choisis = [...new Set(lotsChoisis)];
  for (const numeroLot of choisis) prendre(numeroLot);
  for (const lot of lots) {
    if (!choisis.includes(lot.numeroLot)) prendre(lot.numeroLot);
  }

  return { allocations, manque: reste > 1e-6 ? reste : 0 };
}

export type EntreeLigne = {
  id: number;
  articleType: string;
  articleId: number;
  nom: string;
  // quantite demandee enregistree / nouvelle quantite demandee saisie
  actuelle: number;
  nouvelle: number;
  // deja livre (Transfer Invoice valides) : la quantite demandee ne peut pas descendre en dessous
  livre: number;
  lotsChoisis: string[];
};

export type LignePlanifiee = {
  ligneId: number;
  nouvelle: number;
  demandeChangee: boolean;
  allocations: Allocation[];
};

const formatNombre = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 6 });

// Calcule, pour chaque ligne, la quantite demandee et la repartition de ce qui reste a transferer (demande - deja livre)
// sur les lots - jamais d'ecriture ici. Plusieurs lignes du meme article se partagent le meme stock. Leve une erreur
// claire (quantite invalide, sous le deja livre, stock insuffisant) : dans ce cas RIEN n'est enregistre.
// [lotsParArticle] : cle "MP::12" -> lots du depot source (ordre FEFO), solde net des autres reservations.
export function planifierLignes(entrees: EntreeLigne[], lotsParArticle: Map<string, LotRepartition[]>): LignePlanifiee[] {
  const soldesRestants = new Map<string, LotRepartition[]>();
  const plan: LignePlanifiee[] = [];

  for (const ligne of entrees) {
    if (!Number.isFinite(ligne.nouvelle) || ligne.nouvelle <= 0) {
      throw new Error(`"${ligne.nom}" : la quantite demandee doit etre superieure a 0 (ou coche "Supprimer" pour retirer la ligne).`);
    }
    if (ligne.nouvelle < ligne.livre - 1e-9) {
      throw new Error(
        `"${ligne.nom}" : impossible de demander moins que ce qui est deja livre (${formatNombre(ligne.livre)}).`
      );
    }

    const cle = `${ligne.articleType}::${ligne.articleId}`;
    let lots = soldesRestants.get(cle);
    if (!lots) {
      lots = (lotsParArticle.get(cle) ?? []).map((lot) => ({ ...lot }));
      soldesRestants.set(cle, lots);
    }

    const aTransferer = arrondiQuantite(ligne.nouvelle - ligne.livre);
    const { allocations, manque } = repartirQuantite(lots, ligne.lotsChoisis, aTransferer);
    if (manque > 0) {
      const disponible = lots.reduce((somme, lot) => somme + Math.max(0, lot.solde), 0);
      throw new Error(
        `Stock insuffisant pour "${ligne.nom}" : il manque ${formatNombre(manque)} pour transferer ${formatNombre(aTransferer)} (disponible dans le depot source : ${formatNombre(disponible)}).`
      );
    }
    for (const allocation of allocations) {
      const lot = lots.find((l) => l.numeroLot === allocation.numeroLot);
      if (lot) lot.solde = arrondiQuantite(lot.solde - allocation.quantite);
    }

    plan.push({
      ligneId: ligne.id,
      nouvelle: ligne.nouvelle,
      demandeChangee: Math.abs(ligne.nouvelle - ligne.actuelle) > 1e-9,
      allocations,
    });
  }

  return plan;
}
