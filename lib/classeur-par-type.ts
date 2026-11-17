import ExcelJS from "exceljs";

// Export Excel de la page "Commandes par type de produit fini" (/tableau-commandes/par-type) : le classeur reprend la forme de l'ecran, cellule par
// cellule - titre et sous-titre, legende des statuts, les 6 cartes de totaux, puis le tableau (un article par ligne, un client par colonne) avec les
// MEMES couleurs : en-tetes bleu ciel des clients, quantite de chaque client coloree selon le statut de la commande (En cours jaune, BL transforme vert,
// Stand orange - deux moities de couleur quand un client a 2 statuts sur le meme article), colonnes Total commande / Stock PF / Programme en cours / Reste
// a fabriquer / Stock apres commande en cours chacune de sa couleur (rouge quand ca manque, vert sinon), lignes alternees blanc / gris clair et ligne Total.
// Il exporte exactement ce qui est affiche : les clients retires de l'ecran n'y sont plus, les totaux sont ceux de l'ecran.
// Charge a la demande par le bouton d'export (exceljs est une bibliotheque lourde).

export type StatutExport = "EN_COURS" | "BL_TRANSFORME" | "STAND";

export type LigneExportParType = {
  nom: string;
  // client -> quantite par statut de commande
  quantites: Record<string, Partial<Record<StatutExport, number>>>;
  total: number;
  stock: number;
  enCours: number;
  reste: number;
  apres: number;
};

export type DonneesParType = {
  titre: string;
  clients: string[];
  lignes: LigneExportParType[];
  totalParClient: Record<string, number>;
  totaux: { total: number; stock: number; enCours: number; apres: number; reste: number; enManque: number };
};

// Couleurs de l'ecran (classes Tailwind du tableau), en ARGB
const BLANC = "FFFFFFFF";
const GRIS_CLAIR = "FFF8FAFC"; // slate-50
const TEXTE = "FF0F172A"; // slate-900
const GRIS_TEXTE = "FF94A3B8"; // slate-400
const BORDURE_LIGNE = "FFCBD5E1"; // slate-300
const BORDURE_BLEUE = "FF7DD3FC"; // sky-300
const ARDOISE = "FF1E293B"; // slate-800
const CIEL_FOND = "FFE0F2FE"; // sky-100
const CIEL_FONCE = "FFBAE6FD"; // sky-200
const CIEL_TEXTE = "FF0C4A6E"; // sky-900
const INDIGO = "FF4F46E5"; // indigo-600
const INDIGO_CLAIR = "FFEEF2FF"; // indigo-50
const INDIGO_TEXTE = "FF312E81"; // indigo-900
const EMERAUDE_CLAIR = "FFECFDF5"; // emerald-50
const EMERAUDE_FOND = "FFD1FAE5"; // emerald-100
const EMERAUDE_FONCE = "FFA7F3D0"; // emerald-200
const EMERAUDE_TEXTE = "FF065F46"; // emerald-800
const EMERAUDE_TITRE = "FF064E3B"; // emerald-900
const EMERAUDE_VIF = "FF047857"; // emerald-700
const AMBRE_CLAIR = "FFFFFBEB"; // amber-50
const AMBRE_FOND = "FFFEF3C7"; // amber-100
const AMBRE_FONCE = "FFFDE68A"; // amber-200
const AMBRE_TEXTE = "FF92400E"; // amber-800
const AMBRE_TITRE = "FF78350F"; // amber-900
const ROSE = "FFE11D48"; // rose-600
const ROSE_CLAIR = "FFFFE4E6"; // rose-100
const ROSE_TEXTE = "FFBE123C"; // rose-700
const TURQUOISE = "FF0D9488"; // teal-600
const TURQUOISE_PALE = "FFCCFBF1"; // teal-100
const ROUGE = "FFDC2626"; // red-600
const ROUGE_FOND = "FFFEE2E2"; // red-100
const ROUGE_CLAIR = "FFFEF2F2"; // red-50
const ROUGE_TEXTE = "FFB91C1C"; // red-700

