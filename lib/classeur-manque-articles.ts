import ExcelJS from "exceljs";
import { nombreDeLignes } from "@/lib/classeur-excel-style";

// Export Excel des tableaux de la page Manque Articles (Manque - Matiere Premiere / Manque - Conditionnement) : les memes colonnes que l'ecran
// (Article, Sous famille, Unite, Besoin, Stock Depot E, Manque) puis les commandes (BC) et les imports en cours. Mise en forme :
//  - tout commence en HAUT et a GAUCHE de chaque cellule (le contenu d'une ligne demarre a la meme hauteur, meme quand un BC / import est long) ;
//  - la colonne MANQUE est en ROUGE (fond rouge clair, texte rouge fonce en gras) ;
//  - les colonnes de detail BC / Import sont en "renvoyer a la ligne" (texte a la ligne) : un BC ou un import par ligne dans la cellule, la hauteur
//    de la ligne s'ajuste au nombre de lignes.
// Charge a la demande par le bouton d'export (exceljs est une bibliotheque lourde).

export type LigneExportManque = {
  nom: string;
  sousFamille: string;
  unite: string;
  besoin: number;
  stock: number;
  manque: number;
  // total a recevoir sur les bons de commande, puis une ligne par BC : "code - quantite - commande du jj-mm-aaaa" ("-" = aucun BC)
  commandeTotal: number;
  commandeDetail: string;
  // total en route, puis une ligne par import : "dossier - quantite - statut - import du ... - reception prevue le jj-mm-aaaa" ("-" = aucun import)
  importTotal: number;
  importDetail: string;
};

export type DonneesManque = {
  titre: string;
  // ex : "Sous famille : CAPSULE, CARTON" (vide = aucun filtre)
  filtres: string;
  lignes: LigneExportManque[];
};

const BLANC = "FFFFFFFF";
const GRIS_CLAIR = "FFF8FAFC"; // slate-50
const TEXTE = "FF0F172A"; // slate-900
const GRIS_TEXTE = "FF64748B"; // slate-500
const BORDURE = "FFCBD5E1"; // slate-300
const ARDOISE = "FF1E293B"; // slate-800
const ROUGE_FOND = "FFFEE2E2"; // red-100
const ROUGE_TEXTE = "FFB91C1C"; // red-700

const HAUTEUR_LIGNE = 15;

const rempli = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function cadre(argb: string): Partial<ExcelJS.Borders> {
  const bord: Partial<ExcelJS.Border> = { style: "thin", color: { argb } };
  return { top: bord, left: bord, bottom: bord, right: bord };
}

const formatNombre = (valeur: number) => (Number.isInteger(valeur) ? "#,##0" : "#,##0.000");

const COLONNES: { titre: string; largeur: number }[] = [
  { titre: "Article", largeur: 48 },
  { titre: "Sous famille", largeur: 18 },
  { titre: "Unite", largeur: 9 },
  { titre: "Besoin", largeur: 14 },
  { titre: "Stock Depot E", largeur: 15 },
  { titre: "Manque", largeur: 14 },
  { titre: "Commande (BC) en cours - Qt", largeur: 17 },
  { titre: "Commande (BC) en cours - Detail (BC, Qt, date du BC)", largeur: 52 },
  { titre: "Import en cours - Qt", largeur: 16 },
  { titre: "Import en cours - Detail (dossier, Qt, date de reception prevue)", largeur: 78 },
];

export function construireClasseurManque(donnees: DonneesManque): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(donnees.titre.slice(0, 31) || "Manque");
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

  // ----- Titre, sous-titre et filtres -----
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  ligneFusionnee(donnees.titre, 26, { bold: true, size: 16, color: { argb: TEXTE } });
  ligneFusionnee(`${lignes.length} article(s) en manque - au ${aujourdhui}`, 18, { size: 11, color: { argb: GRIS_TEXTE } });
  if (donnees.filtres) ligneFusionnee(`Filtres : ${donnees.filtres}`, 18, { size: 11, bold: true, color: { argb: "FF92400E" } });
  sheet.addRow([]).height = 6;

  // ----- En-tete du tableau -----
  const entete = sheet.addRow(COLONNES.map((colonne) => colonne.titre));
  entete.height = 34;
  entete.eachCell((cellule) => {
    cellule.fill = rempli(ARDOISE);
    cellule.font = { bold: true, size: 11, color: { argb: BLANC } };
    cellule.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    cellule.border = cadre(ARDOISE);
  });

  // ----- Les articles en manque, dans l'ordre de l'ecran -----
  lignes.forEach((ligne, index) => {
    const fond = index % 2 === 0 ? BLANC : GRIS_CLAIR;
    const row = sheet.addRow([]);
    let lignesMax = 1;
    const ecrire = (
      colonne: number,
      valeur: string | number,
      options?: { gras?: boolean; texte?: string; fond?: string; format?: string }
    ) => {
      const cellule = row.getCell(colonne);
      cellule.value = valeur;
      cellule.fill = rempli(options?.fond ?? fond);
      cellule.font = { bold: options?.gras ?? false, size: 11, color: { argb: options?.texte ?? TEXTE } };
      // tout commence en haut et a gauche ; texte a la ligne (BC / import longs sur plusieurs lignes)
      cellule.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cellule.border = cadre(BORDURE);
      if (options?.format) cellule.numFmt = options.format;
      if (typeof valeur === "string") lignesMax = Math.max(lignesMax, nombreDeLignes(valeur, COLONNES[colonne - 1].largeur));
    };
    ecrire(1, ligne.nom, { gras: true });
    ecrire(2, ligne.sousFamille || "-");
    ecrire(3, ligne.unite || "-");
    ecrire(4, ligne.besoin, { format: formatNombre(ligne.besoin) });
    ecrire(5, ligne.stock, { format: formatNombre(ligne.stock) });
    // MANQUE en rouge
    ecrire(6, ligne.manque, { gras: true, fond: ROUGE_FOND, texte: ROUGE_TEXTE, format: formatNombre(ligne.manque) });
    ecrire(7, ligne.commandeTotal, { format: formatNombre(ligne.commandeTotal) });
    ecrire(8, ligne.commandeDetail);
    ecrire(9, ligne.importTotal, { format: formatNombre(ligne.importTotal) });
    ecrire(10, ligne.importDetail);
    row.height = Math.max(20, lignesMax * HAUTEUR_LIGNE + 5);
  });

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

export async function telechargerClasseurManque(donnees: DonneesManque, nomFichier: string) {
  const workbook = construireClasseurManque(donnees);
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
