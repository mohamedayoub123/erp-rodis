"use server";

import { revalidatePath } from "next/cache";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import { changerArticleLigne } from "@/lib/changer-article-ligne";

// Dashboard > Conditionnement : changer la contenance d'une ligne (200 / 300 / 500 ml du meme vrac). Renvoie {ok, message} : Next.js efface le
// message d'une Error jetee depuis une Server Action en production.
type Reponse = { ok: true; message: string } | { ok: false; message: string };

// code : le lot de la ligne du Dashboard sur laquelle on a clique - seul ce lot change de contenance
export async function changerContenanceLigneAction(ligneId: number, nouvelArticleId: number, code?: string): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, "productionSuiviProductionConditionnement"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas changer la contenance." };
    }
    if (!Number.isInteger(ligneId) || ligneId <= 0 || !Number.isInteger(nouvelArticleId) || nouvelArticleId <= 0) {
      return { ok: false, message: "Ligne ou article invalide." };
    }

    const resultat = await changerArticleLigne(ligneId, nouvelArticleId, code);
    if (!resultat.ok) return resultat;

    await logAudit({
      utilisateur,
      module: "ProgrammeLignes",
      action: "modification",
      cible: String(ligneId),
      resume: `Contenance changee sur la ligne ${ligneId} : ${resultat.message}`,
      avant: { ligneId, produit: resultat.ancien, qtCarton: resultat.cartonsAvant, lotsGardes: resultat.lotsGardes },
      apres: {
        ligneId,
        produit: resultat.nouveau,
        qtCarton: resultat.cartonsApres,
        lotsDeplaces: resultat.lotsDeplaces,
        nouvelleLigneId: resultat.nouvelleLigneId,
      },
    });

    revalidatePath("/production/suivi/dashboard");
    revalidatePath("/production/suivi-production");
    return { ok: true, message: resultat.message };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Changement impossible." };
  }
}
