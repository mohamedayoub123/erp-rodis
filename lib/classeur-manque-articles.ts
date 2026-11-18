import ExcelJS from "exceljs";
import { nombreDeLignes } from "@/lib/classeur-excel-style";

// Export Excel de la page Manque Articles : UN SEUL fichier, UNE feuille, UN SEUL tableau avec toutes les lignes des deux tableaux de l'ecran (les
// matieres premieres puis le conditionnement) : les colonnes de l'ecran (Article, Sous famille, Besoin, Stock Depot E, Manque - sans la colonne
// Unite, voulue absente de l'Excel), une colonne GAMME (les gammes qui ont besoin de l'article), puis les commandes (BC) et les imports en cours.
// Mise en forme :
//  - un FILTRE EXCEL sur chaque colonne (fleches sur les titres : Article, Sous famille, Gamme...) - possible parce que c'est un seul tableau ;
//  - une BORDURE visible sur TOUTES les cellules du tableau (titres et lignes) ;
//  - les TITRES des colonnes sont EN GRAS et plus grands (13) ;
//  - tout commence en HAUT et a GAUCHE de chaque cellule (le contenu d'une ligne demarre a la meme hauteur, meme quand un BC / import est long) ;
//  - la colonne MANQUE est en ROUGE (fond rouge clair, texte rouge fonce en gras) ;
//  - le code d'un BC et le dossier d'un import sont en BLEU, gras, soulignes, comme les liens de l'ERP ; le reste de la ligne en gris ;
//  - les colonnes de detail BC / Import sont en "renvoyer a la ligne" (texte a la ligne) : un BC ou un import par ligne dans la cellule, la hauteur
//    de la ligne s'ajuste au nombre de lignes.
// Charge a la demande par le bouton d'export (exceljs est une bibliotheque lourde).

// Un BC ou un import : son code (le code du BC, le dossier de l'import - en bleu souligne dans l'Excel, comme les liens de l'ERP) puis le reste de la
// ligne (" - quantite - ...")
export type DetailExport = { code: string; reste: string };

export type LigneExportManque = {
  nom: string;
  sousFamille: string;
  // gammes des articles finis qui ont besoin de cet article, separees par ", " ("-" = aucune) : un flacon peut servir a plusieurs gammes
  gamme: string;
  besoin: number;
  stock: number;
  manque: number;
  // total a recevoir sur les bons de commande, puis une ligne par BC : "code - quantite - commande du jj-mm-aaaa" (vide = aucun BC)
  commandeTotal: number;
  commandeDetail: DetailExport[];
  // total en route, puis une ligne par import : "dossier - quantite - statut - import du ... - reception prevue le jj-mm-aaaa" (vide = aucun import)
  importTotal: number;
  importDetail: DetailExport[];
};

// Un tableau de l'ecran ("Manque - Matiere Premiere", "Manque - Conditionnement") ; un tableau sans ligne n'est pas envoye
export type SectionManque = { titre: string; lignes: LigneExportManque[] };

export type DonneesManque = {
  titre: string;
  // ex : "Sous famille : CAPSULE, CARTON" (vide = aucun filtre)
  filtres: string;
  sections: SectionManque[];
};

const BLANC = "FFFFFFFF";
const GRIS_CLAIR = "FFF8FAFC"; // slate-50
const TEXTE = "FF0F172A"; // slate-900
const GRIS_TEXTE = "FF64748B"; // slate-500
const BORDURE = "FF475569"; // slate-600 : bordure bien visible sur TOUTES les cellules du tableau (en-tete compris)
const ARDOISE = "FF1E293B"; // slate-800
const TAILLE_TITRE_COLONNE = 13; // titres des colonnes : gras et plus grands que le texte (11)
const ROUGE_FOND = "FFFEE2E2"; // red-100
const ROUGE_TEXTE = "FFB91C1C"; // red-700
const BLEU_LIEN = "FF0369A1"; // sky-700 : la couleur des codes BC et des dossiers d'import dans l'ERP (liens en bleu, gras, soulignes)
const GRIS_DETAIL = "FF475569"; // slate-600 : le reste de la ligne d'un BC / import, comme dans l'ERP

const HAUTEUR_LIGNE = 15;

const rempli = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function cadre(argb: string): Partial<ExcelJS.Borders> {
  const bord: Partial<ExcelJS.Border> = { style: "thin", color: { argb } };
  return { top: bord, left: bord, bottom: bord, right: bord };
}

const formatNombre = (valeur: number) => (Number.isInteger(valeur) ? "#,##0" : "#,##0.000");

// Cellule "detail" d'un BC / import : le code en bleu gras souligne (comme dans l'ERP) puis le reste en gris, un BC / import par ligne de la cellule.
// Renvoie aussi le texte brut, pour calculer la hauteur de la ligne.
function valeurDetail(details: DetailExport[]): { valeur: string | ExcelJS.CellRichTextValue; texte: string } {
  if (details.length === 0) return { valeur: "-", texte: "-" };
  const morceaux: ExcelJS.RichText[] = [];
  details.forEach((detail, index) => {
    morceaux.push({ text: detail.code, font: { bold: true, underline: true, size: 11, color: { argb: BLEU_LIEN } } });
    morceaux.push({ text: detail.reste + (index < details.length - 1 ? "\n" : ""), font: { size: 11, color: { argb: GRIS_DETAIL } } });
  });
  return { valeur: { richText: morceaux }, texte: details.map((detail) => detail.code + detail.reste).join("\n") };
}

