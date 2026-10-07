"use client";

import ExcelJS from "exceljs";

// Meme approche que les autres exports du projet (Statistique MP, Capacite
// Conditionnement) : exceljs cote client, a partir de donnees deja
// calculees cote serveur et passees en props - reutilise pour le tableau
// par gamme ET pour "Article manquant", qui partagent la meme forme
// (Article, une colonne par commande, Total/Stock/Reste/Qt en cours).
//
// Les COULEURS reprennent celles de l'ecran (page.tsx) cellule par cellule :
// turquoise des en-tetes, couleur de chaque commande selon son statut
// (EN COURS jaune, STAND orange, BL TRANSFORME vert), bandeaux de sous-gamme
// avec leur couleur, article en manque en jaune clair, "Reste apres
// Conditionnement" rouge/vert, bordures sombres des en-tetes et des totaux.

export type ExportCommandColumn = {
  key: string;
  client: string;
  nombreCamion: number | null;
  numeroProforma: string;
  dateEcriture: string | null;
  // Libelle affiche ("EN COURS", "STAND", "BL TRANSFORME") et valeur brute (pour choisir la couleur).
  statut: string;
  statutCode: string;
  // Note libre de la commande (ligne "Note" de l'en-tete).
  note: string;
  // Mode de chargement (ligne "tC") : seulement renseigne pour les feuilles de familles - la vue "Article
  // manquant" de l'ecran n'a pas cette ligne, donc undefined = pas de ligne tC.
  modeChargement?: string;
};

export type ExportDataRow =
  // bannerClass : classes de couleur de l'ecran d'un bandeau de sous-gamme (ex: "bg-[#1a56db] text-white") ;
  // absent = bandeau de famille (turquoise).
  | { kind: "banner"; label: string; bannerClass?: string }
  | {
      kind: "article";
      article: string;
      quantitiesByColumn: Record<string, number>;
      total: number;
      stock: number;
      reste: number;
      qtEnCours: number;
      resteApresConditionnement: number;
    };

const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
const DARK_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF334155" } };
// Cellules de ligne (article, quantites) : bordure claire ; en-tetes et colonnes de totaux : bordure sombre.
const LINE_BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};
const HEADER_BORDERS: Partial<ExcelJS.Borders> = {
  top: DARK_BORDER,
  bottom: DARK_BORDER,
  left: DARK_BORDER,
  right: DARK_BORDER,
};

const TURQUOISE = "FF1F9DA5";
const MANQUE_YELLOW = "FFFFF59D";
const BL_TRANSFORME_GREEN = "FF62FF1B";
const BL_TRANSFORME_TEXT = "FF0D6B0D";
const STAND_YELLOW = "FFFFE01B";
const TEXT_DARK = "FF020617";
const TEXT_WHITE = "FFFFFFFF";
const TEXT_MANQUE_RED = "FFB91C1C";
const RESTE_NEGATIF_RED = "FFDC2626";
const RESTE_POSITIF_GREEN = "FF059669";

// Couleur d'une commande selon son statut - memes valeurs que getStatusCellClass (page.tsx).
function statutFill(statutCode: string): string {
  const status = String(statutCode || "").toUpperCase();
  if (status === "STAND") return "FFF59E0B";
  if (status === "BL_TRANSFORME") return "FF16A34A";
  return "FFFFF200";
}

const TEXTE_PAR_CLASSE: Record<string, string> = {
  "text-white": TEXT_WHITE,
  "text-slate-950": TEXT_DARK,
  "text-slate-900": "FF0F172A",
  "text-slate-700": "FF334155",
};

