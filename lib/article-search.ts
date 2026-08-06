// Recherche multi-mots utilisee pour filtrer par nom d'article/produit -
// chaque mot tape doit prefixer UN mot du nom cherche, mais pas forcement
// dans l'ordre ni consecutif (ex: "slee most" trouve "Sleeve Gel Moste" ET
// "Sleeve Lait Moste" - "slee" prefixe "Sleeve", "most" prefixe "Moste",
// peu importe ce qu'il y a entre les 2). Avant, seule une correspondance
// de sous-chaine continue etait acceptee ("slee most" ne matchait rien
// puisque "Sleeve Gel Moste" ne contient pas litteralement "slee most").
export function matchesArticleSearch(text: string | null | undefined, query: string): boolean {
  const words = String(text ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return true;

  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}
