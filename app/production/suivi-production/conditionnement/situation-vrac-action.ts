"use server";

import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { lireSituationVrac } from "@/lib/conditionnement-codes-vrac";
import type { SituationVrac } from "@/lib/vrac-surplus";

// Formulaires du Conditionnement : situation du vrac des codes choisis, lue APRES l'ouverture de la page (le calcul prend quelques secondes :
// il ne doit pas retarder l'affichage du formulaire). null = pas de controle (aucun code vrac choisi, droit manquant, lecture en erreur).
export async function lireSituationVracAction(ligneId: number, code: string): Promise<SituationVrac | null> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, "productionSuiviProductionConditionnement"))) return null;
    if (!Number.isInteger(ligneId) || ligneId <= 0) return null;
    return await lireSituationVrac(ligneId, code);
  } catch {
    return null;
  }
}
