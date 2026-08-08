"use client";

type ExportColumn = { label: string; key: string };
type ExportRow = Record<string, string | number | null | undefined>;

// Genere un CSV compatible Excel FR (separateur ";" car "," sert de
// separateur decimal en France, BOM UTF-8 pour que les accents s'affichent
// bien) - Excel l'ouvre directement au double-clic, sans dependance
// externe a installer.
function buildCsv(rows: ExportRow[], columns: ExportColumn[]) {
  function formatCell(value: string | number | null | undefined) {
    const text = value === null || value === undefined ? "" : String(value);
    const escaped = text.replace(/"/g, '""');
    return /[;"\n]/.test(text) ? `"${escaped}"` : escaped;
  }

  const header = columns.map((column) => formatCell(column.label)).join(";");
  const lines = rows.map((row) => columns.map((column) => formatCell(row[column.key])).join(";"));
  return [header, ...lines].join("\r\n");
}

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
    const csv = buildCsv(rows, columns);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
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
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M4 19h16" />
      </svg>
    </button>
  );
}
