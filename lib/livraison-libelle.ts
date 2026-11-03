import { formatDate } from "@/lib/format-date";

// Ce qui suit "Livre (TS97) - 46" dans le Flux par Code et dans le flux d'un Transfer Order : la DATE DE LIVRAISON, POUR QUI (le nom du
// client), la proforma et le numero de BL de la livraison, chacun seulement s'il est connu. Avant, le nom du client
// n'apparaissait que s'il n'y avait PAS de proforma, le BL n'apparaissait jamais, et la date n'etait qu'un "le 29-09-2026" sans
// dire que c'est la livraison (et absente du flux d'un Transfer Order).
// "client" pour une livraison de commande (le "livre pour" est alors le client de la commande) ; "pour" pour une sortie manuelle
// (nom saisi a la main).
export function detailLivraison(sortie: {
  dateLivraison?: string | null;
  livrePour: string | null;
  proforma: string | null;
  numeroBl: string | null;
  deCommande?: boolean;
}): string {
  const morceaux: string[] = [];
  if (sortie.dateLivraison) morceaux.push(`livre le ${formatDate(sortie.dateLivraison)}`);
  if (sortie.livrePour) morceaux.push(`${sortie.deCommande ? "client" : "pour"} ${sortie.livrePour}`);
  if (sortie.proforma) morceaux.push(`proforma ${sortie.proforma}`);
  if (sortie.numeroBl) morceaux.push(`BL ${sortie.numeroBl}`);
  return morceaux.length > 0 ? ` - ${morceaux.join(" - ")}` : "";
}
