import * as XLSX from "xlsx";

export type ColonneExport = { label: string; key: string };
export type LigneExport = Record<string, string | number | null | undefined>;
export type FeuilleExport = { name: string; rows: LigneExport[] };

// Une feuille Excel : titres, largeur de chaque colonne ajustee au plus long contenu (titre ou valeur) pour ne pas avoir a la
// redimensionner a la main, et filtre Excel (fleches de tri/filtre) sur toute la ligne de titres.
function construireFeuille(rows: LigneExport[], columns: ColonneExport[]): XLSX.WorkSheet {
  const data = rows.map((row) => Object.fromEntries(columns.map((column) => [column.label, row[column.key] ?? ""])));
  const worksheet = XLSX.utils.json_to_sheet(data, { header: columns.map((column) => column.label) });

  worksheet["!cols"] = columns.map((column) => {
    const longest = rows.reduce((max, row) => {
      const text = row[column.key];
      const length = text === null || text === undefined ? 0 : String(text).length;
      return Math.max(max, length);
    }, column.label.length);
    return { wch: Math.min(Math.max(longest + 2, 10), 60) };
  });

  const lastCol = XLSX.utils.encode_col(columns.length - 1);
  worksheet["!autofilter"] = { ref: `A1:${lastCol}${rows.length + 1}` };
  return worksheet;
}

// Classeur Excel : une feuille par element de "feuilles" (memes colonnes partout), meme si une feuille est vide (titres seuls).
export function construireClasseur(columns: ColonneExport[], feuilles: FeuilleExport[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  for (const feuille of feuilles) {
    XLSX.utils.book_append_sheet(workbook, construireFeuille(feuille.rows, columns), feuille.name);
  }
  return workbook;
}
