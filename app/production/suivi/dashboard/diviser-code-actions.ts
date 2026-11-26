"use server";

import { revalidatePath } from "next/cache";
import { canWritePageUser, getCurrentStockUser, getDashboardProductionUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import { diviserCodeLigne } from "@/lib/diviser-code-vrac";
import { viderCacheDashboard } from "./dashboard-data";

// Dashboard > Fabrication : diviser un code en 2 (voir lib/diviser-code-vrac.ts). Renvoie {ok, message} : Next.js efface le message d'une Error
// jetee depuis une Server Action en production.
type Reponse = { ok: true; message: string } | { ok: false; message: string };

export async function diviserCodeVracAction(ligneId: number, code: string, quantiteNouveau: number, nouveauCode: string): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    // Meme droit que le bouton Entrer de la Fabrication : ecriture sur le Rapport Fabrication + case "Entrer" du Dashboard
    if (!(await canWritePageUser(utilisateur, "productionSuiviProductionFabrication")) || !(await getDashboardProductionUser(utilisateur)).entrer) {
      return { ok: false, message: "Cet utilisateur ne peut pas diviser un code." };
    }
    if (!Number.isInteger(ligneId) || ligneId <= 0 || typeof code !== "string" || typeof nouveauCode !== "string") {
      return { ok: false, message: "Ligne ou code invalide." };
    }

    const resultat = await diviserCodeLigne(ligneId, code, quantiteNouveau, nouveauCode);
    if (!resultat.ok) return resultat;

    await logAudit({
      utilisateur,
      module: "ProgrammeLignes",
      action: "modification",
      cible: String(ligneId),
      resume: `Code divise sur la ligne ${ligneId} : ${resultat.message}`,
      avant: {
        ligneId,
        code: resultat.code,
        qtVrac: resultat.plan.vracAvant,
        qtCarton: resultat.plan.cartonsAvant,
        // quantites du code qui recoit, quand il etait deja sur la ligne
        ...(resultat.plan.ajoutSur ? { ajouteSur: resultat.plan.ajoutSur } : {}),
      },
      apres: { ligneId, gardee: resultat.plan.gardee, nouvelle: resultat.plan.nouvelle, numeroLot: resultat.plan.numeroLot },
    });

    viderCacheDashboard();
    revalidatePath("/production/suivi/dashboard");
    revalidatePath("/production/suivi-production");
    revalidatePath("/historique-programme-dispatcher");
    const avertissement = resultat.avertissements.length > 0 ? ` (attention : ${resultat.avertissements.join(" ; ")})` : "";
    return { ok: true, message: resultat.message + avertissement };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Division impossible." };
  }
}
