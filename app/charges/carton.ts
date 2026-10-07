// Nb carton fabrique d'un mois (Charges Usine, Graphe Cout par Carton, prix carton de PR4).
//
// - AVANT septembre 2026 : le chiffre saisi a la main dans Charges Usine est celui qui compte (l'ERP
//   n'a pas toute l'histoire de ces mois-la). Si rien n'a ete saisi, on retombe sur le chiffre automatique.
// - A PARTIR de septembre 2026 : uniquement le chiffre automatique = cartons entres au Depot A par
//   "Entree Production" dont la date de fabrication tombe dans ce mois (voir
//   lib/carton-entree-production.ts). La saisie manuelle n'est plus utilisee.
export const DEBUT_CARTON_AUTOMATIQUE = { annee: 2026, mois: 9 } as const;

export function cartonAutomatiquePourMois(annee: number, mois: number) {
  if (annee !== DEBUT_CARTON_AUTOMATIQUE.annee) return annee > DEBUT_CARTON_AUTOMATIQUE.annee;
  return mois >= DEBUT_CARTON_AUTOMATIQUE.mois;
}

export function choisirNbCarton(params: {
  annee: number;
  mois: number;
  auto: number;
  manuel: number | null;
}): { valeur: number; estManuel: boolean } {
  const { annee, mois, auto, manuel } = params;
  if (cartonAutomatiquePourMois(annee, mois)) return { valeur: auto, estManuel: false };
  if (manuel !== null && manuel > 0) return { valeur: manuel, estManuel: true };
  return { valeur: auto, estManuel: false };
}
