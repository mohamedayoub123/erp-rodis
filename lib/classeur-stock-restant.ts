import ExcelJS from "exceljs";
import { texteFiltrePd, type FiltrePdExport } from "@/lib/programme-en-cours-par-pd";

// Export Excel de la page "Stock restant par type de produit fini" (/tableau-commandes/stock-restant) : le classeur reprend la forme de l'ecran -
// titre et sous-titre, les 3 cartes de totaux, puis le tableau a 3 colonnes (Article, Stock, Stock restant) avec les MEMES couleurs (stock vert ou rouge
// s'il est negatif, stock restant vert ou rouge quand il manque, ligne Total en bas), dans l'ordre affiche a l'ecran (tri choisi).
// Charge a la demande par le bouton d'export (exceljs est une bibliotheque lourde).

export type LigneExportStockRestant = {
  nom: string;
  stock: number;
  // stock + programme en cours - commande
  apres: number;
};

export type DonneesStockRestant = {
  titre: string;
  lignes: LigneExportStockRestant[];
  totaux: { stock: number; apres: number; enManque: number };
  // PD choisis dans le filtre "Programme en cours" quand il en manque (null = tous les PD)
  filtrePd?: FiltrePdExport | null;
};

// Couleurs de l'ecran (classes Tailwind du tableau), en ARGB
const BLANC = "FFFFFFFF";
const GRIS_CLAIR = "FFF8FAFC"; // slate-50
const TEXTE = "FF0F172A"; // slate-900
const BORDURE_LIGNE = "FFCBD5E1"; // slate-300
const ARDOISE = "FF1E293B"; // slate-800
const EMERAUDE_CLAIR = "FFECFDF5"; // emerald-50
const EMERAUDE_FOND = "FFD1FAE5"; // emerald-100
const EMERAUDE_FONCE = "FFA7F3D0"; // emerald-200
const EMERAUDE_TEXTE = "FF065F46"; // emerald-800
const EMERAUDE_TITRE = "FF064E3B"; // emerald-900
const TURQUOISE = "FF0D9488"; // teal-600
const TURQUOISE_PALE = "FFCCFBF1"; // teal-100
const ROUGE = "FFDC2626"; // red-600
const ROUGE_FOND = "FFFEE2E2"; // red-100
const ROUGE_CLAIR = "FFFEF2F2"; // red-50
const ROUGE_TEXTE = "FFB91C1C"; // red-700

const rempli = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function cadre(argb: string): Partial<ExcelJS.Borders> {
  const bord: Partial<ExcelJS.Border> = { style: "thin", color: { argb } };
  return { top: bord, left: bord, bottom: bord, right: bord };
}

const formatNombre = (valeur: number) => (Number.isInteger(valeur) ? "#,##0" : "#,##0.00");
const texteNombre = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

// Nombre de lignes qu'un texte occupe dans une colonne de "largeur" caracteres
const nombreDeLignes = (texte: string, largeur: number) => Math.max(1, Math.ceil(texte.length / Math.max(1, largeur)));

// Nom de l'onglet : 31 caracteres au plus, sans les caracteres interdits par Excel
function nomOnglet(titre: string): string {
  const propre = titre.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  return propre || "Stock restant";
}

