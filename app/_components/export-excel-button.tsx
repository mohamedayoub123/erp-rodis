"use client";

import * as XLSX from "xlsx";

type ExportColumn = { label: string; key: string };
type ExportRow = Record<string, string | number | null | undefined>;

export function ExportExcelButton({
  rows,
  columns,
  filename,
}: {
  rows: ExportRow[];
  columns: ExportColumn[];
  filename: string;
}) {
  function handleExport() {
    const data = rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column.label, row[column.key] ?? ""]))
    );
    const worksheet = XLSX.utils.json_to_sheet(data, { header: columns.map((column) => column.label) });

    // Largeur de chaque colonne ajustee au plus long contenu (titre ou
    // valeur), pour ne pas avoir a redimensionner a la main a l'ouverture.
    worksheet["!cols"] = columns.map((column) => {
      const longest = rows.reduce((max, row) => {
        const text = row[column.key];
        const length = text === null || text === undefined ? 0 : String(text).length;
        return Math.max(max, length);
      }, column.label.length);
      return { wch: Math.min(Math.max(longest + 2, 10), 60) };
    });

    // Filtre sur toutes les colonnes (fleches de tri/filtre Excel sur la
    // ligne de titres).
    const lastCol = XLSX.utils.encode_col(columns.length - 1);
    worksheet["!autofilter"] = { ref: `A1:${lastCol}${rows.length + 1}` };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
    XLSX.writeFile(workbook, filename);
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
