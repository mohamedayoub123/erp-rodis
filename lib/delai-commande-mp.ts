// Regle de commande des matieres premieres, commune a Besoin Commande MP, Proposition de Commande MP et Surstock MP (elles doivent
// toujours donner le meme objectif, sinon un article pourrait etre "a commander" et "en surstock" en meme temps).
//
// Objectif pour un mois de depart = somme de la consommation du MEME MOIS DE L'ANNEE PASSEE pour ce mois et les suivants, sur toute la
// duree "delai de livraison + mois a couvrir + securite" :
//  - DELAI_LIVRAISON_MOIS : une commande passee aujourd'hui arrive en stock 4 mois plus tard ; pendant ces mois on consomme le stock
//    qu'on a deja, il doit donc les couvrir ;
//  - MOIS_A_COUVRIR : le mois ou la commande arrive : sa consommation doit etre dans le stock (si on a consomme 100 en janvier l'an
//    dernier, il faut 100 en stock pour janvier) ;
//  - SECURITE_MOIS : 2 mois de consommation de securite, pas plus (il n'y a plus de cycle de 6 mois entre deux commandes).
// La consommation de chaque mois calendaire est celle des 12 derniers mois (une seule occurrence de chaque mois, donc janvier 2027 est
// prevu avec la consommation de janvier 2026) : elle varie selon le mois, ce n'est pas une moyenne fixe.
export const DELAI_LIVRAISON_MOIS = 4;
export const MOIS_A_COUVRIR = 1;
export const SECURITE_MOIS = 2;
export const DUREE_OBJECTIF_MOIS = DELAI_LIVRAISON_MOIS + MOIS_A_COUVRIR + SECURITE_MOIS;

// consommationParMoisCalendaire : 12 valeurs (0 = janvier ... 11 = decembre) ; moisDepart : 0 = janvier ... 11 = decembre.
// Le calcul boucle sur l'annee (apres decembre on repart de janvier).
export function objectifGlissant(consommationParMoisCalendaire: number[], moisDepart: number) {
  let total = 0;
  for (let decalage = 0; decalage < DUREE_OBJECTIF_MOIS; decalage++) {
    total += consommationParMoisCalendaire[(moisDepart + decalage) % 12];
  }
  return Math.round(total * 100) / 100;
}
