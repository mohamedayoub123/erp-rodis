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
};

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
  const stockDepasse1An = config.highlightStockOverConso12Mois && live ? live.stock > live.conso12Mois : false;

  const stockCell =
    live && live.stock < live.conso1Mois * (config.stockBasMultiplier ?? 3)
      ? { bg: config.stockBasBg, text: config.stockBasText }
      : null;

  const aCommanderCell =
    live && live.aCommander < 0 ? { color: config.redText, bold: Boolean(config.redTextBold) } : null;

  return {
    designationBg,
    designationText: stockDepasse1An ? config.redText : "#0f172a",
    stockCell,
    aCommanderCell,
  };
}
