// Surplus de cartons au-dela du vrac : fonctions PURES (aucun acces base) partagees par le serveur (refus a l'enregistrement, lib/conditionnement-
// codes-vrac.ts) et par les formulaires du Conditionnement (message AFFICHE tout de suite, avant d'appuyer sur Enregistrer).

// Surplus de cartons tolere : au-dela du vrac des codes choisis, une ligne peut produire au plus ce nombre de cartons en plus (pertes, ecarts de
// pesee). Plus que ca : la saisie est refusee, le vrac est insuffisant.
export const SURPLUS_MAX_CARTONS = 15;

// Ou en est le vrac des codes choisis pour une ligne et un code, AVANT la saisie en cours.
export type SituationVrac = {
  // kg dans un carton de cet article (contenance x pieces par carton)
  kgParCarton: number;
  // vrac qui reste sur les codes vrac choisis par cette ligne (kg)
  resteKg: number;
  // surplus deja saisi sur cette ligne (cartons produits sans vrac pour les couvrir)
  surplusDejaCartons: number;
  // cartons qu'on peut encore ajouter SANS surplus : tout ce qui est ajoute au-dela devient du surplus
  capaciteCartons: number;
  // codes vrac choisis par la ligne (pour le message)
  codes: string[];
};

function formater(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Surplus total de la ligne (cartons) si on ajoute cartonsAjoutes cartons
export function surplusApresCartons(situation: SituationVrac, cartonsAjoutes: number): number {
  return situation.surplusDejaCartons + Math.max(0, cartonsAjoutes - situation.capaciteCartons);
}

// Message de refus (le vrac est insuffisant) si ajouter cartonsAjoutes cartons fait depasser SURPLUS_MAX_CARTONS de surplus, sinon null
export function messageVracInsuffisant(situation: SituationVrac, cartonsAjoutes: number): string | null {
  if (!(cartonsAjoutes > 0)) return null;
  const surplusCartons = surplusApresCartons(situation, cartonsAjoutes);
  if (surplusCartons <= SURPLUS_MAX_CARTONS + 1e-6) return null;
  const cartonsPossibles = Math.max(0, Math.floor(situation.resteKg / situation.kgParCarton + 1e-9));
  return (
    `Pas possible avec ce vrac : le vrac est insuffisant. Il reste ${formater(situation.resteKg)} kg sur ${situation.codes.join(", ")} (environ ${formater(cartonsPossibles)} cartons) ` +
    `et tu veux ajouter ${formater(cartonsAjoutes)} cartons : au-dela du vrac, le surplus maximum est de ${SURPLUS_MAX_CARTONS} cartons (ici ${formater(Math.round(surplusCartons * 100) / 100)}).`
  );
}
