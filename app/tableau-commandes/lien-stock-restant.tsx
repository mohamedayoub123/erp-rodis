import Link from "next/link";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Bouton "Stock restant" de la page Commandes par type : ouvre le module /tableau-commandes/stock-restant (choix du type de produit fini -> articles
// commandes avec seulement le stock et le stock restant apres commande et programme en cours). Affiche seulement a ceux qui ont le droit de voir cette
// page (nouvelle page : fermee par defaut, a accorder depuis Admin).
export async function LienStockRestant() {
  const peutVoir = await canViewPageUser(await getCurrentStockUser(), "tableauCommandesStockRestant");
  if (!peutVoir) return null;
  return (
    <Link href="/tableau-commandes/stock-restant" className="rounded-full bg-teal-700 px-4 py-2 text-[16px] font-medium text-white">
      Stock restant
    </Link>
  );
}
