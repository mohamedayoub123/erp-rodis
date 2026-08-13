// Configuration par Gamme Statistique du rapport riche (copie fidele des
// fichiers "INV <gamme>.xlsx" fournis par l'utilisateur, un par gamme).
// Chaque fichier a ses propres colonnes/titres/couleurs - jamais suppose
// qu'une gamme copie la structure d'une autre (deja vu : MP COSM et ELIXIR
// n'ont ni les memes colonnes, ni les memes couleurs, ni la meme formule de
// consommation).

export type ColumnKind = "static" | "live" | "editable-text" | "editable-number" | "spacer";

// Champs calcules en direct disponibles pour une colonne "live" - toujours
// les memes peu importe la gamme (Gamme/stock/BC/4D/A commander/consos
// viennent des memes tables articles_matiere_premiere/lots_stock_matiere_
// premiere/bons_commande_matiere_premiere pour tout le monde), seul le nom
// de colonne affiche varie par fichier Excel source.
export type LiveField =
  | "gamme"
  | "stock"
  | "enCoursBc"
  | "qteBcEtDate"
  | "enCours4d"
  | "date4d"
  | "aCommander"
  | "conso1Mois"
  | "conso4Mois"
  | "conso9Mois"
  | "conso12Mois";

export type ColumnDescriptor = {
  key: string;
  label: string;
  kind: ColumnKind;
  liveField?: LiveField;
};

export type LegendEntry = { text: string; bg: string; textColor?: string; bold?: boolean };

export type CategorieStyle = { bg: string; text: string };

export type GammeConfig = {
  // Cle dans donnees[...] qui porte le besoin/stat sur laquelle A COMMANDER
  // et les colonnes conso se basent - le nom exact de cette colonne dans le
  // fichier Excel source varie par gamme (espace ou non, etc.).
  statistiqueKey: string;
  // "rolling12mois" = Conso reelle 12 mois calculee depuis les vraies
  // sorties de stock des 12 derniers mois glissants (MP COSM). "excel6mois"
  // = conso 1 mois = statistiqueKey/6, conso 4 mois = conso1mois*4 (ELIXIR,
  // formule trouvee telle quelle dans le fichier Excel source).
  consoFormula: "rolling12mois" | "excel6mois";
  columns: ColumnDescriptor[];
  // Couleur de fond manuelle sur la cellule DESIGNATION (hex fichier Excel
  // source -> hex CSS), copiee telle quelle depuis l'import, jamais une
  // formule.
  designationCouleurBg: Record<string, string>;
  // Reprend les couleurs de mise en forme conditionnelle trouvees dans le
  // fichier Excel source (conditionalFormatting XML) pour stock bas et
  // A COMMANDER negatif - varient par gamme.
  stockBasBg: string;
  stockBasText: string;
  redText: string;
  // Regle "DESIGNATION en rouge si stock > conso reelle 12 mois" - propre a
  // MP COSM (son fichier source a cette regle et cette colonne ; ELIXIR
  // n'a ni l'un ni l'autre, donc absent/false pour lui).
  highlightStockOverConso12Mois?: boolean;
  // Legende de rotation sur la cellule ORDRE (seulement les gammes qui ont
  // ce systeme dans leur fichier source, ex: MP COSM). Absent = pas de
  // legende de rotation pour cette gamme.
  categorieStyles?: Record<string, CategorieStyle>;
  // Bloc "Notes" en bas de page, copie fidele du fichier Excel source.
  notesLegend: LegendEntry[];
};

