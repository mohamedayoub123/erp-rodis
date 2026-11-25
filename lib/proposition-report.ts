// Proposition de Commande MP : ce qui devait etre commande un mois et ne l'a pas ete est REPORTE sur les mois suivants.
//
// Le besoin d'un mois M = objectif de M (sortie du mois de livraison de M l'annee passee + 2 mois de plus, voir delai-commande-mp.ts) moins le stock actuel moins ce qui est deja en
// commande / import. Comme le stock et les commandes sont ceux d'AUJOURD'HUI, un besoin d'un mois precedent qui n'a pas ete commande
// est toujours la : il n'a pas diminue. Mais l'objectif change d'un mois a l'autre (la consommation varie), et quand l'objectif du mois
// suivant est plus bas, le besoin du mois d'avant disparaissait de la proposition alors qu'il n'avait pas ete commande.
//
// Regle : pour le mois choisi, la quantite a commander = le plus grand besoin non commande entre le mois en cours et le mois choisi
// (le besoin du mois choisi lui-meme, ou le reste d'un mois d'avant s'il est plus grand). Ce qui a ete commande entre-temps est deja
// retire (ce sont des commandes en cours). On n'additionne PAS les besoins de chaque mois : ils portent tous sur le meme stock et les
// memes commandes, les additionner ferait commander deux fois la meme chose.
//   exemple : novembre 10, decembre 8 (son objectif est plus bas) -> decembre = 10 (8 de decembre + 2 reportes de novembre)
//             novembre 10, decembre 15                          -> decembre = 15 (rien a reporter, deja compris)

export type ReportBesoin = {
  // besoin du mois choisi (objectif - stock - deja en commande, jamais negatif)
  besoinMois: number;
  // quantite ajoutee a cause des mois precedents non commandes (0 si le mois choisi est deja au moins aussi grand)
  reporte: number;
  // mois (0 = janvier) d'ou vient le reste reporte, null s'il n'y a rien de reporte
  reporteDe: number | null;
  // besoinMois + reporte
  aCommander: number;
};

const arrondi2 = (valeur: number) => Math.round(valeur * 100) / 100;

// besoinDuMois(mois) : besoin d'un mois calendaire (0 = janvier) avec le stock et les commandes d'aujourd'hui.
// moisCourant : mois d'aujourd'hui ; moisChoisi : mois choisi dans la page. Les mois sont pris dans l'ordre a partir du mois en cours
// (un mois choisi avant le mois en cours est celui de l'annee suivante).
export function calculerReportBesoin(
  besoinDuMois: (mois: number) => number,
  moisCourant: number,
  moisChoisi: number
): ReportBesoin {
  const besoinMois = Math.max(0, arrondi2(besoinDuMois(moisChoisi)));
  const distance = (((moisChoisi - moisCourant) % 12) + 12) % 12;

  let plusGrand = 0;
  let plusGrandDe: number | null = null;
  for (let decalage = 0; decalage < distance; decalage++) {
    const mois = (moisCourant + decalage) % 12;
    const besoin = Math.max(0, arrondi2(besoinDuMois(mois)));
    if (besoin > plusGrand) {
      plusGrand = besoin;
      plusGrandDe = mois;
    }
  }

  const reporte = Math.max(0, arrondi2(plusGrand - besoinMois));
  return {
    besoinMois,
    reporte,
    reporteDe: reporte > 0 ? plusGrandDe : null,
    aCommander: arrondi2(besoinMois + reporte),
  };
}