// "bg-[#1a56db] text-white" (classes de l'ecran) -> couleurs Excel.
function couleursDepuisClasse(classe: string): { fond: string; texte: string } {
  const fond = classe.match(/bg-\[#([0-9a-fA-F]{6})\]/);
  const texteHex = classe.match(/text-\[#([0-9a-fA-F]{6})\]/);
  const jeton = classe.split(/\s+/).find((nom) => nom in TEXTE_PAR_CLASSE);
  return {
    fond: fond ? `FF${fond[1].toUpperCase()}` : TURQUOISE,
    texte: texteHex ? `FF${texteHex[1].toUpperCase()}` : jeton ? TEXTE_PAR_CLASSE[jeton] : TEXT_DARK,
  };
}

function formatDateFr(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

// Ajoute une feuille (un tableau de famille) a un classeur Excel. Utilise par
// l'export d'une famille ET par l'export de toutes les familles dans un seul
// fichier (une feuille par famille + la feuille Article manquant) - sheetName =
// nom d'onglet (31 caracteres max), title = titre ecrit en haut de la feuille.
export function addTableauSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  commandColumns: ExportCommandColumn[],
  rows: ExportDataRow[],
  sheetName?: string
) {
  const sheet = workbook.addWorksheet(sheetName || title.slice(0, 31) || "Export");

  const headerLabels = [
    "Article",
    ...commandColumns.map((col) => col.numeroProforma || col.client || col.key),
    "Total",
    "Stock",
    "Reste",
    "Qt en cours de Conditionnement",
    "Reste apres Conditionnement",
  ];
  const totalCols = headerLabels.length;
  const firstCommandCol = 2;
  const lastCommandCol = 1 + commandColumns.length;

  function bannerRow(label: string) {
    const row = sheet.addRow([label]);
    sheet.mergeCells(row.number, 1, row.number, totalCols);
    const cell = row.getCell(1);
    cell.font = { bold: true, color: { argb: TEXT_DARK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TURQUOISE } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    row.height = 20;
  }

  // Bandeau de sous-gamme : couleur de l'ecran, centre, gras italique en majuscules.
  function subGammeBannerRow(label: string, bannerClass: string) {
    const { fond, texte } = couleursDepuisClasse(bannerClass);
    const row = sheet.addRow([label.toUpperCase()]);
    sheet.mergeCells(row.number, 1, row.number, totalCols);
    const cell = row.getCell(1);
    cell.font = { bold: true, italic: true, color: { argb: texte } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fond } };
    cell.border = HEADER_BORDERS;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    row.height = 20;
  }

  bannerRow(title);

  // Meme ordre d'en-tete que l'ecran : Note, Statut, Client, Nombre de camion, tC (feuilles de familles
  // seulement), Proforma, Date commande.
  const noteRow = sheet.addRow(["Note", ...commandColumns.map((col) => col.note || ""), "", "", "", "", ""]);
  const statutRow = sheet.addRow(["Statut", ...commandColumns.map((col) => col.statut), "", "", "", "", ""]);
  const clientRow = sheet.addRow(["Client", ...commandColumns.map((col) => col.client || "-"), "", "", "", "", ""]);
  const camionRow = sheet.addRow([
    "Nombre de camion",
    ...commandColumns.map((col) => (col.nombreCamion === null ? "-" : col.nombreCamion)),
    "",
    "",
    "",
    "",
    "",
  ]);
  const avecTc = commandColumns.some((col) => col.modeChargement !== undefined);
  const tcRow = avecTc
    ? sheet.addRow(["tC", ...commandColumns.map((col) => col.modeChargement || ""), "", "", "", "", ""])
    : null;
  const proformaRow = sheet.addRow([
    "Proforma #",
    ...commandColumns.map((col) => col.numeroProforma || "-"),
    "TOTAL",
    "STOCK",
    "RESTE",
    "Qt en cours",
    "Reste apres",
  ]);
  const dateRow = sheet.addRow([
    "Date commande",
    ...commandColumns.map((col) => formatDateFr(col.dateEcriture)),
    "",
    "",
    "",
    "",
    "",
  ]);

  // Lignes Statut et Client : chaque commande a la couleur de son statut, comme a l'ecran ; le reste
  // de l'en-tete est turquoise.
  const lignesColoreesParStatut = new Set([statutRow.number, clientRow.number]);
  const lignesEnTete = [noteRow, statutRow, clientRow, camionRow, ...(tcRow ? [tcRow] : []), proformaRow, dateRow];
  for (const row of lignesEnTete) {
    const colonnesParStatut = lignesColoreesParStatut.has(row.number);
    for (let colIndex = 1; colIndex <= totalCols; colIndex++) {
      const cell = row.getCell(colIndex);
      const commande =
        colonnesParStatut && colIndex >= firstCommandCol && colIndex <= lastCommandCol
          ? commandColumns[colIndex - firstCommandCol]
          : null;
      // La note est un texte libre (souvent long) : pas en gras, comme a l'ecran.
      cell.font = { bold: !(row.number === noteRow.number && colIndex > 1), color: { argb: TEXT_DARK } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: commande ? statutFill(commande.statutCode) : TURQUOISE },
      };
      cell.border = HEADER_BORDERS;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
  }

  // Titre + lignes d'en-tete restent visibles en faisant defiler les articles.
  sheet.views = [{ state: "frozen", ySplit: 1 + lignesEnTete.length }];

  const colWidths = headerLabels.map((label) => Math.max(String(label).length + 2, 10));
  colWidths[0] = Math.max(colWidths[0], 32);

  function trackWidth(colIndex: number, text: string) {
    colWidths[colIndex - 1] = Math.min(Math.max(colWidths[colIndex - 1], text.length + 2), 40);
  }

  for (const row of rows) {
    if (row.kind === "banner") {
      if (row.bannerClass) subGammeBannerRow(row.label, row.bannerClass);
      else bannerRow(row.label);
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
      row.resteApresConditionnement,
    ];

    const excelRow = sheet.addRow(values);
    excelRow.eachCell({ includeEmpty: true }, (cell, colIndex) => {
      const isArticleCol = colIndex === 1;
      const isResteApresCol = colIndex === totalCols;
      const isSummaryCol = colIndex > totalCols - 5;

      cell.border = isArticleCol ? LINE_BORDERS : isSummaryCol ? HEADER_BORDERS : LINE_BORDERS;
      cell.alignment = { horizontal: isArticleCol ? "left" : "center", vertical: "middle", wrapText: true };

      const fill = isResteApresCol
        ? row.resteApresConditionnement < 0
          ? RESTE_NEGATIF_RED
          : RESTE_POSITIF_GREEN
        : isArticleCol
          ? articleFill
          : isSummaryCol
            ? summaryFill
            : lineFill;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };

      if (isResteApresCol) {
        cell.font = { color: { argb: TEXT_WHITE }, bold: true };
      } else if (isArticleCol) {
        cell.font = {
          color: { argb: !isManque && !isStand && isBlTransforme ? BL_TRANSFORME_TEXT : TEXT_DARK },
          bold: true,
        };
      } else if (isManque && isSummaryCol) {
        cell.font = { color: { argb: TEXT_MANQUE_RED }, bold: true };
      } else {
        cell.font = { color: { argb: TEXT_DARK } };
      }
      trackWidth(colIndex, String(cell.value ?? ""));
    });
  }

  sheet.columns.forEach((col, index) => {
    col.width = colWidths[index] || 12;
  });
}

export async function downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string) {
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
    addTableauSheet(workbook, title, commandColumns, rows);
    await downloadWorkbook(workbook, fileName);
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
