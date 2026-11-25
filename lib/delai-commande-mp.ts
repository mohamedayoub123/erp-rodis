// Regle de commande des matieres premieres, commune a Besoin Commande MP, Proposition de Commande MP et Surstock MP (elles doivent
// toujours donner le meme objectif, sinon un article pourrait etre "a commander" et "en surstock" en meme temps).
//
// Une commande passee un mois donne ARRIVE 4 mois plus tard (DELAI_LIVRAISON_MOIS) : commander en decembre = livraison en avril.
// OBJECTIF = ce qu'il faut avoir en stock a la livraison : la consommation du mois de livraison (celle du MEME MOIS DE L'ANNEE PASSEE :
// avril 2026 pour avril 2027) + 2 mois de plus de securite (SECURITE_MOIS : les 2 mois suivants, mai et juin, eux aussi pris l'annee passee).
// A COMMANDER = objectif - (stock actuel + ce qui est deja en commande BC / import), jamais negatif.
// La consommation de chaque mois calendaire est celle des 12 derniers mois (une seule occurrence de chaque mois) : elle varie selon le
// mois, ce n'est pas une moyenne fixe.
export const DELAI_LIVRAISON_MOIS = 4;
export const SECURITE_MOIS = 2;
// mois de livraison + mois de securite
export const DUREE_OBJECTIF_MOIS = 1 + SECURITE_MOIS;

// Mois (0 = janvier ... 11 = decembre) ou arrive une commande passee en moisCommande.
export function moisLivraison(moisCommande: number): number {
  return (moisCommande + DELAI_LIVRAISON_MOIS) % 12;
}

// Annee de la consommation prise pour un mois calendaire (0 = janvier ... 11 = decembre) : la derniere fois que ce mois est passe dans les
// 12 derniers mois. Exemple en novembre 2026 : avril -> 2026, decembre -> 2025 (le mois en cours compte les jours des 12 derniers mois,
// donc un peu de novembre 2025 et le novembre 2026 deja ecoule).
export function anneeConsommationMois(mois: number, maintenant: Date = new Date()): number {
  return mois > maintenant.getMonth() ? maintenant.getFullYear() - 1 : maintenant.getFullYear();
}

// Les mois dont on additionne la consommation pour une commande passee en moisCommande : le mois de livraison puis les mois de securite.
export function moisObjectif(moisCommande: number): number[] {
  const livraison = moisLivraison(moisCommande);
  return Array.from({ length: DUREE_OBJECTIF_MOIS }, (_, decalage) => (livraison + decalage) % 12);
}

// consommationParMoisCalendaire : 12 valeurs (0 = janvier ... 11 = decembre) ; moisCommande : 0 = janvier ... 11 = decembre.
// Objectif d'une commande passee ce mois-la = consommation du mois de livraison + des 2 mois suivants (meme mois de l'annee passee).
export function objectifMois(consommationParMoisCalendaire: number[], moisCommande: number) {
  let total = 0;
  for (const mois of moisObjectif(moisCommande)) total += consommationParMoisCalendaire[mois];
  return Math.round(total * 100) / 100;
}