export const GAMME_CONFIGS: Record<string, GammeConfig> = {
  "MP COSM": {
    statistiqueKey: "statistique 4D 6 mois",
    consoFormula: "rolling12mois",
    columns: [
      { key: "Gamme", label: "Gamme", kind: "live", liveField: "gamme" },
      { key: "stock", label: "stock", kind: "live", liveField: "stock" },
      { key: "en cours d'achat BC", label: "en cours d'achat BC", kind: "live", liveField: "enCoursBc" },
      { key: "Qte BC et Date", label: "Qte BC et Date", kind: "live", liveField: "qteBcEtDate" },
      { key: "en cour d'achat 4D", label: "en cour d'achat 4D", kind: "live", liveField: "enCours4d" },
      {
        key: "date le livraison prevu ds 4d",
        label: "date le livraison prevu ds 4d",
        kind: "live",
        liveField: "date4d",
      },
      { key: "avis", label: "avis", kind: "editable-text" },
      { key: "statistique 4D 6 mois", label: "statistique 4D 6 mois", kind: "editable-number" },
      { key: "Statistique 6mois calculé", label: "Statistique 6mois calculé", kind: "static" },
      { key: "A COMMANDER", label: "A COMMANDER", kind: "live", liveField: "aCommander" },
      { key: "__SPACER__", label: "", kind: "spacer" },
      { key: "tonnage 1 tc", label: "tonnage 1 tc", kind: "editable-number" },
      { key: "conso 1mois", label: "conso 1mois", kind: "live", liveField: "conso1Mois" },
      { key: "Conso reelle 12mois", label: "Conso reelle 12mois", kind: "live", liveField: "conso12Mois" },
      { key: "conso 9Mois", label: "conso 9Mois", kind: "live", liveField: "conso9Mois" },
      { key: "conso 4mois", label: "conso 4mois", kind: "live", liveField: "conso4Mois" },
    ],
    designationCouleurBg: { "00B050": "#00B050", FFFF00: "#FFFF00" },
    stockBasBg: "#FFC7CE",
    stockBasText: "#9C0006",
    redText: "#FF0000",
    highlightStockOverConso12Mois: true,
    categorieStyles: {
      "FORTE ROTATION": { bg: "#C55A11", text: "#ffffff" },
      "MOYENNE ROTATION": { bg: "#ffffff", text: "#0f172a" },
      DORMANT: { bg: "#BDD7EE", text: "#0f172a" },
      "NEW PROJECT": { bg: "#E2F0D9", text: "#0f172a" },
    },
    notesLegend: [
      { text: "Stock inférieur à 3 mois de conso", bg: "#FFC7CE", textColor: "#C00000", bold: true },
      { text: "Urgent mettre pression sur rimex  STOCK INFERIEUR A CONSO 4 MOIS", bg: "#FFFF00", bold: true },
      {
        text: "Urgent : verifier la date sur le dossier STOCK INFERIEUR A CONSO 4 MOIS/ CHARBEL",
        bg: "#00B050",
        bold: true,
      },
      { text: "stock dormant", bg: "#BDD7EE", bold: true },
      { text: "article important", bg: "#C55A11", bold: true },
      { text: "Stat 6 mois à mettre (nouveaux produits)", bg: "#FFC000" },
      { text: "BC ayant dépassé 3mois sans retour", bg: "#FF5050" },
      { text: "STAT A METTRE A JOUR", bg: "#FFC000", textColor: "#C00000", bold: true },
      { text: "A FAIRE OBLIGATOIREMENT L'INVENTAIRE TOURNANT CHAQ MOIS", bg: "#00B0F0", bold: true },
      { text: "E.T.D : Estimated Time of Departure (Heure estimée de départ)", bg: "transparent" },
    ],
  },
  ELIXIR: {
    statistiqueKey: "statistique 4D 6mois",
    consoFormula: "excel6mois",
    columns: [
      { key: "unite", label: "", kind: "static" },
      { key: "stock reel", label: "stock reel", kind: "live", liveField: "stock" },
      { key: "en cour d'achat BC", label: "en cour d'achat BC", kind: "live", liveField: "enCoursBc" },
      { key: "__BC_DETAIL__", label: "", kind: "live", liveField: "qteBcEtDate" },
      { key: "en cour d'achat 4D", label: "en cour d'achat 4D", kind: "live", liveField: "enCours4d" },
      { key: "__4D_DETAIL__", label: "", kind: "live", liveField: "date4d" },
      { key: "avis", label: "avis", kind: "editable-number" },
      { key: "statistique 4D 6mois", label: "statistique 4D 6mois", kind: "editable-number" },
      { key: "A COMMANDER", label: "A COMMANDER", kind: "live", liveField: "aCommander" },
      { key: "2025", label: "2025", kind: "static" },
      { key: "conso 1 mois", label: "conso 1 mois", kind: "live", liveField: "conso1Mois" },
      { key: "conso 4 mois", label: "conso 4 mois", kind: "live", liveField: "conso4Mois" },
    ],
    designationCouleurBg: { "00B050": "#00B050", FFFF00: "#FFFF00" },
    stockBasBg: "#E6B9B8",
    stockBasText: "#5c2b2a",
    redText: "#FF0000",
    notesLegend: [
      { text: "Note: urgent: vérifier la date sur le dossier", bg: "#00B050", bold: true },
      { text: "urgent : mettre la pression sur le fournisseur", bg: "#FFFF00", bold: true },
      { text: "NP = Néo Parfum", bg: "transparent" },
      { text: "Stock inférieur à 3 mois de consommation", bg: "#E6B9B8", bold: true },
      { text: "commande du moi passé non faite", bg: "#FDEADA" },
      { text: "BC ayant dépassé 3mois sans retour", bg: "#FF0000", bold: true },
      { text: "STAT à METTRE A JOUR", bg: "#FAC090", bold: true },
    ],
  },
};
