import type { GammeConfig } from "./gamme-config";
import type { RapportRowWithLive } from "./rapport-table";

// Regles de coloration derivees des donnees (dependent de row.live/row.categorie
// et de la date du jour) - extraites ici pour etre calculees UNE SEULE FOIS et
// partagees entre l'affichage a l'ecran (rapport-table.tsx) et l'export Excel
// (statistique-export-button.tsx), qui doivent toujours montrer exactement les
// memes couleurs. Les couleurs vraiment constantes (ex: quantite BC toujours
// bleu #1E3A8A, quantite 4D toujours vert #00B050) restent codees directement
// aux 2 endroits, ce ne sont pas des regles metier, juste des constantes.
export type RowDerivedColors = {
  designationBg: string | undefined;
  designationText: string;
  stockCell: { bg: string; text: string } | null;
  aCommanderCell: { color: string; bold: boolean } | null;
  // Stock actuel / conso 1 mois = combien de mois le stock actuel couvre
  // encore - null si conso 1 mois est inconnue/nulle (rien a diviser).
  autonomieMois: number | null;
  autonomieCell: { bg: string; text: string } | null;
};

// Meme rouge que la grande majorite des configs stockBasBg/stockBasText
// (voir gamme-config.ts) - couleur fixe ici (pas config.stockBasBg) car le
// seuil "3 mois" demande explicitement est universel, independant du
// stockBasMultiplier propre a chaque gamme (1/3/4 selon le fichier source).
const AUTONOMIE_BASSE_BG = "#FFC7CE";
const AUTONOMIE_BASSE_TEXT = "#9C0006";

export function computeRowDerivedColors(
  row: RapportRowWithLive,
  config: GammeConfig,
  todayIso: string
): RowDerivedColors {
  const live = row.live;
  const hasOpenBc = Boolean(live && live.enCoursBc > 0);
  const hasOpenImport = Boolean(live && live.enCours4d > 0);
  const importIsUrgent = Boolean(
    live && live.date4d.some((entry) => !entry.datePrevueReception || entry.datePrevueReception < todayIso)
  );
  const importSuppressesColor = hasOpenImport && !importIsUrgent;
  const designationBg = importIsUrgent
    ? "#00B050"
    : importSuppressesColor
      ? undefined
      : hasOpenBc
        ? "#FFFF00"
        : undefined;
  const autonomieMois = live && live.conso1Mois > 0 ? live.stock / live.conso1Mois : null;
  // Regle historique (fidele au fichier Excel source, 4 gammes seulement) +
  // nouvelle regle universelle demandee explicitement : "si le stock est
  // pour plus qu'1 an, l'article lui-meme s'allume en rouge" - sur TOUTES
  // les gammes, basee sur la meme conso 1 mois que la nouvelle colonne
  // Autonomie stock (mois > 12 = plus d'1 an de stock).
  const stockDepasse1An =
    (config.highlightStockOverConso12Mois && live ? live.stock > live.conso12Mois : false) ||
    (autonomieMois !== null && autonomieMois > 12);

  const stockCell =
    live && live.stock < live.conso1Mois * (config.stockBasMultiplier ?? 3)
      ? { bg: config.stockBasBg, text: config.stockBasText }
      : null;

  const aCommanderCell =
    live && live.aCommander < 0 ? { color: config.redText, bold: Boolean(config.redTextBold) } : null;

  const autonomieCell =
    autonomieMois !== null && autonomieMois <= 3
      ? { bg: AUTONOMIE_BASSE_BG, text: AUTONOMIE_BASSE_TEXT }
      : null;

  return {
    designationBg,
    designationText: stockDepasse1An ? config.redText : "#0f172a",
    stockCell,
    aCommanderCell,
    autonomieMois,
    autonomieCell,
  };
}