export function construireClasseurStockRestant(donnees: DonneesStockRestant): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(nomOnglet(donnees.titre));
  const { lignes, totaux } = donnees;

  sheet.getColumn(1).width = 46;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 24;

  function ligneFusionnee(valeur: string, hauteur: number, police: Partial<ExcelJS.Font>) {
    const ligne = sheet.addRow([valeur]);
    sheet.mergeCells(ligne.number, 1, ligne.number, 3);
    const cellule = ligne.getCell(1);
    cellule.font = police;
    cellule.alignment = { vertical: "middle", horizontal: "left" };
    ligne.height = hauteur;
  }
  const espace = (hauteur: number) => {
    sheet.addRow([]).height = hauteur;
  };

  // ----- Titre et sous-titre (comme l'ecran) -----
  ligneFusionnee("Stock restant par type de produit fini - " + donnees.titre, 26, { bold: true, size: 16, color: { argb: TEXTE } });
  ligneFusionnee(
    `${lignes.length} articles commandes - ${totaux.enManque} en manque apres commande et programme en cours` +
      (donnees.filtrePd ? ` (${texteFiltrePd(donnees.filtrePd)})` : ""),
    18,
    { size: 11, color: { argb: "FF64748B" } }
  );
  espace(6);

  // ----- Les 3 cartes de totaux, une au dessus de chaque colonne -----
  const manque = totaux.enManque > 0;
  const cartes: { titre: string; valeur: string; detail: string; accent: string; fond: string; texte: string }[] = [
    { titre: "Articles commandes", valeur: String(lignes.length), detail: `${totaux.enManque} en manque`, accent: manque ? "FFEF4444" : "FF64748B", fond: manque ? ROUGE_CLAIR : GRIS_CLAIR, texte: manque ? "FF991B1B" : TEXTE },
    { titre: "Stock", valeur: texteNombre(totaux.stock), detail: "cartons", accent: "FF10B981", fond: EMERAUDE_CLAIR, texte: EMERAUDE_TITRE },
    {
      titre: "Stock restant",
      valeur: texteNombre(totaux.apres),
      detail: "cartons",
      accent: totaux.apres < 0 ? "FFEF4444" : "FF14B8A6",
      fond: totaux.apres < 0 ? ROUGE_CLAIR : "FFF0FDFA",
      texte: totaux.apres < 0 ? "FF991B1B" : "FF134E4A",
    },
  ];
  const ligneCartes = sheet.addRow([]);
  ligneCartes.height = 64;
  cartes.forEach((carte, index) => {
    const cellule = ligneCartes.getCell(1 + index);
    cellule.value = {
      richText: [
        { text: carte.titre.toUpperCase() + "\n", font: { bold: true, size: 8, color: { argb: carte.texte } } },
        { text: carte.valeur + "\n", font: { bold: true, size: 16, color: { argb: carte.texte } } },
        { text: carte.detail, font: { size: 9, color: { argb: carte.texte } } },
      ],
    };
    cellule.fill = rempli(carte.fond);
    cellule.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    const fin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFE2E8F0" } };
    cellule.border = { top: fin, bottom: fin, right: fin, left: { style: "thick", color: { argb: carte.accent } } };
  });
  espace(8);

  // ----- En-tete du tableau -----
  const entete = sheet.addRow([]);
  entete.height = 44;
  const styleEntete = (colonne: number, valeur: string | ExcelJS.CellRichTextValue, fond: string, texte: string, bordure: string, gauche = false) => {
    const cellule = entete.getCell(colonne);
    cellule.value = valeur;
    cellule.fill = rempli(fond);
    cellule.font = { bold: true, size: 11, color: { argb: texte } };
    cellule.alignment = { vertical: "middle", horizontal: gauche ? "left" : "center", wrapText: true, indent: gauche ? 1 : 0 };
    cellule.border = cadre(bordure);
  };
  styleEntete(1, "Article", ARDOISE, BLANC, ARDOISE, true);
  styleEntete(2, "Stock", EMERAUDE_FOND, EMERAUDE_TITRE, BORDURE_LIGNE);
  styleEntete(
    3,
    {
      richText: [
        { text: "Stock restant\n", font: { bold: true, size: 11, color: { argb: BLANC } } },
        { text: "apres commande et programme en cours", font: { size: 8, color: { argb: TURQUOISE_PALE } } },
      ],
    },
    TURQUOISE,
    BLANC,
    BORDURE_LIGNE
  );

  // Le titre, les cartes et l'en-tete restent visibles quand on fait defiler (comme l'ecran)
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: entete.number, showGridLines: false }];

  // ----- Les articles -----
  lignes.forEach((ligne, index) => {
    const fond = index % 2 === 0 ? BLANC : GRIS_CLAIR;
    const row = sheet.addRow([]);
    row.height = Math.max(24, nombreDeLignes(ligne.nom, 40) * 16 + 8);

    const article = row.getCell(1);
    article.value = ligne.nom;
    article.fill = rempli(fond);
    article.font = { bold: true, size: 11, color: { argb: TEXTE } };
    article.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    article.border = cadre(BORDURE_LIGNE);

    const resumer = (colonne: number, valeur: number, fondCellule: string, texte: string, taille: number) => {
      const cellule = row.getCell(colonne);
      cellule.value = valeur;
      cellule.numFmt = formatNombre(valeur);
      cellule.fill = rempli(fondCellule);
      cellule.font = { bold: true, size: taille, color: { argb: texte } };
      cellule.alignment = { vertical: "middle", horizontal: "center" };
      cellule.border = cadre(BORDURE_LIGNE);
    };
    resumer(2, ligne.stock, ligne.stock < 0 ? ROUGE_CLAIR : EMERAUDE_CLAIR, ligne.stock < 0 ? ROUGE_TEXTE : EMERAUDE_TEXTE, 11);
    resumer(3, ligne.apres, ligne.apres < 0 ? ROUGE_FOND : EMERAUDE_FOND, ligne.apres < 0 ? ROUGE_TEXTE : EMERAUDE_TEXTE, 12);
  });

  // ----- Ligne Total -----
  const total = sheet.addRow([]);
  total.height = 26;
  const celluleTotal = (colonne: number, valeur: string | number, fond: string, texte: string, bordure: string, gauche = false) => {
    const cellule = total.getCell(colonne);
    cellule.value = valeur;
    if (typeof valeur === "number") cellule.numFmt = formatNombre(valeur);
    cellule.fill = rempli(fond);
    cellule.font = { bold: true, size: 12, color: { argb: texte } };
    cellule.alignment = { vertical: "middle", horizontal: gauche ? "left" : "center", indent: gauche ? 1 : 0 };
    cellule.border = cadre(bordure);
  };
  celluleTotal(1, "Total", ARDOISE, BLANC, ARDOISE, true);
  celluleTotal(2, totaux.stock, EMERAUDE_FONCE, EMERAUDE_TITRE, BORDURE_LIGNE);
  celluleTotal(3, totaux.apres, totaux.apres < 0 ? ROUGE : TURQUOISE, BLANC, BORDURE_LIGNE);

  // Impression : portrait, tout le tableau sur la largeur d'une page, l'en-tete repete sur chaque page
  sheet.pageSetup = {
    orientation: "portrait",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: `${entete.number}:${entete.number}`,
  };

  return workbook;
}

export async function telechargerClasseurStockRestant(donnees: DonneesStockRestant, nomFichier: string) {
  const workbook = construireClasseurStockRestant(donnees);
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
