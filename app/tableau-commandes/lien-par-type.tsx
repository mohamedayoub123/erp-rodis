import Link from "next/link";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Bouton "Commandes par type" des en-tetes du Tableau de commande : ouvre le module /tableau-commandes/par-type (choix du type de produit fini ->
// articles commandes, quantite de chaque client, stock, programmes en cours, reste a fabriquer). Affiche seulement a ceux qui ont le droit de voir
// cette page (nouvelle page : fermee par defaut, a accorder depuis Admin).
export async function LienParType() {
  const peutVoir = await canViewPageUser(await getCurrentStockUser(), "tableauCommandesParType");
  if (!peutVoir) return null;
  return (
    <Link href="/tableau-commandes/par-type" className="rounded-full bg-sky-700 px-4 py-2 text-[16px] font-medium text-white">
      Commandes par type
    </Link>
  );
}