const STATUTS: { cle: StatutExport; libelle: string; fond: string; texte: string }[] = [
  { cle: "EN_COURS", libelle: "En cours", fond: "FFFFF200", texte: TEXTE },
  { cle: "BL_TRANSFORME", libelle: "BL transforme", fond: "FF16A34A", texte: BLANC },
  { cle: "STAND", libelle: "Stand", fond: "FFF59E0B", texte: "FF020617" },
];

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
  return propre || "Par type";
}

export function construireClasseurParType(donnees: DonneesParType): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(nomOnglet(donnees.titre));
  const { clients, lignes, totaux } = donnees;
  const nbColonnes = 1 + clients.length + 5;
  const colTotal = 2 + clients.length;

  sheet.getColumn(1).width = 42;
  for (let i = 0; i < clients.length; i++) sheet.getColumn(2 + i).width = 18;
  for (let i = 0; i < 4; i++) sheet.getColumn(colTotal + i).width = 14;
  sheet.getColumn(colTotal + 4).width = 17;
  const largeurClient = 18;

  function ligneFusionnee(valeur: string | ExcelJS.CellRichTextValue, hauteur: number, police: Partial<ExcelJS.Font>, alignement?: Partial<ExcelJS.Alignment>) {
    const ligne = sheet.addRow([valeur]);
    sheet.mergeCells(ligne.number, 1, ligne.number, nbColonnes);
    const cellule = ligne.getCell(1);
    cellule.font = police;
    cellule.alignment = { vertical: "middle", horizontal: "left", ...alignement };
    ligne.height = hauteur;
    return ligne;
  }
  const espace = (hauteur: number) => {
    sheet.addRow([]).height = hauteur;
  };

  // ----- Titre et sous-titre (comme l'ecran) -----
  ligneFusionnee("Commandes par type de produit fini - " + donnees.titre, 26, { bold: true, size: 16, color: { argb: TEXTE } });
  ligneFusionnee(
    `${lignes.length} articles commandes par ${clients.length} clients - reste a fabriquer total ${texteNombre(totaux.reste)} cartons`,
    18,
    { size: 11, color: { argb: "FF64748B" } }
  );

  // ----- Legende : la couleur de chaque quantite client = le statut de la commande -----
  const legende = sheet.addRow(["Couleur = statut de la commande", ...STATUTS.map((statut) => statut.libelle)]);
  legende.height = 20;
  legende.getCell(1).font = { italic: true, size: 10, color: { argb: "FF64748B" } };
  legende.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  STATUTS.forEach((statut, index) => {
    const cellule = legende.getCell(2 + index);
    cellule.fill = rempli(statut.fond);
    cellule.font = { bold: true, size: 10, color: { argb: statut.texte } };
    cellule.alignment = { vertical: "middle", horizontal: "center" };
    cellule.border = cadre(statut.fond);
  });
  espace(6);

  // ----- Les 6 cartes de totaux -----
  const manque = totaux.enManque > 0;
  const resteAFaire = totaux.reste > 0;
  const cartes: { titre: string; valeur: string; detail: string; accent: string; fond: string; texte: string }[] = [
    { titre: "Articles commandes", valeur: String(lignes.length), detail: `${clients.length} clients`, accent: "FF64748B", fond: GRIS_CLAIR, texte: TEXTE },
    { titre: "Total commande", valeur: texteNombre(totaux.total), detail: "cartons", accent: "FF6366F1", fond: INDIGO_CLAIR, texte: INDIGO_TEXTE },
    { titre: "Stock PF", valeur: texteNombre(totaux.stock), detail: "cartons", accent: "FF10B981", fond: EMERAUDE_CLAIR, texte: EMERAUDE_TITRE },
    { titre: "Programme en cours", valeur: texteNombre(totaux.enCours), detail: "cartons", accent: "FFF59E0B", fond: AMBRE_CLAIR, texte: AMBRE_TITRE },
    {
      titre: "En manque apres commande en cours",
      valeur: String(totaux.enManque),
      detail: "articles",
      accent: manque ? "FFEF4444" : "FF10B981",
      fond: manque ? ROUGE_CLAIR : EMERAUDE_CLAIR,
      texte: manque ? "FF991B1B" : EMERAUDE_TITRE,
    },
    {
      titre: "Reste a fabriquer",
      valeur: texteNombre(totaux.reste),
      detail: "cartons",
      accent: resteAFaire ? "FFF43F5E" : "FF10B981",
      fond: resteAFaire ? "FFFFF1F2" : EMERAUDE_CLAIR,
      texte: resteAFaire ? "FF9F1239" : EMERAUDE_TITRE,
    },
  ];
  const ligneCartes = sheet.addRow([]);
  ligneCartes.height = 80;
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
  const longuestNomClient = clients.reduce((max, client) => Math.max(max, nombreDeLignes(client, largeurClient)), 1);
  const entete = sheet.addRow([]);
  entete.height = Math.max(84, longuestNomClient * 17 + 10);
  const styleEntete = (colonne: number, valeur: string | ExcelJS.CellRichTextValue, fond: string, texte: string, bordure: string, gauche = false) => {
    const cellule = entete.getCell(colonne);
    cellule.value = valeur;
    cellule.fill = rempli(fond);
    cellule.font = { bold: true, size: 11, color: { argb: texte } };
    cellule.alignment = { vertical: "middle", horizontal: gauche ? "left" : "center", wrapText: true, indent: gauche ? 1 : 0 };
    cellule.border = cadre(bordure);
  };
  styleEntete(1, "Article", ARDOISE, BLANC, ARDOISE, true);
  clients.forEach((client, index) => styleEntete(2 + index, client, CIEL_FOND, CIEL_TEXTE, BORDURE_BLEUE));
  styleEntete(colTotal, "Total commande", INDIGO, BLANC, BORDURE_LIGNE);
  styleEntete(colTotal + 1, "Stock PF", EMERAUDE_FOND, EMERAUDE_TITRE, BORDURE_LIGNE);
  styleEntete(colTotal + 2, "Programme en cours", AMBRE_FOND, AMBRE_TITRE, BORDURE_LIGNE);
  styleEntete(colTotal + 3, "Reste a fabriquer", ROSE, BLANC, BORDURE_LIGNE);
  styleEntete(
    colTotal + 4,
    {
      richText: [
        { text: "Stock apres commande en cours\n", font: { bold: true, size: 11, color: { argb: BLANC } } },
        { text: "stock + programme en cours - commande", font: { size: 8, color: { argb: TURQUOISE_PALE } } },
      ],
    },
    TURQUOISE,
    BLANC,
    BORDURE_LIGNE
  );

  // Le titre, la legende, les cartes et l'en-tete restent visibles, ainsi que la colonne Article, quand on fait defiler (comme l'ecran)
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: entete.number, showGridLines: false }];

  // ----- Les articles -----
  lignes.forEach((ligne, index) => {
    const fond = index % 2 === 0 ? BLANC : GRIS_CLAIR;
    const row = sheet.addRow([]);
    let hauteur = Math.max(24, nombreDeLignes(ligne.nom, 34) * 16 + 8);

    const article = row.getCell(1);
    article.value = ligne.nom;
    article.fill = rempli(fond);
    article.font = { bold: true, size: 11, color: { argb: TEXTE } };
    article.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    article.border = cadre(BORDURE_LIGNE);

    clients.forEach((client, position) => {
      const cellule = row.getCell(2 + position);
      cellule.border = cadre(BORDURE_LIGNE);
      cellule.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      const parStatut = ligne.quantites[client];
      const presents = STATUTS.filter((statut) => (parStatut?.[statut.cle] ?? 0) > 0);
      if (presents.length === 0) {
        cellule.fill = rempli(fond);
      } else if (presents.length === 1) {
        // un seul statut : la quantite (un vrai nombre) sur la couleur du statut
        const statut = presents[0];
        cellule.value = parStatut![statut.cle]!;
        cellule.numFmt = formatNombre(cellule.value as number);
        cellule.fill = rempli(statut.fond);
        cellule.font = { bold: true, size: 12, color: { argb: statut.texte } };
      } else {
        // plusieurs statuts : une moitie de couleur par statut, comme les pastilles empilees de l'ecran
        const n = presents.length;
        cellule.value = {
          richText: presents.map((statut, i) => ({
            text: texteNombre(parStatut![statut.cle]!) + (i < n - 1 ? "\n" : ""),
            font: { bold: true, size: 12, color: { argb: statut.texte } },
          })),
        };
        // Coupure nette : chaque couleur tient jusqu'a juste avant la frontiere (0,002 de decalage, car Excel fond deux arrets a la meme position)
        const arrets = presents.flatMap((statut, i) => [
          { position: i === 0 ? 0 : i / n + 0.001, color: { argb: statut.fond } },
          { position: i === n - 1 ? 1 : (i + 1) / n - 0.001, color: { argb: statut.fond } },
        ]);
        cellule.fill = { type: "gradient", gradient: "angle", degree: 90, stops: arrets };
        hauteur = Math.max(hauteur, n * 20 + 4);
      }
    });

    const resumer = (colonne: number, valeur: number, fondCellule: string, texte: string, gras: boolean, taille = 11) => {
      const cellule = row.getCell(colonne);
      cellule.value = valeur;
      cellule.numFmt = formatNombre(valeur);
      cellule.fill = rempli(fondCellule);
      cellule.font = { bold: gras, size: taille, color: { argb: texte } };
      cellule.alignment = { vertical: "middle", horizontal: "center" };
      cellule.border = cadre(BORDURE_LIGNE);
    };
    resumer(colTotal, ligne.total, INDIGO_CLAIR, INDIGO_TEXTE, true, 12);
    resumer(colTotal + 1, ligne.stock, ligne.stock < 0 ? ROUGE_CLAIR : EMERAUDE_CLAIR, ligne.stock < 0 ? ROUGE_TEXTE : EMERAUDE_TEXTE, true);
    resumer(colTotal + 2, ligne.enCours, ligne.enCours > 0 ? AMBRE_CLAIR : fond, ligne.enCours > 0 ? AMBRE_TEXTE : GRIS_TEXTE, true);
    resumer(colTotal + 3, ligne.reste, ligne.reste > 0 ? ROSE_CLAIR : EMERAUDE_CLAIR, ligne.reste > 0 ? ROSE_TEXTE : EMERAUDE_VIF, true, 12);
    resumer(colTotal + 4, ligne.apres, ligne.apres < 0 ? ROUGE_FOND : EMERAUDE_FOND, ligne.apres < 0 ? ROUGE_TEXTE : EMERAUDE_TEXTE, true, 12);
    row.height = hauteur;
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
  clients.forEach((client, index) => celluleTotal(2 + index, donnees.totalParClient[client] ?? 0, CIEL_FONCE, CIEL_TEXTE, BORDURE_BLEUE));
  celluleTotal(colTotal, totaux.total, INDIGO, BLANC, BORDURE_LIGNE);
  celluleTotal(colTotal + 1, totaux.stock, EMERAUDE_FONCE, EMERAUDE_TITRE, BORDURE_LIGNE);
  celluleTotal(colTotal + 2, totaux.enCours, AMBRE_FONCE, AMBRE_TITRE, BORDURE_LIGNE);
  celluleTotal(colTotal + 3, totaux.reste, ROSE, BLANC, BORDURE_LIGNE);
  celluleTotal(colTotal + 4, totaux.apres, totaux.apres < 0 ? ROUGE : TURQUOISE, BLANC, BORDURE_LIGNE);

  // Impression : paysage, tout le tableau sur la largeur d'une page, l'en-tete repete sur chaque page
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

export async function telechargerClasseurParType(donnees: DonneesParType, nomFichier: string) {
  const workbook = construireClasseurParType(donnees);
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
