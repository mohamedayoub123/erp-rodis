"use client";

import ExcelJS from "exceljs";
import { formatDate } from "@/lib/format-date";

// Meme approche que statistique-export-button.tsx (Statistique MP) :
// exceljs (pas xlsx, dont l'edition gratuite n'ecrit aucun style/couleur),
// export construit cote client a partir des donnees deja calculees cote
// serveur et passees en props (deja de simples objets/tableaux, rien a
// resoudre en plus ici).

export type ExportImportEnCours = {
  statut: string;
  datePrevueReception: string | null;
};

export type ExportCellule = {
  nomArticle: string;
  quantiteParCarton: number | null;
  unite: string | null;
  stockActuel: number;
  cartonsPossibles: number | null;
  importEnCours: ExportImportEnCours | null;
};

export type ExportRow = {
  nomArticle: string;
  gamme: string | null;
  cartonsPossibles: number | null;
  aucuneRecette: boolean;
  manqueLot: boolean;
  celluleParCategorie: Record<string, ExportCellule[]>;
};

function formatCellule(cellule: ExportCellule): string {
  if (cellule.quantiteParCarton === null) return "-";
  const qte = `${cellule.quantiteParCarton.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${cellule.unite || ""}`.trim();
  const cartons =
    cellule.cartonsPossibles !== null ? `${cellule.cartonsPossibles.toLocaleString("fr-FR")} cartons possibles` : "-";
  const base = `${qte} (stock ${cellule.stockActuel.toLocaleString("fr-FR")}) -> ${cartons}`;
  if (!cellule.importEnCours) return base;
  const dateImport = cellule.importEnCours.datePrevueReception
    ? formatDate(cellule.importEnCours.datePrevueReception)
    : "date non precisee";
  return `${base} | Import prevu ${dateImport} (${cellule.importEnCours.statut})`;
}

function formatCase(categorie: string, cellules: ExportCellule[]): string {
  if (cellules.length === 0) return "-";
  // Plusieurs articles de la meme categorie sur la meme recette (rare) -
  // une ligne par article, avec son nom en tete pour ne pas les confondre.
  if (cellules.length === 1) return formatCellule(cellules[0]);
  return cellules.map((cellule) => `${cellule.nomArticle} : ${formatCellule(cellule)}`).join("\n");
}

const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};

export function CapaciteComparaisonExportButton({
  rows,
  categorieColumns,
  todayIso,
}: {
  rows: ExportRow[];
  categorieColumns: string[];
  todayIso: string;
}) {
  async function handleExport() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Capacite Conditionnement");

    const headerLabels = ["Produit fini", "Gamme", "Cartons possibles", ...categorieColumns];
    const headerRow = sheet.addRow(headerLabels);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.border = ALL_BORDERS;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const colWidths = headerLabels.map((label) => Math.max(label.length + 2, 14));

    function trackWidth(colIndex: number, text: string) {
      const longestLine = Math.max(...text.split("\n").map((line) => line.length));
      colWidths[colIndex - 1] = Math.min(Math.max(colWidths[colIndex - 1], longestLine + 2), 45);
    }

    for (const row of rows) {
      const statut = row.aucuneRecette
        ? "Aucune recette Conditionnement"
        : row.manqueLot
          ? "Nombre de cartons du lot non renseigne"
          : null;

      const values: (string | number)[] = [
        row.nomArticle,
        row.gamme || "-",
        statut ? "-" : row.cartonsPossibles !== null ? row.cartonsPossibles : "-",
      ];
      let maxLines = 1;
      for (const categorie of categorieColumns) {
        const texte = statut ? "-" : formatCase(categorie, row.celluleParCategorie[categorie] ?? []);
        values.push(texte);
        maxLines = Math.max(maxLines, texte.split("\n").length);
      }

      const excelRow = sheet.addRow(values);
      excelRow.eachCell((cell, colIndex) => {
        cell.border = ALL_BORDERS;
        cell.alignment = { vertical: "middle", wrapText: true };
        trackWidth(colIndex, String(cell.value ?? ""));
      });
      if (statut) {
        excelRow.getCell(1).font = { bold: true };
        const noteCell = excelRow.getCell(2);
        noteCell.value = `${row.gamme || "-"} - ${statut}`;
        noteCell.font = { italic: true, color: { argb: "FFB45309" } };
      }
      excelRow.height = Math.max(20, maxLines * 15);
    }

    sheet.columns.forEach((col, index) => {
      col.width = colWidths[index] || 14;
    });
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headerLabels.length },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `capacite-conditionnement-${todayIso}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#1D6F42" />
        <path
          d="M7 7.5 10.6 12 7 16.5h2.1L11.6 13l2.5 3.5h2.1L12.6 12l3.6-4.5h-2.1l-2.5 3.4-2.5-3.4H7Z"
          fill="#ffffff"
        />
      </svg>
      Exporter Excel
    </button>
  );
}
