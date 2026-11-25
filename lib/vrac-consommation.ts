// Dashboard > Conditionnement : le vrac consomme par un code se CALCULE avec les cartons produits (plus de quantite de vrac tapee a la main).
// Fonctions pures (aucun acces base), partagees par la lecture des choix de code vrac (lib/conditionnement-codes-vrac.ts).
//
// Regles :
//  - chaque fournee de cartons consomme cartons x kg par carton (contenance x pieces par carton de l'article de la ligne) sur le ou les codes
//    vrac choisis par la ligne ;
//  - le total consomme sur un code ne depasse JAMAIS le vrac fabrique sur ce code (ex : 2 400 kg fabriques = 200 cartons : 210 cartons
//    consomment 2 400 kg, les 10 cartons en plus ne retirent rien de plus) ;
//  - une ligne qui a plusieurs codes vrac les remplit dans l'ordre du choix : le 1er jusqu'a epuisement de son vrac, puis le 2eme ;
//  - plusieurs lignes sur le meme code se servent dans l'ordre des choix (le plus ancien d'abord) ;
//  - ancien fonctionnement : une ligne SANS choix de code vrac consomme son propre code (comme avant : cartons x kg par carton).

export type ChoixPourConsommation = { id: number; ligneId: number; code: string; codeVrac: string };

// Cartons saisis sur une ligne pour un code de programme, et ce que pese un carton (kg)
export type DemandeLigneCode = { ligneId: number; code: string; cartons: number; kgParCarton: number };

export type ResultatConsommation = {
  // kg consommes par chaque choix (id du choix)
  parChoix: Map<number, number>;
  // par code vrac : fabrique, consomme, reste (jamais negatif)
  parCodeVrac: Map<string, { fabrique: number; consomme: number; reste: number }>;
  // "ligneId::code" -> kg de cartons produits sans vrac pour les couvrir (au-dela du vrac fabrique)
  exces: Map<string, number>;
};

export function cleLigneCode(ligneId: number, code: string): string {
  return `${ligneId}::${code}`;
}

const arrondi3 = (valeur: number) => Math.round(valeur * 1000) / 1000;
const EPSILON = 1e-9;

export function calculerConsommationVrac(params: {
  // dans l'ordre de creation (id croissant) : c'est l'ordre dans lequel les lignes et les codes se servent
  choix: ChoixPourConsommation[];
  demandes: DemandeLigneCode[];
  fabriqueParCodeVrac: Map<string, number>;
}): ResultatConsommation {
  const { choix, fabriqueParCodeVrac } = params;
  const choixTries = [...choix].sort((a, b) => a.id - b.id);

  const reste = new Map<string, number>();
  for (const [codeVrac, fabrique] of fabriqueParCodeVrac) reste.set(codeVrac, Math.max(0, fabrique));
  const restantDe = (codeVrac: string) => reste.get(codeVrac) ?? 0;

  // kg encore a couvrir par (ligne, code)
  const demandeRestante = new Map<string, number>();
  const lignesAvecChoix = new Set(choixTries.map((c) => cleLigneCode(c.ligneId, c.code)));
  for (const demande of params.demandes) {
    const kg = Number(demande.cartons) * Number(demande.kgParCarton);
    if (!(kg > 0)) continue;
    const cle = cleLigneCode(demande.ligneId, demande.code);
    demandeRestante.set(cle, (demandeRestante.get(cle) ?? 0) + kg);
  }

  const parChoix = new Map<number, number>();
  const exces = new Map<string, number>();

  // Ancien fonctionnement : une ligne sans choix consomme son propre code, avant les choix (elle est anterieure)
  for (const [cle, kg] of [...demandeRestante]) {
    if (lignesAvecChoix.has(cle)) continue;
    const code = cle.slice(cle.indexOf("::") + 2);
    const pris = Math.min(kg, restantDe(code));
    if (pris > 0) reste.set(code, restantDe(code) - pris);
    demandeRestante.set(cle, kg - pris);
  }

  // Les choix, dans l'ordre : chacun prend ce qu'il peut sur son code vrac, le reste de la demande de la ligne passe au choix suivant
  for (const unChoix of choixTries) {
    const cle = cleLigneCode(unChoix.ligneId, unChoix.code);
    const demande = demandeRestante.get(cle) ?? 0;
    const pris = Math.min(demande, restantDe(unChoix.codeVrac));
    if (pris > EPSILON) {
      reste.set(unChoix.codeVrac, restantDe(unChoix.codeVrac) - pris);
      demandeRestante.set(cle, demande - pris);
    }
    parChoix.set(unChoix.id, arrondi3(Math.max(0, pris)));
  }

  for (const [cle, kg] of demandeRestante) {
    if (kg > 0.0005) exces.set(cle, arrondi3(kg));
  }

  const parCodeVrac = new Map<string, { fabrique: number; consomme: number; reste: number }>();
  for (const [codeVrac, fabrique] of fabriqueParCodeVrac) {
    const fab = Math.max(0, fabrique);
    const restant = Math.max(0, restantDe(codeVrac));
    parCodeVrac.set(codeVrac, { fabrique: arrondi3(fab), consomme: arrondi3(fab - restant), reste: arrondi3(restant) });
  }

  return { parChoix, parCodeVrac, exces };
}
