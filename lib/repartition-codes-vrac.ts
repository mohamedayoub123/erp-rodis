// Entree Production : une quantite de produit fini emballee sur une ligne qui a plusieurs codes vrac choisis (Dashboard > Conditionnement) est
// repartie entre ces codes selon les kg de vrac pris sur chacun (ex : 1 000 kg sur X1 + 2 000 kg sur X2 = 1/3 des cartons sur X1, 2/3 sur X2).
// Arrondi au centieme de carton (la quantite d'un carton peut etre fractionnaire avec "Par ligne") ; le DERNIER code recoit le reste, la somme
// retombe donc toujours exactement sur la quantite d'origine.
export type PartCodeVrac = { codeVrac: string; quantite: number };

const arrondi2 = (valeur: number) => Math.round(valeur * 100) / 100;

export function repartirQuantite(quantite: number, choix: { codeVrac: string; quantite: number }[]): PartCodeVrac[] {
  if (choix.length === 0) return [];
  if (choix.length === 1) return [{ codeVrac: choix[0].codeVrac, quantite: arrondi2(quantite) }];

  const totalKg = choix.reduce((somme, c) => somme + Number(c.quantite), 0);
  const parts: PartCodeVrac[] = [];
  let deja = 0;
  choix.forEach((c, index) => {
    const dernier = index === choix.length - 1;
    const part = dernier
      ? arrondi2(quantite - deja)
      : arrondi2(totalKg > 0 ? (quantite * Number(c.quantite)) / totalKg : quantite / choix.length);
    parts.push({ codeVrac: c.codeVrac, quantite: Math.max(0, part) });
    deja = arrondi2(deja + part);
  });
  return parts;
}
