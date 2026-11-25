// Ordre de classement des articles de matiere premiere, commun a Stock Alert MP et Proposition de Commande MP :
//  1) la categorie (famille), dans un ordre voulu : BASE, MP cosmetique, colorant cosmetique, article de conditionnement cosmetique,
//     flacons verre, MP plastique, colorant plastique, puis toutes les autres (par ordre alphabetique) ;
//  2) la sous-famille, par nom.
// Les categories sont comparees sans accent ni majuscule : "mp plastique" et "MP PLASTIQUE" sont la meme categorie.
export function cleCategorie(valeur: string | null | undefined): string {
  return (valeur ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

const ORDRE_CATEGORIES = new Map<string, number>([
  ["BASE", 0],
  ["MP COSMETIQUE", 1],
  ["COLORANT COSMETIQUE", 2],
  ["ARTICLE DE CONDITIONNEMENT COSMETIQUE", 3],
  ["FLACONS VERRE", 4],
  ["FLACON VERRE", 4],
  ["MP PLASTIQUE", 5],
  ["COLORANT PLASTIQUE", 6],
]);
const RANG_AUTRES_CATEGORIES = 7;

// A utiliser dans un .sort(...) : categorie (ordre voulu, les autres a la fin par nom) puis sous-famille (par nom). Renvoie 0 quand les
// deux articles sont dans la meme categorie et la meme sous-famille : l'appelant departage ensuite (couleur, nom...).
export function comparerCategorieEtSousFamille(
  a: { categorie: string | null; sous_famille: string | null },
  b: { categorie: string | null; sous_famille: string | null }
): number {
  return (
    (ORDRE_CATEGORIES.get(cleCategorie(a.categorie)) ?? RANG_AUTRES_CATEGORIES) -
      (ORDRE_CATEGORIES.get(cleCategorie(b.categorie)) ?? RANG_AUTRES_CATEGORIES) ||
    cleCategorie(a.categorie).localeCompare(cleCategorie(b.categorie), "fr") ||
    (a.sous_famille ?? "").localeCompare(b.sous_famille ?? "", "fr", { sensitivity: "base" })
  );
}
