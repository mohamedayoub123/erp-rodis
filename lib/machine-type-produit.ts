// Une machine accepte-t-elle ce type de produit ? Les types sont ecrits a la main sur les machines et sur les
// articles : "GEL DOUCHE" et "gel douche" sont le meme type (avant, la casse cachait la machine dans la liste).
export function typeAccepte(typesMachine: string[], typeArticle: string): boolean {
  const normaliser = (texte: string) => texte.trim().toLowerCase();
  const cible = normaliser(typeArticle);
  return typesMachine.some((type) => normaliser(type) === cible);
}
