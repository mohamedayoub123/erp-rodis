// Ce qui suit "Livre (TS97) - 46 - le 29-09-2026" dans le Flux par Code et dans le flux d'un Transfer Order : POUR QUI (le nom
// du client), la proforma et le numero de BL de la livraison, chacun seulement s'il est connu. Avant, le nom du client
// n'apparaissait que s'il n'y avait PAS de proforma, et le BL n'apparaissait jamais.
// "client" pour une livraison de commande (le "livre pour" est alors le client de la commande) ; "pour" pour une sortie manuelle
// (nom saisi a la main).
export function detailLivraison(sortie: {
  livrePour: string | null;
  proforma: string | null;
  numeroBl: string | null;
  deCommande?: boolean;
}): string {
  const morceaux: string[] = [];
  if (sortie.livrePour) morceaux.push(`${sortie.deCommande ? "client" : "pour"} ${sortie.livrePour}`);
  if (sortie.proforma) morceaux.push(`proforma ${sortie.proforma}`);
  if (sortie.numeroBl) morceaux.push(`BL ${sortie.numeroBl}`);
  return morceaux.length > 0 ? ` - ${morceaux.join(" - ")}` : "";
}
