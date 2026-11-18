import ExcelJS from "exceljs";

// Export Excel de la page "Stock dormant sans commande" (/stock-dormant-sans-commande) : le classeur reprend l'ecran - titre, rappel des seuils d'age, puis le
// tableau avec les MEMES colonnes dans le meme ordre (Couleur, Article, Gamme, Type, Marque, Lot, Qt restante, Date fab., Age en jours) et la couleur
// JAUNE / ORANGE / ROUGE de chaque lot sur sa cellule Couleur, comme le badge de l'ecran. Il exporte ce que l'ecran affiche : les memes filtres
// (article, gamme, type, couleur), toutes les pages. Charge a la demande par le bouton d'export (exceljs est une bibliotheque lourde).

export type LigneExportDormant = {
  couleur: string | null;
  article: string;
  gamme: string | null;
  type: string | null;
  marque: string | null;
  lot: string;
  qt: number;
  // "aaaa-mm-jj" (date de fabrication du lot)
  dateFab: string;
  ageJours: number;
};

export type DonneesDormant = {
  titre: string;
  // ex : "Type : clarifiant - Couleur : ROUGE" (vide = aucun filtre)
  filtres: string;
  lignes: LigneExportDormant[];
};

const BLANC = "FFFFFFFF";
const GRIS_CLAIR = "FFF8FAFC"; // slate-50
const TEXTE = "FF0F172A"; // slate-900
const GRIS_TEXTE = "FF64748B"; // slate-500
const BORDURE = "FFCBD5E1"; // slate-300
const ARDOISE = "FF1E293B"; // slate-800
const AMBRE_TEXTE = "FFB45309"; // amber-700 (Qt restante, comme l'ecran)

// Badge de l'ecran : fond clair + texte fonce de la couleur du lot
const COULEURS: Record<string, { fond: string; texte: string }> = {
  ROUGE: { fond: "FFFECACA", texte: "FF7F1D1D" }, // red-200 / red-900
  ORANGE: { fond: "FFFED7AA", texte: "FF7C2D12" }, // orange-200 / orange-900
  JAUNE: { fond: "FFFDE68A", texte: "FF78350F" }, // amber-200 / amber-900
};

const rempli = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function cadre(argb: string): Partial<ExcelJS.Borders> {
  const bord: Partial<ExcelJS.Border> = { style: "thin", color: { argb } };
  return { top: bord, left: bord, bottom: bord, right: bord };
}

const formatNombre = (valeur: number) => (Number.isInteger(valeur) ? "#,##0" : "#,##0.00");
const texteNombre = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

// "aaaa-mm-jj" -> vraie date Excel (triable) ; autre format -> le texte tel quel
function dateExcel(valeur: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : valeur;
}

const COLONNES: { titre: string; largeur: number }[] = [
  { titre: "Couleur", largeur: 14 },
  { titre: "Article", largeur: 46 },
  { titre: "Gamme", largeur: 20 },
  { titre: "Type", largeur: 16 },
  { titre: "Marque", largeur: 18 },
  { titre: "Lot", largeur: 18 },
  { titre: "Qt restante", largeur: 14 },
  { titre: "Date fab.", largeur: 14 },
  { titre: "Age (jours)", largeur: 13 },
];

