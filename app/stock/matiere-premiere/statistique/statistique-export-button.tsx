"use client";

import ExcelJS from "exceljs";
import type { ColumnDescriptor, GammeConfig } from "./gamme-config";
import type { RapportRowWithLive, RowColors } from "./rapport-table";
import { computeRowDerivedColors } from "./row-colors";

// Export Excel colore a l'identique du tableau affiche a l'ecran - meme
// regles de couleur (voir row-colors.ts, partage avec rapport-table.tsx),
// meme legende, memes notes en bas de page. Utilise exceljs (pas le xlsx
// deja dans le projet, dont l'edition gratuite n'ecrit AUCUN style/couleur
// dans le fichier - verifie : une couleur assignee a une cellule disparait
// silencieusement a la relecture) - demande explicite : "utilise les
// couleurs qui existent deja dans la statistique".

function hexColor(hex: string): string {
  const clean = hex.replace("#", "").toUpperCase();
  return clean.length === 6 ? `FF${clean}` : clean;
}

const NO_FILL: ExcelJS.Fill = { type: "pattern", pattern: "none" };

function fillFor(bg: string | undefined): ExcelJS.Fill {
  if (!bg || bg === "transparent") return NO_FILL;
  return { type: "pattern", pattern: "solid", fgColor: { argb: hexColor(bg) } };
}

function formatCellValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  // Un champ "statistique 4D..." (editable-number) peut contenir une vraie
  // note texte au lieu d'un chiffre (ex: "voir ayoub" - trouve tel quel
  // dans COLORANT PLASTIQUE, copie depuis le fichier Excel source). A
  // COMMANDER/conso 1 mois s'en servent dans un calcul (Number(...) ->
  // NaN) - un NaN ecrit dans une cellule Excel NUMERIQUE (sans type texte)
  // est invalide au sens du format, Excel refusait d'ouvrir le fichier
  // sans le "reparer" (bug reel confirme, cellules N/Q corrompues).
  if (typeof value === "number") return Number.isFinite(value) ? value : "-";
  return value;
}

// Longueur de la ligne la plus longue d'un texte multi-lignes ("\n") - sert
// a dimensionner une colonne/ligne sur la vraie largeur/hauteur necessaire,
// jamais sur la somme de toutes les lignes empilees (qui donnait des
// colonnes bien trop larges des qu'une case avait plusieurs dossiers BC/4D).
function longestLine(text: string): number {
  return Math.max(...text.split("\n").map((line) => line.length));
}

const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};
const THICK_TOP_BORDER: Partial<ExcelJS.Borders> = { ...ALL_BORDERS, top: { style: "thick", color: { argb: "FF000000" } } };