// Largeur utile d'une colonne pour calculer la hauteur des lignes : un peu moins que la largeur, car Excel passe a la ligne au mot (un texte de
// 30 caracteres dans une colonne de 30 peut tenir sur plus d'une ligne) - sans ca, une liste de gammes longue etait coupee en bas de la cellule
const COEFFICIENT_LARGEUR_UTILE = 0.82;
function largeurUtile(colonne: number): number {
  return Math.max(8, Math.floor(COLONNES[colonne - 1].largeur * COEFFICIENT_LARGEUR_UTILE));
}

const COLONNES: { titre: string; largeur: number }[] = [
  { titre: "Article", largeur: 48 },
  { titre: "Sous famille", largeur: 18 },
  { titre: "Gamme", largeur: 30 },
  { titre: "Besoin", largeur: 14 },
  { titre: "Stock Depot E", largeur: 15 },
  { titre: "Manque", largeur: 14 },
  { titre: "Commande (BC) en cours - Qt", largeur: 24 },
  { titre: "Commande (BC) en cours - Detail (BC, Qt, date du BC)", largeur: 52 },
  { titre: "Import en cours - Qt", largeur: 20 },
  { titre: "Import en cours - Detail (dossier, Qt, date de reception prevue)", largeur: 78 },
];

export function construireClasseurManque(donnees: DonneesManque): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(donnees.titre.slice(0, 31) || "Manque");
  const sections = donnees.sections.filter((section) => section.lignes.length > 0);
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
  const total = sections.reduce((somme, section) => somme + section.lignes.length, 0);
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const detailSections = sections.map((section) => `${section.titre.replace(/^Manque - /, "")} : ${section.lignes.length}`).join(", ");
  ligneFusionnee(donnees.titre, 30, { bold: true, size: 18, color: { argb: TEXTE } });
  ligneFusionnee(`${total} article(s) en manque${detailSections ? ` (${detailSections})` : ""} - au ${aujourdhui}`, 18, {
    size: 11,
    color: { argb: GRIS_TEXTE },
  });
  if (donnees.filtres) ligneFusionnee(`Filtres : ${donnees.filtres}`, 18, { size: 11, bold: true, color: { argb: "FF92400E" } });
  sheet.addRow([]).height = 6;

  // Titres des colonnes : EN GRAS et en plus grand (13), a la ligne quand ils sont longs (la hauteur suit : un titre plus grand tient sur moins de
  // caracteres par ligne), bordure sur chaque cellule
  const lignesEntete = Math.max(...COLONNES.map((colonne) => nombreDeLignes(colonne.titre, Math.floor((colonne.largeur * 11) / TAILLE_TITRE_COLONNE))));
  const hauteurEntete = Math.max(30, lignesEntete * 18 + 10);
  // ----- En-tete du tableau (UN SEUL tableau pour toutes les lignes : matieres premieres puis conditionnement, comme l'ecran) -----
  const entete = sheet.addRow(COLONNES.map((colonne) => colonne.titre));
  entete.height = hauteurEntete;
  entete.eachCell((cellule) => {
    cellule.fill = rempli(ARDOISE);
    cellule.font = { bold: true, size: TAILLE_TITRE_COLONNE, color: { argb: BLANC } };
    cellule.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    cellule.border = cadre(BORDURE);
  });
  const premiereEntete = entete.number;
  let derniereLigne = entete.number;

  // ----- Les articles en manque, dans l'ordre de l'ecran (les matieres premieres d'abord, puis le conditionnement) -----
  sections
    .flatMap((section) => section.lignes)
    .forEach((ligne, index) => {
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
        if (typeof valeur === "string") lignesMax = Math.max(lignesMax, nombreDeLignes(valeur, largeurUtile(colonne)));
      };
      // Colonnes BC / Import : code en bleu gras souligne + reste en gris, texte a la ligne, meme cadre et meme alignement que les autres cellules
      const ecrireDetail = (colonne: number, details: DetailExport[]) => {
        const { valeur, texte } = valeurDetail(details);
        const cellule = row.getCell(colonne);
        cellule.value = valeur;
        cellule.fill = rempli(fond);
        cellule.font = { size: 11, color: { argb: TEXTE } };
        cellule.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        cellule.border = cadre(BORDURE);
        lignesMax = Math.max(lignesMax, nombreDeLignes(texte, largeurUtile(colonne)));
      };
      ecrire(1, ligne.nom, { gras: true });
      ecrire(2, ligne.sousFamille || "-");
      ecrire(3, ligne.gamme || "-");
      ecrire(4, ligne.besoin, { format: formatNombre(ligne.besoin) });
      ecrire(5, ligne.stock, { format: formatNombre(ligne.stock) });
      // MANQUE en rouge
      ecrire(6, ligne.manque, { gras: true, fond: ROUGE_FOND, texte: ROUGE_TEXTE, format: formatNombre(ligne.manque) });
      ecrire(7, ligne.commandeTotal, { format: formatNombre(ligne.commandeTotal) });
      ecrireDetail(8, ligne.commandeDetail);
      ecrire(9, ligne.importTotal, { format: formatNombre(ligne.importTotal) });
      ecrireDetail(10, ligne.importDetail);
      row.height = Math.max(20, lignesMax * HAUTEUR_LIGNE + 5);
      derniereLigne = row.number;
    });

  // En-tete fige, FILTRE EXCEL sur chaque colonne (fleches sur les titres : Article, Sous famille, Gamme, Besoin... - un seul tableau, donc un seul
  // filtre qui couvre toutes les lignes) et en-tete repete a l'impression, en paysage sur la largeur d'une page
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