export function construireClasseurDormant(donnees: DonneesDormant): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dormant sans commande");
  const { lignes } = donnees;
  const nbColonnes = COLONNES.length;
  COLONNES.forEach((colonne, index) => {
    sheet.getColumn(index + 1).width = colonne.largeur;
  });

  function ligneFusionnee(valeur: string, hauteur: number, police: Partial<ExcelJS.Font>) {
    const ligne = sheet.addRow([valeur]);
    sheet.mergeCells(ligne.number, 1, ligne.number, nbColonnes);
    const cellule = ligne.getCell(1);
    cellule.font = police;
    cellule.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    ligne.height = hauteur;
  }

  // ----- Titre, sous-titre, filtres et rappel des seuils (comme l'ecran) -----
  const totalQt = lignes.reduce((somme, ligne) => somme + ligne.qt, 0);
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  ligneFusionnee(donnees.titre, 26, { bold: true, size: 16, color: { argb: TEXTE } });
  ligneFusionnee(`${lignes.length} lot(s) dormant(s) sans commande - quantite restante totale ${texteNombre(totalQt)} - au ${aujourdhui}`, 18, {
    size: 11,
    color: { argb: GRIS_TEXTE },
  });
  if (donnees.filtres) ligneFusionnee(`Filtres : ${donnees.filtres}`, 18, { size: 11, bold: true, color: { argb: "FF92400E" } });
  ligneFusionnee(
    "Age depuis la date de fabrication - seuils JAUNE / ORANGE / ROUGE : clarifiant 2 / 4 / 6 mois, hydratant 4 / 6 / 9 mois, autres types 6 / 9 / 12 mois",
    18,
    { italic: true, size: 10, color: { argb: GRIS_TEXTE } }
  );
  sheet.addRow([]).height = 6;

  // ----- En-tete du tableau -----
  const entete = sheet.addRow(COLONNES.map((colonne) => colonne.titre));
  entete.height = 26;
  entete.eachCell((cellule, numero) => {
    cellule.fill = rempli(ARDOISE);
    cellule.font = { bold: true, size: 11, color: { argb: BLANC } };
    cellule.alignment = { vertical: "middle", horizontal: numero === 2 ? "left" : "center", indent: numero === 2 ? 1 : 0 };
    cellule.border = cadre(ARDOISE);
  });

  // ----- Les lots, dans l'ordre de l'ecran (le plus dormant d'abord) -----
  lignes.forEach((ligne, index) => {
    const fond = index % 2 === 0 ? BLANC : GRIS_CLAIR;
    const row = sheet.addRow([]);
    row.height = 22;
    const ecrire = (colonne: number, valeur: string | number | Date, options?: { gras?: boolean; texte?: string; gauche?: boolean; fond?: string; format?: string }) => {
      const cellule = row.getCell(colonne);
      cellule.value = valeur;
      cellule.fill = rempli(options?.fond ?? fond);
      cellule.font = { bold: options?.gras ?? false, size: 11, color: { argb: options?.texte ?? TEXTE } };
      cellule.alignment = { vertical: "middle", horizontal: options?.gauche ? "left" : "center", indent: options?.gauche ? 1 : 0, wrapText: colonne === 2 };
      cellule.border = cadre(BORDURE);
      if (options?.format) cellule.numFmt = options.format;
    };
    const couleur = ligne.couleur ? COULEURS[ligne.couleur] : undefined;
    ecrire(1, ligne.couleur || "-", { gras: true, fond: couleur?.fond, texte: couleur?.texte });
    ecrire(2, ligne.article, { gras: true, gauche: true });
    ecrire(3, ligne.gamme || "-");
    ecrire(4, ligne.type || "-");
    ecrire(5, ligne.marque || "-");
    ecrire(6, ligne.lot);
    ecrire(7, ligne.qt, { gras: true, texte: AMBRE_TEXTE, format: formatNombre(ligne.qt) });
    ecrire(8, dateExcel(ligne.dateFab), { format: "dd-mm-yyyy" });
    ecrire(9, ligne.ageJours, { format: "#,##0" });
  });

  // ----- Ligne Total -----
  const total = sheet.addRow([]);
  total.height = 26;
  const celluleTotal = (colonne: number, valeur: string | number, format?: string) => {
    const cellule = total.getCell(colonne);
    cellule.value = valeur;
    if (format) cellule.numFmt = format;
    cellule.fill = rempli(ARDOISE);
    cellule.font = { bold: true, size: 12, color: { argb: BLANC } };
    cellule.alignment = { vertical: "middle", horizontal: colonne === 2 ? "left" : "center", indent: colonne === 2 ? 1 : 0 };
    cellule.border = cadre(ARDOISE);
  };
  for (let colonne = 1; colonne <= nbColonnes; colonne++) celluleTotal(colonne, "");
  celluleTotal(1, "Total");
  celluleTotal(2, `${lignes.length} lot(s)`);
  celluleTotal(7, totalQt, formatNombre(totalQt));

  // En-tete fige, filtre automatique sur le tableau, impression en paysage sur la largeur d'une page avec l'en-tete repete
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: entete.number, showGridLines: false }];
  if (lignes.length > 0) sheet.autoFilter = { from: { row: entete.number, column: 1 }, to: { row: entete.number + lignes.length, column: nbColonnes } };
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    printTitlesRow: `${entete.number}:${entete.number}`,
  };

  return workbook;
}

export async function telechargerClasseurDormant(donnees: DonneesDormant, nomFichier: string) {
  const workbook = construireClasseurDormant(donnees);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
}
