import ExcelJS from "exceljs";
import { nombreDeLignes } from "@/lib/classeur-excel-style";
import type { DetailExport } from "@/lib/classeur-manque-articles";
import { COULEURS_EXCEL, type CelluleAlerte, type DonneesAlerte } from "@/lib/stock-alert-excel-donnees";

// Export Excel des pages STOCK ALERT (Stock Alert MP et Stock Alert MP par commande) : meme mise en forme que l'ecran de l'ERP.
//  - chaque LIGNE a la couleur de la ligne a l'ecran (jaune / vert / orange pour Stock Alert MP ; rouge clair / jaune clair pour Stock Alert par
//    commande), et les chiffres gardent leur couleur : stock en rouge, consommations en bleu, entrees en vert, manque en rouge...
//  - le code d'un BC et le dossier d'un import sont en BLEU, gras, soulignes (comme les liens de l'ERP), le reste de la ligne en gris, un BC /
//    un import par ligne de la cellule ;
//  - tout commence en HAUT et a GAUCHE de chaque cellule, et le texte passe a la ligne dans la cellule (la hauteur de la ligne suit) ;
//  - une BORDURE sur toutes les cellules, des titres de colonnes EN GRAS et plus grands, un FILTRE EXCEL sur chaque colonne, un en-tete fige
//    et repete a l'impression, une LEGENDE des couleurs sous le titre.
// Charge a la demande par le bouton d'export (exceljs est une bibliotheque lourde).

const TAILLE_TITRE_COLONNE = 13;
const HAUTEUR_LIGNE = 15;
const COEFFICIENT_LARGEUR_UTILE = 0.82;

const rempli = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function cadre(): Partial<ExcelJS.Borders> {
  const bord: Partial<ExcelJS.Border> = { style: "thin", color: { argb: COULEURS_EXCEL.bordure } };
  return { top: bord, left: bord, bottom: bord, right: bord };
}

const formatNombre = (valeur: number) => (Number.isInteger(valeur) ? "#,##0" : "#,##0.00");

function valeurDetails(details: DetailExport[]): { valeur: string | ExcelJS.CellRichTextValue; texte: string } {
  if (details.length === 0) return { valeur: "-", texte: "-" };
  const morceaux: ExcelJS.RichText[] = [];
  details.forEach((detail, index) => {
    morceaux.push({ text: detail.code, font: { bold: true, underline: true, size: 11, color: { argb: COULEURS_EXCEL.lien } } });
    morceaux.push({ text: detail.reste + (index < details.length - 1 ? "\n" : ""), font: { size: 11, color: { argb: COULEURS_EXCEL.gris } } });
  });
  return { valeur: { richText: morceaux }, texte: details.map((detail) => detail.code + detail.reste).join("\n") };
}

