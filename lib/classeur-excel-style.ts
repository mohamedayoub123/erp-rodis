import ExcelJS from "exceljs";
import type { ColonneExport, FeuilleExport } from "@/lib/classeur-excel";

// Classeur Excel MISE EN FORME, une feuille par element de "feuilles" (memes colonnes partout) : cadres (bordures) sur toutes les
// cellules, titres en gras sur fond gris, texte a la ligne dans chaque cellule - un texte sur plusieurs lignes ("A\nB\nC") s'affiche
// donc ligne par ligne, les unes sous les autres, et non colle - et hauteur de ligne ajustee au nombre de lignes. Utilise exceljs
// (l'edition gratuite de xlsx n'ecrit aucun style dans le fichier). Charge a la demande par ExportExcelButton (bibliotheque lourde).

const BORDURE: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF64748B" } };
const BORDURES: Partial<ExcelJS.Borders> = { top: BORDURE, left: BORDURE, bottom: BORDURE, right: BORDURE };
const HAUTEUR_LIGNE = 15;
const LARGEUR_MIN = 10;
const LARGEUR_MAX = 60;

function texteCellule(valeur: string | number | null | undefined): string {
  return valeur === null || valeur === undefined ? "" : String(valeur);
}

// Nombre de lignes qu'occupe un texte dans une colonne de "largeur" caracteres : chaque ligne du texte, coupee si elle depasse
export function nombreDeLignes(texte: string, largeur: number): number {
  const utile = Math.max(1, largeur - 1);
  return texte.split("\n").reduce((somme, ligne) => somme + Math.max(1, Math.ceil(ligne.length / utile)), 0);
}

export function construireClasseurStyle(columns: ColonneExport[], feuilles: FeuilleExport[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  for (const feuille of feuilles) {
    const sheet = workbook.addWorksheet(feuille.name.slice(0, 31) || "Export", { views: [{ state: "frozen", ySplit: 1 }] });

    // Largeur de chaque colonne : la ligne la plus longue (titre ou une ligne d'une valeur), jamais la somme des lignes empilees
    const largeurs = columns.map((colonne) => {
      const plusLongue = feuille.rows.reduce((max, row) => {
        const lignes = texteCellule(row[colonne.key]).split("\n");
        return Math.max(max, ...lignes.map((ligne) => ligne.length));
      }, colonne.label.length);
      return Math.min(Math.max(plusLongue + 2, LARGEUR_MIN), LARGEUR_MAX);
    });
    largeurs.forEach((largeur, index) => {
      sheet.getColumn(index + 1).width = largeur;
    });

    const entete = sheet.addRow(columns.map((colonne) => colonne.label));
    entete.height = 32;
    entete.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = BORDURES;
    });

    for (const row of feuille.rows) {
      const valeurs = columns.map((colonne) => row[colonne.key] ?? "");
      const ligne = sheet.addRow(valeurs);
      let lignesMax = 1;
      columns.forEach((colonne, index) => {
        const cell = ligne.getCell(index + 1);
        cell.border = BORDURES;
        cell.alignment = { vertical: "top", wrapText: true };
        lignesMax = Math.max(lignesMax, nombreDeLignes(texteCellule(row[colonne.key]), largeurs[index]));
      });
      if (lignesMax > 1) ligne.height = lignesMax * HAUTEUR_LIGNE;
    }

    // Filtre Excel sur la ligne de titres
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  return workbook;
}

export async function telechargerClasseurStyle(columns: ColonneExport[], feuilles: FeuilleExport[], filename: string) {
  const workbook = construireClasseurStyle(columns, feuilles);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = filename;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
}
