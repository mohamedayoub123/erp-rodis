// Nb carton fabrique d'un mois, utilise par le Graphe Cout par Carton.
//
// - AVANT septembre 2026 : le chiffre saisi a la main dans Charges Usine est celui qui compte (Suivi
//   Production n'a pas toute l'histoire de ces mois-la). Si rien n'a ete saisi, on retombe sur le
//   chiffre automatique.
// - A PARTIR de septembre 2026 : uniquement le chiffre automatique de Suivi Production (cartons
//   reellement fabriques ce mois-la). La saisie manuelle n'est plus utilisee.
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