export function StatistiqueExportButton({
  gammeStatistique,
  rows,
  columns,
  config,
  colorsByRow,
  todayIso,
}: {
  gammeStatistique: string;
  rows: RapportRowWithLive[];
  columns: ColumnDescriptor[];
  config: GammeConfig;
  colorsByRow: Record<number, RowColors>;
  todayIso: string;
}) {
  async function handleExport() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(gammeStatistique.slice(0, 31) || "Export", {
      views: [{ state: "frozen", ySplit: 0 }],
    });

    // colgroup : ORDRE, DESIGNATION, ...colonnes dynamiques (spacer garde un
    // slot etroit sans titre, meme repere visuel qu'a l'ecran), Statistique 6
    // mois (systeme), Remarque.
    const headerLabels = [
      "ORDRE",
      "DESIGNATION",
      ...columns.map((col) => (col.kind === "spacer" ? "" : col.label.toUpperCase())),
      "STATISTIQUE 6 MOIS (SYSTEME)",
      "REMARQUE",
    ];
    const totalCols = headerLabels.length;

    // Ligne 1 : legende rotation (categorieStyles), si cette gamme en a une -
    // memes couleurs que les puces affichees au-dessus du tableau a l'ecran.
    // Ordre copie du fichier source reel : legende d'abord, titre/date ensuite.
    if (config.categorieStyles) {
      const legendEntries = Object.entries(config.categorieStyles);
      const legendRow = sheet.addRow([]);
      let col = 1;
      for (const [label, style] of legendEntries) {
        const span = Math.max(1, Math.floor(totalCols / legendEntries.length));
        sheet.mergeCells(legendRow.number, col, legendRow.number, Math.min(col + span - 1, totalCols));
        const cell = legendRow.getCell(col);
        cell.value = label;
        cell.font = { bold: true, italic: true, color: { argb: hexColor(style.text) } };
        cell.fill = fillFor(style.bg);
        cell.alignment = { horizontal: "center", vertical: "middle" };
        col += span;
      }
      legendRow.height = 20;
    }

    // Ligne 2 : titre/date - reprend le contenu reel du bandeau du fichier
    // source (date du jour, gamme + date de mise a jour, et la note rouge
    // "stock > 1 an" quand cette regle existe pour la gamme).
    const titleRow = sheet.addRow([]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, totalCols);
    const titleCell = titleRow.getCell(1);
    // Meme ordre et memes couleurs que le fichier source reel : Date (noir)
    // + note rouge "stock > 1 an" d'abord, puis le nom de la gamme + date de
    // mise a jour ensuite - fond blanc (pas de bandeau fonce), texte
    // colore uniquement.
    const titleRuns: ExcelJS.RichText[] = [
      { font: { bold: true, italic: true, size: 12, color: { argb: "FF000000" } }, text: `Date : ${todayIso}     ` },
    ];
    if (config.highlightStockOverConso12Mois) {
      titleRuns.push({
        font: { bold: true, italic: true, size: 12, color: { argb: "FFFF0000" } },
        text: "Stock supérieur à 1 an de conso noté en rouge     ",
      });
    }
    titleRuns.push({
      font: { bold: true, italic: true, size: 12, color: { argb: "FF000000" } },
      text: `${gammeStatistique.toUpperCase()} mis à jour le ${todayIso}`,
    });
    titleCell.value = { richText: titleRuns };
    titleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    titleRow.height = 28.2;

    // Ligne d'en-tetes.
    const headerRow = sheet.addRow(headerLabels);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.border = ALL_BORDERS;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    headerRow.height = 52.8;
    sheet.views = [{ state: "frozen", ySplit: headerRow.number }];

    // Largeurs de colonnes (unites caracteres Excel) - ORDRE/DESIGNATION
    // reprennent les valeurs mesurees dans le fichier source reel (ORDRE
    // etroit, DESIGNATION tres large pour les noms d'articles longs), la
    // colonne spacer reste fixe (case vide, jamais de contenu) - toutes les
    // autres colonnes partent de la largeur de leur en-tete puis s'ajustent
    // au contenu reel via trackWidth ci-dessous (jamais plus large que ce
    // qui est ecrit : demande explicite "ouvrir a la taille des ecritures,
    // pas plus", les largeurs fixes copiees du fichier source donnaient
    // beaucoup de vide des que le contenu reel etait plus court).
    const colWidths = [
      8.11,
      88.89,
      ...columns.map((col) => (col.kind === "spacer" ? 19.33 : longestLine(col.label) + 2)),
      longestLine("STATISTIQUE 6 MOIS (SYSTEME)") + 2,
      longestLine("REMARQUE") + 2,
    ];

    function trackWidth(colIndex: number, text: string) {
      const width = Math.min(Math.max(longestLine(text) + 2, colWidths[colIndex - 1] || 10), 60);
      colWidths[colIndex - 1] = Math.max(colWidths[colIndex - 1] || 0, width);
    }

    rows.forEach((row, rowIndex) => {
      const { designationBg, designationText, stockCell, aCommanderCell } = computeRowDerivedColors(
        row,
        config,
        todayIso
      );
      const categorieStyle = row.categorie ? config.categorieStyles?.[row.categorie] : null;
      const rowColors = colorsByRow[row.id] || {};
      const isSheetBoundary = rowIndex > 0 && row.categorie !== rows[rowIndex - 1].categorie;

      const excelRow = sheet.addRow([]);
      let colIndex = 1;
      // Nombre de lignes empilees (BC/4D avec plusieurs dossiers) - la
      // hauteur de ligne doit suivre le plus grand nombre de lignes d'une
      // case, sinon les dossiers suivants sont coupes/superposes a la ligne
      // du dessous (demande explicite : "il faut montre tout les contenu").
      let maxLines = 1;

      function resolveCellColor(target: string, base: { bg?: string; text?: string } | undefined) {
        const rowOverride = rowColors["__row__"];
        const cellOverride = rowColors[target];
        return {
          bg: cellOverride?.bg ?? rowOverride?.bg ?? base?.bg,
          text: cellOverride?.text ?? rowOverride?.text ?? base?.text,
        };
      }

      function applyCell(
        target: string,
        value: string | number,
        base: { bg?: string; text?: string } | undefined,
        opts?: { bold?: boolean }
      ) {
        const cell = excelRow.getCell(colIndex);
        cell.value = value;
        const resolved = resolveCellColor(target, base);
        cell.fill = fillFor(resolved.bg);
        cell.font = { color: resolved.text ? { argb: hexColor(resolved.text) } : undefined, bold: opts?.bold };
        cell.border = isSheetBoundary ? THICK_TOP_BORDER : ALL_BORDERS;
        cell.alignment = { vertical: "middle", wrapText: true };
        trackWidth(colIndex, String(value));
        colIndex += 1;
      }

      // La couleur de categorie (orange FORTE ROTATION, etc.) ne colore QUE
      // la cellule ORDRE a l'ecran (voir rapport-table.tsx : `style` n'est
      // passe qu'au 1er <td>) - toutes les autres cellules restent blanches
      // sauf leur propre regle (stock bas, A COMMANDER negatif...). Bug
      // corrige : cette fonction appliquait a tort categorieStyle comme
      // fond de base sur TOUTES les cellules de la ligne, noyant le
      // tableau dans la couleur de categorie et rendant le vrai rouge/rose
      // illisible en plus de ne pas correspondre a l'ecran.
      applyCell("__row__", row.ordre, categorieStyle ?? undefined);
      applyCell("DESIGNATION", row.designation, { bg: designationBg, text: designationText });

      for (const col of columns) {
        // La colonne spacer n'ecrit rien (case vide, comme a l'ecran) mais
        // DOIT quand meme avancer colIndex - sinon toutes les colonnes
        // suivantes (tonnage 1 tc, conso 1mois...) glissent d'une case vers
        // la gauche par rapport a leur en-tete (bug reel corrige : les
        // valeurs affichees ne correspondaient plus a leur colonne).
        if (col.kind === "spacer") {
          colIndex += 1;
          continue;
        }

        if (col.kind === "editable-text" || col.kind === "editable-number") {
          // "avis" : rouge gras, meme couleur que text-red-600 a l'ecran
          // (rapport-table.tsx) - seule colonne editable a avoir une
          // couleur de texte fixe.
          applyCell(
            col.key,
            formatCellValue(row.donnees?.[col.key]),
            col.key === "avis" ? { text: "DC2626" } : undefined,
            { bold: col.key === "avis" }
          );
          continue;
        }

        if (col.kind === "static") {
          applyCell(col.key, formatCellValue(row.donnees?.[col.key]), undefined);
          continue;
        }

        // kind === "live"
        if (!row.live) {
          applyCell(col.key, "article introuvable", undefined);
          continue;
        }
        const live = row.live;

        if (col.liveField === "qteBcEtDate" || col.liveField === "date4d") {
          const entries = live[col.liveField];
          const qtyColor = col.liveField === "qteBcEtDate" ? "1E3A8A" : "00B050";
          const cell = excelRow.getCell(colIndex);
          if (entries.length === 0) {
            cell.value = "-";
          } else {
            cell.value = {
              richText: entries.flatMap((entry, i) => [
                { font: { bold: true, color: { argb: `FF${qtyColor}` } }, text: `${entry.quantite} ` },
                { font: {}, text: `${entry.detail}${i < entries.length - 1 ? "\n" : ""}` },
              ]),
            };
          }
          const resolved = resolveCellColor(col.key, undefined);
          cell.fill = fillFor(resolved.bg);
          cell.border = isSheetBoundary ? THICK_TOP_BORDER : ALL_BORDERS;
          cell.alignment = { vertical: "middle", wrapText: true };
          // Largeur = la ligne la plus longue (pas la somme de toutes les
          // lignes empilees) ; hauteur = nombre de dossiers empiles.
          for (const entry of entries) {
            trackWidth(colIndex, `${entry.quantite} ${entry.detail}`);
          }
          maxLines = Math.max(maxLines, entries.length);
          colIndex += 1;
          continue;
        }

        const value = col.liveField ? live[col.liveField] : "-";
        let base: { bg?: string; text?: string } | undefined;
        let bold = false;
        if (col.liveField === "stock" && stockCell) base = stockCell;
        if (col.liveField === "aCommander" && aCommanderCell) {
          base = { ...base, text: aCommanderCell.color };
          bold = aCommanderCell.bold;
        }
        if (col.liveField === "enCoursBc") {
          base = { ...base, text: "1E3A8A" };
          bold = true;
        }
        if (col.liveField === "enCours4d") {
          base = { ...base, text: "00B050" };
          bold = true;
        }
        applyCell(col.key, formatCellValue(value), base, { bold });
      }

      applyCell(
        "__stat6MoisSysteme__",
        row.live ? formatCellValue(row.live.conso6MoisSysteme) : "-",
        undefined
      );
      applyCell("__remarque__", formatCellValue((row.donnees?.["remarque_libre"] as string) ?? ""), undefined);

      excelRow.height = Math.max(20.4, maxLines * 15);
    });

    sheet.columns.forEach((col, index) => {
      col.width = colWidths[index] || 12;
    });
    sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: totalCols } };

    // Bloc Notes en bas de page - meme texte/couleurs que la section "Notes"
    // affichee sous le tableau a l'ecran.
    if (config.notesLegend.length > 0) {
      sheet.addRow([]);
      for (const note of config.notesLegend) {
        const noteRow = sheet.addRow([note.text]);
        sheet.mergeCells(noteRow.number, 1, noteRow.number, totalCols);
        const cell = noteRow.getCell(1);
        cell.font = { bold: Boolean(note.bold), color: { argb: hexColor(note.textColor || "#0f172a") } };
        cell.fill = fillFor(note.bg);
        cell.alignment = { horizontal: "center", vertical: "middle" };
        noteRow.height = 18;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `statistique-mp-${gammeStatistique}-${todayIso}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      aria-label="Exporter en Excel"
      title="Exporter en Excel"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:border-slate-400"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#1D6F42" />
        <path
          d="M7 7.5 10.6 12 7 16.5h2.1L11.6 13l2.5 3.5h2.1L12.6 12l3.6-4.5h-2.1l-2.5 3.4-2.5-3.4H7Z"
          fill="#ffffff"
        />
      </svg>
    </button>
  );
}
