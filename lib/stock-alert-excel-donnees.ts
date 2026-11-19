import type { DetailExport } from "@/lib/classeur-manque-articles";

// Donnees et couleurs de l'export Excel des pages Stock Alert - fichier LEGER (aucune bibliotheque) : les pages serveur y prennent les couleurs et
// les types sans charger exceljs, que seul le bouton d'export charge au clic (voir lib/classeur-stock-alert.ts).

// Couleurs de l'ERP (Tailwind) en ARGB
export const COULEURS_EXCEL = {
  texte: "FF0F172A", // slate-900
  gris: "FF475569", // slate-600
  grisClair: "FF64748B", // slate-500
  blanc: "FFFFFFFF",
  enteteFond: "FFF8FAFC", // slate-50 : le fond des titres du tableau de l'ERP
  enteteTexte: "FF020617", // slate-950
  bordure: "FF475569", // slate-600
  lien: "FF0369A1", // sky-700 : codes BC et dossiers d'import (liens de l'ERP)
  bleuConsommation: "FF0369A1", // sky-700
  bleuDetail: "FF075985", // sky-800
  vert: "FF047857", // emerald-700
  rouge: "FFB91C1C", // red-700
  rougeFort: "FF991B1B", // red-800
  rougeFond: "FFFEE2E2", // red-100 (pastille du stock)
  rougeLigne: "FFFEF2F2", // red-50 (ligne non couverte)
  ambre: "FFB45309", // amber-700
  ambreLigne: "FFFFFBEB", // amber-50 (ligne couverte par un BC / import)
  jauneLigne: "FFFEF08A", // yellow-200
  jauneTexte: "FF713F12", // yellow-900
  vertLigne: "FFBBF7D0", // green-200
  vertTexte: "FF14532D", // green-900
  orangeLigne: "FFFED7AA", // orange-200
  orangeTexte: "FF7C2D12", // orange-900
} as const;

export type StyleCelluleAlerte = { fond?: string; texte?: string; gras?: boolean };

export type CelluleAlerte = {
  valeur?: string | number | null;
  // BC / imports : le code en bleu gras souligne puis le reste en gris, un par ligne de la cellule (prend la place de "valeur")
  details?: DetailExport[];
  style?: StyleCelluleAlerte;
};

// "style" = le style de TOUTES les cellules de la colonne (une cellule peut avoir le sien) : la page n'envoie ainsi qu'une valeur par cellule
export type ColonneAlerte = { titre: string; largeur: number; style?: StyleCelluleAlerte };
// "fond" = couleur de toute la ligne (absent = blanc comme a l'ecran) ; "cellules" suit l'ordre des colonnes : une valeur simple, ou un objet pour un
// style a part / une liste de BC ou d'imports
export type LigneAlerte = { fond?: string; cellules: (string | number | null | CelluleAlerte)[] };
export type LegendeAlerte = { libelle: string; fond: string; texte: string };

export type DonneesAlerte = {
  titre: string;
  sousTitre: string;
  // ex : "Categorie : FLACON" (vide = aucun filtre)
  filtres: string;
  legende: LegendeAlerte[];
  colonnes: ColonneAlerte[];
  lignes: LigneAlerte[];
};
