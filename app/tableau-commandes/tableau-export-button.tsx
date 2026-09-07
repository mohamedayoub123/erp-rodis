"use client";

import ExcelJS from "exceljs";

// Meme approche que les autres exports du projet (Statistique MP, Capacite
// Conditionnement) : exceljs cote client, a partir de donnees deja
// calculees cote serveur et passees en props - reutilise pour le tableau
// par gamme ET pour "Article manquant", qui partagent la meme forme
// (Article, une colonne par commande, Total/Stock/Reste/Qt en cours).

export type ExportCommandColumn = {
  key: string;
  client: string;
  nombreCamion: number | null;
  numeroProforma: string;
  dateEcriture: string | null;
  statut: string;
};

export type ExportDataRow =
  | { kind: "banner"; label: string }
  | {
      kind: "article";
      article: string;
      quantitiesByColumn: Record<string, number>;
      total: number;
      stock: number;
      reste: number;
      qtEnCours: number;
    };

const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};
const TURQUOISE = "FF1F9DA5";
const MANQUE_YELLOW = "FFFFF59D";
const BL_TRANSFORME_GREEN = "FF62FF1B";
const STAND_YELLOW = "FFFFE01B";

function formatDateFr(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

export function TableauExportButton({
  title,
  commandColumns,
  rows,
  fileName,
}: {
  title: string;
  commandColumns: ExportCommandColumn[];
  rows: ExportDataRow[];
  fileName: string;
}) {
  async function handleExport() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title.slice(0, 31) || "Export", {
      views: [{ state: "frozen", ySplit: 6 }],
    });

    const headerLabels = [
      "Article",
      ...commandColumns.map((col) => col.numeroProforma || col.client || col.key),
      "Total",
      "Stock",
      "Reste",
      "Qt en cours de Conditionnement",
    ];
    const totalCols = headerLabels.length;

    function bannerRow(label: string) {
      const row = sheet.addRow([label]);
      sheet.mergeCells(row.number, 1, row.number, totalCols);
      const cell = row.getCell(1);
      cell.font = { bold: true, color: { argb: "FF0F172A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TURQUOISE } };
      cell.alignment = { horizontal: "left", vertical: "middle" };
      row.height = 20;
    }

    bannerRow(title);

    const statutRow = sheet.addRow(["Statut", ...commandColumns.map((col) => col.statut), "", "", "", ""]);
    const clientRow = sheet.addRow(["Client", ...commandColumns.map((col) => col.client || "-"), "", "", "", ""]);
    const camionRow = sheet.addRow([
      "Nombre de camion",
      ...commandColumns.map((col) => (col.nombreCamion === null ? "-" : col.nombreCamion)),
      "",
      "",
      "",
      "",
    ]);
    const proformaRow = sheet.addRow([
      "Proforma #",
      ...commandColumns.map((col) => col.numeroProforma || "-"),
      "TOTAL",
      "STOCK",
      "RESTE",
      "Qt en cours",
    ]);
    const dateRow = sheet.addRow([
      "Date commande",
      ...commandColumns.map((col) => formatDateFr(col.dateEcriture)),
      "",
      "",
      "",
      "",
    ]);

    for (const row of [statutRow, clientRow, camionRow, proformaRow, dateRow]) {
      row.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TURQUOISE } };
        cell.border = ALL_BORDERS;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });
    }

    const colWidths = headerLabels.map((label) => Math.max(String(label).length + 2, 10));
    colWidths[0] = Math.max(colWidths[0], 32);

    function trackWidth(colIndex: number, text: string) {
      colWidths[colIndex - 1] = Math.min(Math.max(colWidths[colIndex - 1], text.length + 2), 40);
    }

    for (const row of rows) {
      if (row.kind === "banner") {
        bannerRow(row.label);
        continue;
      }

      const isManque = row.reste < 0;
      const isBlTransforme = row.article.toLowerCase().includes("bl transforme");
      const isStand =
        row.article.toLowerCase().includes("stand") || row.article.toLowerCase().includes("production");

      const articleFill = isManque
        ? MANQUE_YELLOW
        : isStand
          ? STAND_YELLOW
          : isBlTransforme
            ? BL_TRANSFORME_GREEN
            : TURQUOISE;
      const lineFill = isManque ? MANQUE_YELLOW : "FFFFFFFF";
      const summaryFill = isManque ? MANQUE_YELLOW : TURQUOISE;

      const values = [
        row.article,
        ...commandColumns.map((col) => row.quantitiesByColumn[col.key] || ""),
        row.total,
        row.stock,
        row.reste,
        row.qtEnCours || "",
      ];

      const excelRow = sheet.addRow(values);
      excelRow.eachCell((cell, colIndex) => {
        cell.border = ALL_BORDERS;
        cell.alignment = { vertical: "middle", wrapText: true };
        const fill =
          colIndex === 1
            ? articleFill
            : colIndex > totalCols - 4
              ? summaryFill
              : lineFill;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        if (isManque && colIndex > totalCols - 4) {
          cell.font = { color: { argb: "FFB91C1C" }, bold: true };
        }
        trackWidth(colIndex, String(cell.value ?? ""));
      });
    }

    sheet.columns.forEach((col, index) => {
      col.width = colWidths[index] || 12;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[16px] font-medium text-slate-700 transition hover:border-slate-400"
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
