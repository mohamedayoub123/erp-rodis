"use client";

import ExcelJS from "exceljs";
import { formatDate } from "@/lib/format-date";
import type { DossierGroup } from "./page";

// exceljs (pas le xlsx deja dans le projet, dont l'edition gratuite n'ecrit
// aucun style) - meme choix que StatistiqueExportButton, pour la meme raison.
const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};

export function ImportMpExportButton({ groups, todayIso }: { groups: DossierGroup[]; todayIso: string }) {
  async function handleExport() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Import MP");

    const headerLabels = [
      "Doss. 4D",
      "Doss. ERP",
      "Nb articles",
      "Qte importee",
      "Date recente",
      "Statut",
      "Date prevue reception",
    ];

    const headerRow = sheet.addRow(headerLabels);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.border = ALL_BORDERS;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const group of groups) {
      const row = sheet.addRow([
        group.nDoss4d || "-",
        group.nDossErp || "-",
        group.nbArticles,
        group.quantiteTotale,
        formatDate(group.dateRecente),
        group.statut,
        group.datePrevueReception ? formatDate(group.datePrevueReception) : "-",
      ]);
      row.eachCell((cell) => {
        cell.border = ALL_BORDERS;
        cell.alignment = { vertical: "middle" };
      });
    }

    sheet.columns.forEach((col) => {
      let maxLength = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        maxLength = Math.max(maxLength, String(cell.value ?? "").length + 2);
      });
      col.width = Math.min(maxLength, 40);
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headerLabels.length } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `import-mp-${todayIso}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="no-print inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4">
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
