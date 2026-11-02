// Champ "Utilisation" d'un article MP : la liste des produits auxquels il sert. Souvent plusieurs, ecrits sur des lignes
// differentes ("A\nB") - mais aussi COLLES les uns aux autres quand la saisie n'a pas de retour a la ligne :
// "DSR WHITE SECRET 30MLDSR PERFECT GLOW 30MLDSR BB CLEAR 30ML". Chaque produit se termine par sa taille (30ML, 500ML,
// 125GRS, 1L, 600G...) : une taille suivie, SANS espace, d'une majuscule marque donc le debut du produit suivant.
// Un produit separe du suivant par un simple espace ("90ML LAIT ...") ne peut pas etre devine : il reste tel quel.

// Un nombre suivi de son unite ; l'ordre des unites compte (GRS avant GR avant G : "125GRSCREME" se coupe apres "GRS")
const TAILLE = /\d+(?:[.,]\d+)?(\s?)(ML|CL|GRS|GR|KG|G|L)/g;

function separerLigneCollee(ligne: string): string[] {
  const morceaux: string[] = [];
  let debut = 0;
  for (const taille of ligne.matchAll(TAILLE)) {
    const fin = (taille.index ?? 0) + taille[0].length;
    const unite = taille[2];
    // "G" et "L" seuls ne comptent que colles au nombre ("1L", "600G") : "1 LITRE" ne doit pas etre coupe
    const uniteSure = unite.length > 1 || taille[1] === "";
    if (uniteSure && /[A-Z]/.test(ligne[fin] ?? "")) {
      morceaux.push(ligne.slice(debut, fin));
      debut = fin;
    }
  }
  morceaux.push(ligne.slice(debut));
  return morceaux;
}

export function separerUtilisations(texte: string | null | undefined): string[] {
  return String(texte ?? "")
    .split(/\r?\n/)
    .flatMap(separerLigneCollee)
    .map((morceau) => morceau.trim())
    .filter(Boolean);
}
