"use client";

import * as XLSX from "xlsx";
import { construireClasseur, type ColonneExport, type FeuilleExport, type LigneExport } from "@/lib/classeur-excel";

export function ExportExcelButton({
  rows,
  columns,
  filename,
  sheets,
}: {
  rows: LigneExport[];
  columns: ColonneExport[];
  filename: string;
  // Plusieurs feuilles (ex : une par type de machine) ; sans cela, une seule feuille "Export" avec "rows"
  sheets?: FeuilleExport[];
}) {
  async function handleExport() {
    if (sheets) {
      // Plusieurs feuilles : classeur mis en forme (cadres, texte a la ligne), bibliotheque chargee seulement a ce moment
      const { telechargerClasseurStyle } = await import("@/lib/classeur-excel-style");
      await telechargerClasseurStyle(columns, sheets, filename);
      return;
    }
    XLSX.writeFile(construireClasseur(columns, [{ name: "Export", rows }]), filename);
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
