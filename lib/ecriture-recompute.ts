import { fetchEcrituresAffecteesParLot } from "@/lib/comptabilite";
import { recalculerEcritureFabricationVrac } from "@/app/production/suivi-production/actions";
import {
  recalculerEcritureEntreeProduction,
  recalculerEcritureConditionnementMp,
} from "@/app/mouvements/produit-fini/entree-production/actions";
import { creerEcritureVente } from "@/app/commandes/actions";

// Point d'entree unique pour "un prix de lot MP vient d'etre corrige,
// recalcule tout ce qui a deja ete chiffre avec" - regroupe les 3
// recalculs possibles (Fabrication, Entree production, Cout de vente),
// chacun rejouable a l'identique depuis ce qui est deja enregistre en
// base (jamais depuis un formulaire). Dans un fichier a part (pas dans
// lib/comptabilite.ts, importe PAR ces 3 fichiers) pour eviter un import
// circulaire.
export async function recalculerEcrituresDependantes(
  articleMpId: number,
  numeroLot: string,
  currentUser: string | null
): Promise<void> {
  const affectees = await fetchEcrituresAffecteesParLot(articleMpId, numeroLot);

  for (const { sourceType, sourceId } of affectees) {
    try {
      if (sourceType === "fabrication_vrac") {
        const [ligneIdRaw, ...codeParts] = sourceId.split("-");
        const ligneId = Number(ligneIdRaw);
        const code = codeParts.join("-");
        if (ligneId && code) {
          await recalculerEcritureFabricationVrac(ligneId, code, currentUser);
        }
      } else if (sourceType === "entree_production") {
        const [groupeIdRaw, articleIdRaw] = sourceId.split("-");
        const groupeId = Number(groupeIdRaw);
        const articleId = Number(articleIdRaw);
        if (groupeId && articleId) {
          await recalculerEcritureEntreeProduction(groupeId, articleId, currentUser);
        }
      } else if (sourceType === "conditionnement_mp") {
        const [ligneIdRaw, ...codeParts] = sourceId.split("-");
        const ligneId = Number(ligneIdRaw);
        const code = codeParts.join("-");
        if (ligneId && code) {
          await recalculerEcritureConditionnementMp(ligneId, code, currentUser);
        }
      } else if (sourceType === "commande_cout_vente" || sourceType === "commande_vente") {
        const commandeId = Number(sourceId);
        if (commandeId) {
          await creerEcritureVente(commandeId, currentUser);
        }
      }
    } catch (error) {
      // Un recalcul echoue (ex: source entretemps supprimee) ne doit jamais
      // bloquer la correction de prix elle-meme ni les autres recalculs.
      console.error(`Recalcul ecriture echoue (${sourceType}/${sourceId}):`, error);
    }
  }
}