export function construireClasseurAlerte(donnees: DonneesAlerte): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(donnees.titre.slice(0, 31) || "Stock Alert");
  const { colonnes } = donnees;
  const nbColonnes = colonnes.length;
  colonnes.forEach((colonne, index) => {
    sheet.getColumn(index + 1).width = colonne.largeur;
  });
  const largeurUtile = (colonne: number) => Math.max(8, Math.floor(colonnes[colonne - 1].largeur * COEFFICIENT_LARGEUR_UTILE));

  function ligneFusionnee(valeur: string, hauteur: number, police: Partial<ExcelJS.Font>) {
    const ligne = sheet.addRow([valeur]);
    sheet.mergeCells(ligne.number, 1, ligne.number, nbColonnes);
    const cellule = ligne.getCell(1);
    cellule.font = police;
    cellule.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    ligne.height = hauteur;
  }

  // ----- Titre, sous-titre, filtres -----
  ligneFusionnee(donnees.titre, 30, { bold: true, size: 18, color: { argb: COULEURS_EXCEL.texte } });
  ligneFusionnee(donnees.sousTitre, 18, { size: 11, color: { argb: COULEURS_EXCEL.grisClair } });
  if (donnees.filtres) ligneFusionnee(`Filtres : ${donnees.filtres}`, 18, { size: 11, bold: true, color: { argb: "FF92400E" } });

  // ----- Legende des couleurs : une barre par couleur, sur les 3 premieres colonnes (ou moins s'il y en a moins) -----
  const largeurLegende = Math.min(3, nbColonnes);
  for (const element of donnees.legende) {
    const ligne = sheet.addRow([element.libelle]);
    if (largeurLegende > 1) sheet.mergeCells(ligne.number, 1, ligne.number, largeurLegende);
    for (let colonne = 1; colonne <= largeurLegende; colonne += 1) {
      const cellule = ligne.getCell(colonne);
      cellule.fill = rempli(element.fond);
      cellule.border = cadre();
    }
    const cellule = ligne.getCell(1);
    cellule.font = { bold: true, size: 11, color: { argb: element.texte } };
    cellule.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    ligne.height = 20;
  }
  sheet.addRow([]).height = 6;

  // ----- En-tete du tableau : le fond clair et le texte fonce des titres de l'ERP, en gras et plus grands, a la ligne quand ils sont longs -----
  const lignesEntete = Math.max(...colonnes.map((colonne) => nombreDeLignes(colonne.titre, Math.floor((colonne.largeur * 11) / TAILLE_TITRE_COLONNE))));
  const entete = sheet.addRow(colonnes.map((colonne) => colonne.titre));
  entete.height = Math.max(30, lignesEntete * 18 + 10);
  entete.eachCell((cellule) => {
    cellule.fill = rempli(COULEURS_EXCEL.enteteFond);
    cellule.font = { bold: true, size: TAILLE_TITRE_COLONNE, color: { argb: COULEURS_EXCEL.enteteTexte } };
    cellule.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    cellule.border = cadre();
  });
  const premiereEntete = entete.number;
  let derniereLigne = entete.number;

  // ----- Les lignes, dans l'ordre de l'ecran -----
  for (const ligne of donnees.lignes) {
    const row = sheet.addRow([]);
    let lignesMax = 1;
    ligne.cellules.forEach((brut, index) => {
      const colonne = index + 1;
      const cellule = row.getCell(colonne);
      const element: CelluleAlerte = brut !== null && typeof brut === "object" ? brut : { valeur: brut };
      // style de la colonne, complete / remplace par celui de la cellule
      const style = { ...(colonnes[index].style ?? {}), ...(element.style ?? {}) };
      cellule.fill = rempli(style.fond ?? ligne.fond ?? COULEURS_EXCEL.blanc);
      cellule.font = { bold: style.gras ?? false, size: 11, color: { argb: style.texte ?? COULEURS_EXCEL.gris } };
      // tout commence en haut et a gauche ; le texte passe a la ligne dans la cellule
      cellule.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cellule.border = cadre();
      if (element.details) {
        const { valeur, texte } = valeurDetails(element.details);
        cellule.value = valeur;
        lignesMax = Math.max(lignesMax, nombreDeLignes(texte, largeurUtile(colonne)));
        return;
      }
      const valeur = element.valeur ?? "-";
      cellule.value = valeur;
      if (typeof valeur === "number") cellule.numFmt = formatNombre(valeur);
      else lignesMax = Math.max(lignesMax, nombreDeLignes(valeur, largeurUtile(colonne)));
    });
    row.height = Math.max(20, lignesMax * HAUTEUR_LIGNE + 5);
    derniereLigne = row.number;
  }

  // En-tete fige, FILTRE EXCEL sur chaque colonne, en-tete repete a l'impression, paysage sur la largeur d'une page
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: premiereEntete, showGridLines: false }];
  if (derniereLigne > premiereEntete) {
    sheet.autoFilter = { from: { row: premiereEntete, column: 1 }, to: { row: derniereLigne, column: nbColonnes } };
  }
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    printTitlesRow: `${premiereEntete}:${premiereEntete}`,
  };

  return workbook;
}

export async function telechargerClasseurAlerte(donnees: DonneesAlerte, nomFichier: string) {
  const workbook = construireClasseurAlerte(donnees);
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
