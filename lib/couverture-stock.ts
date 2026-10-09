// "Le stock actuel suffit pour combien de mois ?" en suivant les sorties des MEMES MOIS DE L'ANNEE PASSEE
// (la consommation varie selon la saison, ce n'est pas une moyenne fixe) : on avance mois par mois a partir
// d'aujourd'hui, en retirant du stock les sorties du meme mois l'an dernier (octobre -> octobre de l'an passe,
// puis novembre -> novembre de l'an passe...), jusqu'a epuisement du stock.
// - le mois en cours ne compte que pour ses jours restants (le stock actuel contient deja les sorties du debut du mois) ;
// - au-dela de 12 mois on repete le meme motif d'une annee ;
// - le resultat est en mois, avec decimale (7,3 = 7 mois et un peu moins d'un tiers).
// Aucun import serveur : fonction pure, testable.

export const COUVERTURE_MAX_MOIS = 120; // 10 ans : au-dela on affiche "plus de 10 ans"

function cle(annee: number, mois: number) {
  return `${annee}-${String(mois).padStart(2, "0")}`;
}

// sortiesParMois : { "AAAA-MM": total des sorties ce mois-la } (tous les mois connus de l'article).
// Retourne null si l'article n'a eu AUCUNE sortie sur les 12 mois de reference (pas de rythme connu).
export function couvertureSelonAnneePassee(params: {
  stock: number;
  sortiesParMois: Record<string, number>;
  aujourdhuiIso: string;
}): number | null {
  const { stock, sortiesParMois, aujourdhuiIso } = params;
  const annee = Number(aujourdhuiIso.slice(0, 4));
  const mois = Number(aujourdhuiIso.slice(5, 7)); // 1..12
  const jour = Number(aujourdhuiIso.slice(8, 10));

  // sorties de l'an passe pour chacun des 12 mois a venir (mois en cours inclus)
  const demande = Array.from({ length: 12 }, (_, k) => {
    const date = new Date(Date.UTC(annee, mois - 1 + k, 1));
    return Number(sortiesParMois[cle(date.getUTCFullYear() - 1, date.getUTCMonth() + 1)] ?? 0);
  });

  if (demande.every((valeur) => valeur <= 0)) return null;
  if (!(stock > 0)) return 0;

  const joursDuMois = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const fractionRestante = Math.max(0, Math.min(1, (joursDuMois - jour + 1) / joursDuMois));

  let restant = stock;
  let temps = 0;
  for (let k = 0; k < COUVERTURE_MAX_MOIS; k++) {
    const duree = k === 0 ? fractionRestante : 1;
    const besoin = demande[k % 12] * (k === 0 ? fractionRestante : 1);
    if (besoin > 0 && restant <= besoin) {
      return Math.round((temps + duree * (restant / besoin)) * 10) / 10;
    }
    restant -= besoin;
    temps += duree;
  }
  return COUVERTURE_MAX_MOIS;
}
