// Schemas de procedures du "Rapport de revue de processus PR4", redessines en vectoriel a partir des schemas
// d'origine (memes cases, memes textes - orthographe d'origine conservee - et memes liens). Coordonnees en
// pixels du schema d'origine.

export type Pt = [number, number];

export type NoeudProc = {
  id: string;
  forme: "rect" | "arrondi" | "ellipse" | "losange" | "etoile" | "engrenage" | "chevron";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lignes: string[];
  taille?: number;
  alignement?: "gauche";
  style?: "vert" | "jaune";
};

export type LienProc = { pts: Pt[]; fleche?: boolean; couleur?: string };
export type EtiquetteProc = { x: number; y: number; texte: string; couleur?: string; gras?: boolean; taille?: number };

export type DiagrammeProc = {
  cle: string;
  titre: string;
  theme: "noir" | "orange" | "bleu";
  taille: number;
  // [x, y, largeur, hauteur] de la zone affichee
  vue: [number, number, number, number];
  noeuds: NoeudProc[];
  liens: LienProc[];
  etiquettes: EtiquetteProc[];
};

// ---------------------------------------------------------------- aides de construction
function noeud(
  id: string,
  forme: NoeudProc["forme"],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lignes: string[],
  extra: Partial<NoeudProc> = {}
): NoeudProc {
  return { id, forme, x1, y1, x2, y2, lignes, ...extra };
}
const cx = (n: NoeudProc) => (n.x1 + n.x2) / 2;
const cy = (n: NoeudProc) => (n.y1 + n.y2) / 2;
const bas = (n: NoeudProc): Pt => [cx(n), n.y2];
const haut = (n: NoeudProc): Pt => [cx(n), n.y1];
// lien vertical droit : du bas de a au haut de b, avec fleche
const vert = (a: NoeudProc, b: NoeudProc): LienProc => ({ pts: [[cx(a), a.y2], [cx(a), b.y1]], fleche: true });
const fl = (...pts: Pt[]): LienProc => ({ pts, fleche: true });
const trait = (...pts: Pt[]): LienProc => ({ pts });

const ROUGE = "#e00000";
const BLEU_ETIQ = "#4472c4";

// ---------------------------------------------------------------- 1. Processus global cosmetique
function processusGlobal(): DiagrammeProc {
  const n1 = noeud("n1", "ellipse", 335, 112, 611, 172, ["Commande client"]);
  const n2 = noeud("n2", "rect", 367, 198, 580, 243, ["Vérification stock PF"]);
  const n3 = noeud("n3", "losange", 384, 278, 563, 388, ["Stock PF suffisant"]);
  const n4 = noeud("n4", "rect", 620, 310, 834, 356, ["Procédure de chargement", "et expédition"]);
  const n5 = noeud("n5", "rect", 229, 432, 443, 478, ["Établir l'ordre de fabrication"]);
  const n6 = noeud("n6", "rect", 504, 432, 718, 478, ["Établir l'ordre de", "conditionnement"]);
  const n7 = noeud("n7", "rect", 367, 525, 580, 571, ["Programme de fabrication"]);
  const n8 = noeud("n8", "rect", 367, 591, 580, 637, ["Pesage"]);
  const n9 = noeud("n9", "rect", 104, 670, 318, 716, ["Fabrication plateforme", "manuelle"]);
  const n10 = noeud("n10", "rect", 373, 670, 587, 716, ["Fabrication plateforme", "automatique"]);
  const n11 = noeud("n11", "rect", 620, 670, 834, 716, ["Fabrication gel douche"]);
  const n12 = noeud("n12", "rect", 856, 670, 1069, 716, ["Fabrication parfum, huile,", "sérum"]);
  const n13 = noeud("n13", "losange", 1046, 707, 1158, 777, ["Libération"]);
  const n14 = noeud("n14", "rect", 1212, 754, 1322, 830, ["Procédure de", "gestion", "produit NC"]);
  const n15 = noeud("n15", "rect", 381, 773, 594, 819, ["Conditionnement"]);
  const n16 = noeud("n16", "losange", 1046, 809, 1158, 879, ["Libération"]);
  const n17 = noeud("n17", "ellipse", 349, 865, 625, 931, ["Produit fini palettisé"]);
  const n18 = noeud("n18", "rect", 324, 973, 651, 1036, ["Réceptionner et contrôler", "les produits finis"]);
  const n19 = noeud("n19", "rect", 324, 1085, 651, 1148, ["Stocker les produits finis et contrôler", "les conditions de stockage"]);
  const n20 = noeud("n20", "rect", 324, 1198, 651, 1261, ["Préparer et contrôler", "les commandes"]);
  const n21 = noeud("n21", "rect", 324, 1310, 651, 1373, ["Réaliser et contrôler", "les chargements"]);
  const n22 = noeud("n22", "ellipse", 255, 1427, 719, 1519, ["Mise à disposition des chargements", "au service achat et logistique"]);
  const rangee = [n9, n10, n11, n12];
  return {
    cle: "processus-global",
    titre: "Processus global cosmétique",
    theme: "orange",
    taille: 17,
    vue: [90, 90, 1250, 1450],
    noeuds: [n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, n14, n15, n16, n17, n18, n19, n20, n21, n22],
    liens: [
      vert(n1, n2),
      vert(n2, n3),
      fl([n3.x2, cy(n3)], [n4.x1, cy(n3)]),
      trait(bas(n3), [cx(n3), 412]),
      trait([cx(n5), 412], [cx(n6), 412]),
      fl([cx(n5), 412], haut(n5)),
      fl([cx(n6), 412], haut(n6)),
      trait([cx(n5), n5.y2], [cx(n5), 498], [cx(n6), 498], [cx(n6), n6.y2]),
      fl([cx(n7), 498], haut(n7)),
      vert(n7, n8),
      trait(bas(n8), [cx(n8), 655]),
      trait([cx(n9), 655], [cx(n12), 655]),
      ...rangee.map((n) => fl([cx(n), 655], haut(n))),
      ...rangee.map((n) => trait([cx(n), n.y2], [cx(n), cy(n13)])),
      fl([cx(n9), cy(n13)], [n13.x1, cy(n13)]),
      trait([n13.x2, cy(n13)], [1180, cy(n13)], [1180, cy(n14)]),
      trait([n16.x2, cy(n16)], [1180, cy(n16)], [1180, cy(n14)]),
      fl([1180, cy(n14)], [n14.x1, cy(n14)]),
      fl([cx(n13), n13.y2], [cx(n13), cy(n15)], [n15.x2, cy(n15)]),
      fl([cx(n15), n15.y2], [cx(n15), cy(n16)], [n16.x1, cy(n16)]),
      fl([cx(n16), n16.y2], [cx(n16), cy(n17)], [n17.x2, cy(n17)]),
      vert(n17, n18),
      vert(n18, n19),
      vert(n19, n20),
      vert(n20, n21),
      vert(n21, n22),
    ],
    etiquettes: [
      { x: 1224, y: 722, texte: "NC", couleur: BLEU_ETIQ },
      { x: 844, y: 775, texte: "C", couleur: BLEU_ETIQ },
      { x: 1124, y: 891, texte: "C", couleur: BLEU_ETIQ },
    ],
  };
}

// ---------------------------------------------------------------- 2. Procedure de conditionnement
function conditionnement(): DiagrammeProc {
  const c1 = noeud("c1", "rect", 410, 283, 603, 330, ["Reseption programe"]);
  const c2 = noeud("c2", "rect", 320, 356, 466, 403, ["Article de", "conditionnement"]);
  const c3 = noeud("c3", "rect", 568, 351, 714, 398, ["Programe NB carton", "et vrac"]);
  const c4 = noeud("c4", "rect", 296, 430, 489, 477, ["Depot matier premier"]);
  const c5 = noeud("c5", "rect", 544, 430, 737, 477, ["Repartition de programe"]);
  const c6 = noeud("c6", "rect", 296, 508, 489, 555, ["Reseption article de", "conditionnement"]);
  const c7 = noeud("c7", "losange", 353, 577, 433, 637, ["controle"]);
  const c8 = noeud("c8", "rect", 155, 583, 302, 630, ["Procedure de gestion", "de produit NC"]);
  const c9 = noeud("c9", "rect", 544, 561, 737, 620, ["Planification de", "l'approvisionnement article", "de  conditionnement par batch"]);
  const c10 = noeud("c10", "rect", 568, 635, 714, 682, ["Preparation de", "l'approvisionnement"]);
  const c11 = noeud("c11", "losange", 601, 710, 681, 770, ["controle"]);
  const c12 = noeud("c12", "rect", 731, 716, 879, 763, ["Procedure de gestion", "de produit NC"]);
  const c13 = noeud("c13", "chevron", 240, 757, 386, 884, []);
  const c14 = noeud("c14", "rect", 470, 796, 617, 843, ["Approvisionnement", "des chaine"]);
  const c15 = noeud("c15", "rect", 461, 871, 627, 918, ["Verification avand", "conditionnement"]);
  const c16 = noeud("c16", "rect", 349, 945, 495, 1031, ["Contole cadance", "poids nb de casier", "produit avec les suivi", "des aret"]);
  const c17 = noeud("c17", "rect", 580, 945, 727, 992, ["Marquage et", "etiquitage"]);
  const c18 = noeud("c18", "rect", 155, 963, 302, 1010, ["Procedure de gestion", "de produit NC"]);
  const c19 = noeud("c19", "engrenage", 743, 787, 867, 911, ["Maintaince", "de", "machine"], { style: "vert" });
  const c20 = noeud("c20", "rect", 496, 1055, 643, 1103, ["Alimentation machine", "embalage"]);
  const c21 = noeud("c21", "rect", 496, 1151, 643, 1199, ["embalage"]);
  const c22 = noeud("c22", "rect", 496, 1245, 643, 1293, ["Stockage"]);
  const c23 = noeud("c23", "rect", 496, 1352, 643, 1399, ["Livreson depot PF"]);
  const e1 = noeud("e1", "etoile", 795, 962, 974, 1134, ["Enregistrement", "les", "donnees"], { style: "jaune", taille: 15 });
  const e2 = noeud("e2", "etoile", 795, 1150, 974, 1322, ["Enregistrement", "les", "donnees"], { style: "jaune", taille: 15 });
  const X1 = cx(c2);
  const X2 = cx(c3);
  return {
    cle: "conditionnement",
    titre: "Procédure de conditionnement",
    theme: "bleu",
    taille: 14.5,
    vue: [130, 215, 880, 1210],
    noeuds: [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21, c22, c23, e1, e2],
    liens: [
      trait(bas(c1), [cx(c1), 338]),
      trait([X1, 338], [X2, 338]),
      fl([X1, 338], haut(c2)),
      fl([X2, 338], haut(c3)),
      vert(c2, c4),
      vert(c4, c6),
      fl([cx(c6), c6.y2], [cx(c6), c7.y1]),
      fl([c7.x1, cy(c7)], [c8.x2, cy(c7)]),
      fl([c7.x2, cy(c7)], [520, cy(c7)], [520, 590], [c9.x1, 590]),
      vert(c3, c5),
      fl([cx(c5), c5.y2], [cx(c5), c9.y1]),
      vert(c9, c10),
      fl([cx(c10), c10.y2], [cx(c10), c11.y1]),
      fl([c11.x2, cy(c11)], [c12.x1, cy(c11)]),
      trait([691, cy(c11)], [691, c17.y1]),
      fl([c11.x1, cy(c11)], [544, cy(c11)], [544, c14.y1]),
      fl([386, 820], [c14.x1, 820]),
      vert(c14, c15),
      trait([cx(c15), c15.y2], [cx(c15), 927]),
      trait([cx(c16), 927], [cx(c17), 927]),
      fl([cx(c16), 927], haut(c16)),
      fl([cx(c17), 927], haut(c17)),
      fl([c16.x1, 988], [c18.x2, 988]),
      { pts: [[c17.x2, 968], [cx(c19), 968], [cx(c19), c19.y2]], fleche: true, couleur: "#70ad47" },
      trait(bas(c16), [cx(c16), 1040], [570, 1040]),
      fl([c17.x1, 992], [570, 992], [570, c20.y1]),
      { pts: [[570, 1027], [e1.x1, 1027]], fleche: true, couleur: "#ffc000" },
      vert(c20, c21),
      { pts: [[570, 1215], [e2.x1, 1215]], fleche: true, couleur: "#ffc000" },
      vert(c21, c22),
      vert(c22, c23),
    ],
    etiquettes: [
      { x: 535, y: 242, texte: "Procedure de conditionement", taille: 17 },
      { x: 470, y: 594, texte: "C", taille: 16 },
      { x: 327, y: 638, texte: "NC", taille: 16 },
      { x: 696, y: 722, texte: "NC", taille: 16 },
      { x: 518, y: 766, texte: "C", taille: 16 },
      { x: 668, y: 848, texte: "NC", taille: 16 },
      { x: 325, y: 964, texte: "NC", taille: 16 },
      { x: 761, y: 956, texte: "NC", taille: 16 },
      { x: 546, y: 1021, texte: "C", taille: 16 },
      { x: 298, y: 777, texte: "Repartition", couleur: "#222222", taille: 14 },
      { x: 339, y: 830, texte: "Les", couleur: "#222222", taille: 14 },
      { x: 301, y: 866, texte: "chifon", couleur: "#222222", taille: 14 },
    ],
  };
}

// ---------------------------------------------------------------- 3. Procedure FAB HPS (huile, parfum, serum)
function fabHps(): DiagrammeProc {
  const h1 = noeud("h1", "arrondi", 334, 183, 617, 238, ["Réceptionner la MP"]);
  const h2 = noeud("h2", "rect", 338, 273, 617, 325, ["Contrôler la MP"], { taille: 16 });
  const h3 = noeud("h3", "rect", 336, 364, 615, 412, ["Préparer le matériel"]);
  const h4 = noeud("h4", "rect", 339, 447, 619, 491, ["Mélanger la matière"]);
  const h5 = noeud("h5", "rect", 118, 575, 398, 688, ["Identifier les fûts (Nom+", "N°Lot+date de début de", "macération+Quantité(enkg)"], { alignement: "gauche" });
  const h6 = noeud("h6", "rect", 119, 712, 396, 806, ["Laisser macérer pendant", "5jrs ( 1ère phase)"]);
  const h7 = noeud("h7", "rect", 120, 833, 397, 889, ["Ajouter des ingrédients"], { taille: 19 });
  const h8 = noeud("h8", "rect", 115, 924, 392, 993, ["Laisser macérer pendant", "5jrs ( 2ème phase)"]);
  const h9 = noeud("h9", "rect", 304, 1042, 629, 1150, ["Identifier les futs ( Nom+ N°Lot +", "date de fabrication / fin de", "macération( parfum) + Quantité"]);
  const h10 = noeud("h10", "rect", 322, 1174, 628, 1262, ["Prélever un échantillon pour le", "test au laboratoire"]);
  const h11 = noeud("h11", "losange", 345, 1293, 625, 1468, ["Lot validé", "par le", "laboratoire ?"], { taille: 16 });
  const h12 = noeud("h12", "arrondi", 89, 1315, 311, 1447, ["Appliquer la", "procédure de", "maîtrise des produits", "NC"], { taille: 16 });
  const h13 = noeud("h13", "arrondi", 335, 1475, 601, 1546, ["Mettre à disposition du", "conditionnement"]);
  return {
    cle: "fab-hps",
    titre: "Procédure FAB HPS",
    theme: "noir",
    taille: 18,
    vue: [60, 160, 620, 1420],
    noeuds: [h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, h11, h12, h13],
    liens: [
      vert(h1, h2),
      vert(h2, h3),
      vert(h3, h4),
      trait([477, h4.y2], [477, 521]),
      fl([477, 521], [477, h9.y1]),
      fl([473, 521], [247, 521], [247, h5.y1]),
      vert(h5, h6),
      vert(h6, h7),
      vert(h7, h8),
      fl([cx(h8), h8.y2], [cx(h8), 1104], [h9.x1, 1104]),
      vert(h9, h10),
      vert(h10, h11),
      fl([h11.x1, cy(h11)], [h12.x2, cy(h11)]),
      fl([cx(h11), h11.y2], [cx(h11), h13.y1]),
    ],
    etiquettes: [
      { x: 178, y: 548, texte: "Parfum", couleur: ROUGE, gras: true, taille: 20 },
      { x: 522, y: 781, texte: "Huile +", couleur: ROUGE, gras: true, taille: 20 },
      { x: 520, y: 814, texte: "Sérum", couleur: ROUGE, gras: true, taille: 20 },
      { x: 347, y: 1348, texte: "NON", taille: 20 },
      { x: 405, y: 1458, texte: "Oui", taille: 20 },
    ],
  };
}

// ---------------------------------------------------------------- 4. Procedure FAB GEL D (gel douche)
function fabGelD(): DiagrammeProc {
  const g1 = noeud("g1", "arrondi", 426, 257, 701, 302, ["Réceptionner la MP"], { taille: 18 });
  const g2 = noeud("g2", "rect", 427, 329, 697, 370, ["Contrôler la MP"], { taille: 16 });
  const g3 = noeud("g3", "rect", 427, 400, 697, 439, ["Préparer le matériel"], { taille: 17 });
  const g4 = noeud("g4", "rect", 427, 466, 697, 507, ["Pesé (eau)"], { taille: 17 });
  const g5 = noeud("g5", "rect", 429, 529, 699, 637, ["Identifier les fûts (Nom+", "N°Lot+date de début de", "macération+Quantité(enkg)"], { alignement: "gauche", taille: 17 });
  const g6 = noeud("g6", "rect", 435, 659, 703, 706, ["Mélanger la matière"], { taille: 17 });
  const g7 = noeud("g7", "rect", 434, 730, 702, 795, ["Laisser macérer pendant", "24H ( 1ère phase)"], { taille: 17 });
  const g8 = noeud("g8", "rect", 220, 832, 487, 902, ["Ajouter des ingrédients et", "mélanger pendant 25min"], { taille: 17 });
  const g9 = noeud("g9", "rect", 218, 926, 486, 991, ["Laisser macérer pendant", "24H ( 2ème phase)"], { taille: 17 });
  const g10 = noeud("g10", "rect", 219, 1012, 487, 1076, ["Ajouter des ingrédients et", "Mélanger"], { taille: 17 });
  const g11 = noeud("g11", "rect", 410, 1085, 724, 1196, ["Identifier les futs ( Nom+ N°Lot +", "date de fabrication / fin de", "macération+ Quantité (en kg))"], { taille: 17 });
  const g12 = noeud("g12", "rect", 404, 1219, 711, 1285, ["Prélever un échantillon pour le", "test au laboratoire"], { taille: 17 });
  const g13 = noeud("g13", "losange", 437, 1313, 710, 1480, ["Lot validé", "par le", "laboratoire ?"], { taille: 15.5 });
  const g14 = noeud("g14", "arrondi", 191, 1332, 405, 1466, ["Appliquer la", "procédure de", "maîtrise des produits", "NC"], { taille: 15.5 });
  const g15 = noeud("g15", "arrondi", 423, 1498, 726, 1567, ["Mettre à disposition du", "conditionnement"], { taille: 17 });
  return {
    cle: "fab-gel-d",
    titre: "Procédure FAB GEL D",
    theme: "noir",
    taille: 17,
    vue: [170, 235, 590, 1350],
    noeuds: [g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13, g14, g15],
    liens: [
      vert(g1, g2),
      vert(g2, g3),
      vert(g3, g4),
      vert(g4, g5),
      vert(g5, g6),
      vert(g6, g7),
      trait([566, g7.y2], [566, 810]),
      fl([566, 810], [566, g11.y1]),
      fl([566, 810], [347, 810], [347, g8.y1]),
      vert(g8, g9),
      vert(g9, g10),
      fl([360, g10.y2], [360, 1142], [g11.x1, 1142]),
      vert(g11, g12),
      vert(g12, g13),
      fl([g13.x1, cy(g13)], [g14.x2, cy(g13)]),
      fl([cx(g13), g13.y2], [cx(g13), g15.y1]),
    ],
    etiquettes: [
      { x: 296, y: 822, texte: "Exfoliant", couleur: ROUGE, gras: true, taille: 19 },
      { x: 615, y: 922, texte: "Clarifiant", couleur: ROUGE, gras: true, taille: 19 },
      { x: 439, y: 1364, texte: "NON", taille: 19 },
      { x: 494, y: 1472, texte: "Oui", taille: 19 },
    ],
  };
}

// ---------------------------------------------------------------- 5. Procedure FAB PM
function fabPm(): DiagrammeProc {
  const m1 = noeud("m1", "arrondi", 225, 222, 689, 287, ["Réception matière première"]);
  const m2 = noeud("m2", "rect", 214, 311, 706, 393, ["Contrôler l’hygiène et la désinfection des", "équipements"]);
  const m3 = noeud("m3", "losange", 187, 424, 467, 501, ["N&D conforme ?"], { taille: 15 });
  const m4 = noeud("m4", "rect", 589, 424, 707, 504, ["Réaliser", "le PND"]);
  const m5 = noeud("m5", "rect", 223, 546, 747, 608, ["S’équiper des EPI"]);
  const m6 = noeud("m6", "rect", 223, 639, 747, 698, ["Vérifier le matériel"]);
  const m7 = noeud("m7", "losange", 176, 759, 455, 837, ["Appareil fonctionnel ?"], { taille: 15 });
  const m8 = noeud("m8", "rect", 504, 759, 752, 848, ["Procédure de", "maintenance P&C"], { taille: 20 });
  const m9 = noeud("m9", "rect", 227, 909, 752, 967, ["Réaliser la fabrication des vracs"]);
  const m10 = noeud("m10", "rect", 226, 1008, 751, 1065, ["Prélever un échantillon"]);
  const m11 = noeud("m11", "rect", 227, 1121, 752, 1178, ["Déposer un l’échantillon au laboratoire"]);
  const m12 = noeud("m12", "losange", 221, 1222, 466, 1298, ["Echantillon conforme ?"], { taille: 15 });
  const m13 = noeud("m13", "rect", 503, 1211, 763, 1312, ["Procédure de", "maitrise des PNC"], { taille: 20 });
  const m14 = noeud("m14", "rect", 227, 1353, 733, 1412, ["Mettre à disposition du conditionnement le lot"]);
  const m15 = noeud("m15", "rect", 224, 1449, 733, 1510, ["Evacuer les déchets"], { taille: 19 });
  const m16 = noeud("m16", "arrondi", 226, 1548, 735, 1609, ["Nettoyer et Désinfecter les équipements"], { taille: 19 });
  return {
    cle: "fab-pm",
    titre: "Procédure FAB PM",
    theme: "noir",
    taille: 18,
    vue: [150, 200, 650, 1430],
    noeuds: [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16],
    liens: [
      fl([467, m1.y2], [467, m2.y1]),
      fl([cx(m3), m2.y2], [cx(m3), m3.y1]),
      fl([m3.x2, cy(m3)], [m4.x1, cy(m3)]),
      fl([m4.x2, cy(m3)], [749, cy(m3)], [749, 355], [m2.x2, 355]),
      fl([cx(m3), m3.y2], [cx(m3), m5.y1]),
      fl([470, m5.y2], [470, m6.y1]),
      fl([313, m6.y2], [313, m7.y1]),
      fl([m7.x2, cy(m7)], [m8.x1, cy(m7)]),
      fl([cx(m7), m7.y2], [cx(m7), m9.y1]),
      fl([470, m9.y2], [470, m10.y1]),
      fl([475, m10.y2], [475, m11.y1]),
      fl([346, m11.y2], [346, m12.y1]),
      fl([m12.x2, cy(m12)], [m13.x1, cy(m12)]),
      fl([cx(m12), m12.y2], [cx(m12), m14.y1]),
      fl([467, m14.y2], [467, m15.y1]),
      fl([467, m15.y2], [467, m16.y1]),
    ],
    etiquettes: [
      { x: 446, y: 439, texte: "Non", taille: 18 },
      { x: 267, y: 513, texte: "Oui", taille: 18 },
      { x: 446, y: 771, texte: "Non", taille: 18 },
      { x: 254, y: 863, texte: "Oui", taille: 18 },
      { x: 462, y: 1240, texte: "Non", taille: 18 },
      { x: 251, y: 1310, texte: "Oui", taille: 18 },
    ],
  };
}

// ---------------------------------------------------------------- 6. Procedure FAB PA
function fabPa(): DiagrammeProc {
  const a1 = noeud("a1", "ellipse", 311, 263, 810, 335, ["Bon de commande"], { taille: 22 });
  const a2 = noeud("a2", "arrondi", 250, 397, 472, 463, ["Réception MPL"], { taille: 24 });
  const a3 = noeud("a3", "arrondi", 658, 397, 870, 463, ["Réception MPS"], { taille: 24 });
  const a4 = noeud("a4", "losange", 205, 520, 501, 676, ["Livraison", "conforme ?"], { taille: 20 });
  const a5 = noeud("a5", "losange", 635, 518, 930, 682, ["Livraison", "conforme ?"], { taille: 20 });
  const a6 = noeud("a6", "arrondi", 397, 794, 700, 866, ["Fabrication"], { taille: 26 });
  const a7 = noeud("a7", "arrondi", 413, 923, 699, 996, ["Echantillon"], { taille: 26 });
  const a8 = noeud("a8", "losange", 389, 1058, 692, 1227, ["Test", "conforme ?"], { taille: 20 });
  const a9 = noeud("a9", "arrondi", 741, 1075, 1002, 1230, ["Procédure de", "gestion des", "produits NC"], { taille: 25 });
  const a10 = noeud("a10", "arrondi", 315, 1278, 918, 1351, ["Vidange"], { taille: 26 });
  const a11 = noeud("a11", "arrondi", 375, 1406, 716, 1479, ["Etiquetage"], { taille: 26 });
  const a12 = noeud("a12", "ellipse", 269, 1535, 822, 1667, ["Mise à disposition au service", "conditionnement"], { taille: 24 });
  return {
    cle: "fab-pa",
    titre: "Procédure FAB PA",
    theme: "noir",
    taille: 24,
    vue: [190, 245, 840, 1440],
    noeuds: [a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12],
    liens: [
      fl([413, 330], [358, 395]),
      fl([722, 330], [763, 395]),
      fl([cx(a4), a2.y2], [cx(a4), a4.y1]),
      fl([cx(a5), a3.y2], [cx(a5), a5.y1]),
      fl([a4.x2, cy(a4)], [557, cy(a4)], [557, 430], [a2.x2, 430]),
      fl([a5.x2, cy(a5)], [1000, cy(a5)], [1000, 428], [a3.x2, 428]),
      trait([cx(a4), a4.y2], [cx(a4), 732], [cx(a5), 732], [cx(a5), a5.y2]),
      fl([546, 732], [546, a6.y1]),
      fl([546, a6.y2], [546, a7.y1]),
      fl([541, a7.y2], [541, a8.y1]),
      fl([a8.x2, cy(a8)], [a9.x1, cy(a8)]),
      fl([cx(a8), a8.y2], [cx(a8), a10.y1]),
      fl([546, a10.y2], [546, a11.y1]),
      fl([545, a11.y2], [545, a12.y1]),
    ],
    etiquettes: [
      { x: 469, y: 538, texte: "Non", taille: 24 },
      { x: 414, y: 703, texte: "Oui", taille: 24 },
      { x: 951, y: 570, texte: "Non", taille: 24 },
      { x: 698, y: 711, texte: "Oui", taille: 24 },
      { x: 694, y: 1095, texte: "Non", taille: 24 },
      { x: 608, y: 1255, texte: "Oui", taille: 24 },
    ],
  };
}

// ---------------------------------------------------------------- 7. Procedure de pesage
function pesage(): DiagrammeProc {
  const p1 = noeud("p1", "arrondi", 182, 283, 646, 348, ["Réception matière première"]);
  const p2 = noeud("p2", "rect", 181, 380, 646, 442, ["Contrôler la quantité de la matière première"], { taille: 18 });
  const p3 = noeud("p3", "losange", 113, 480, 351, 548, ["Quantité conforme ?"], { taille: 14.5 });
  const p4 = noeud("p4", "rect", 399, 477, 646, 565, ["Demander le", "complément au DMP"], { taille: 19 });
  const p5 = noeud("p5", "rect", 174, 591, 638, 653, ["Contrôler la qualité de la matière première"], { taille: 18 });
  const p6 = noeud("p6", "losange", 104, 683, 366, 756, ["Qualité conforme ?"], { taille: 14.5 });
  const p7 = noeud("p7", "rect", 406, 682, 652, 769, ["Procédure de gestion", "des Non-conformités"], { taille: 18 });
  const p8 = noeud("p8", "rect", 169, 798, 634, 860, ["Calibrer le matériel de pesage"], { taille: 18 });
  const p9 = noeud("p9", "losange", 110, 889, 358, 965, ["Calibrage conforme ?"], { taille: 14.5 });
  const p10 = noeud("p10", "rect", 389, 881, 653, 970, ["Procédure de", "maintenance P&C"], { taille: 20 });
  const p11 = noeud("p11", "rect", 179, 1038, 644, 1130, ["Pesée la matière première par lot de", "fabrication de vrac"], { taille: 18 });
  const p12 = noeud("p12", "rect", 178, 1158, 642, 1219, ["Contrôler la pesée"], { taille: 18 });
  const p13 = noeud("p13", "losange", 270, 1238, 516, 1314, ["Pesée conforme ?"], { taille: 14.5 });
  const p14 = noeud("p14", "rect", 172, 1336, 637, 1393, ["Consigner les résultats"], { taille: 18 });
  const p15 = noeud("p15", "arrondi", 142, 1443, 651, 1503, ["Mettre à disposition du conditionnement le lot"], { taille: 18 });
  return {
    cle: "pesage",
    titre: "Procédure de pesage",
    theme: "noir",
    taille: 18,
    vue: [80, 260, 640, 1270],
    noeuds: [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15],
    liens: [
      fl([410, p1.y2], [410, p2.y1]),
      fl([406, p2.y2], [406, 460], [cx(p3), 460], [cx(p3), p3.y1]),
      fl([p3.x2, cy(p3)], [p4.x1, cy(p3)]),
      fl([p4.x2, cy(p3)], [682, cy(p3)], [682, 324], [p1.x2, 324]),
      fl([cx(p3), p3.y2], [cx(p3), 563], [383, 563], [383, p5.y1]),
      fl([406, p5.y2], [406, 662], [cx(p6), 662], [cx(p6), p6.y1]),
      fl([p6.x2, cy(p6)], [p7.x1, cy(p6)]),
      fl([cx(p6), p6.y2], [cx(p6), 775], [385, 775], [385, p8.y1]),
      fl([406, p8.y2], [406, 868], [cx(p9), 868], [cx(p9), p9.y1]),
      fl([p9.x2, cy(p9)], [p10.x1, cy(p9)]),
      fl([cx(p9), p9.y2], [cx(p9), 983], [385, 983], [385, p11.y1]),
      fl([390, p11.y2], [390, p12.y1]),
      fl([p13.x2, cy(p13)], [683, cy(p13)], [683, 1099], [p11.x2, 1099]),
      fl([390, p12.y2], [390, p13.y1]),
      fl([cx(p13), p13.y2], [cx(p13), p14.y1]),
      fl([393, p14.y2], [393, p15.y1]),
    ],
    etiquettes: [
      { x: 324, y: 488, texte: "Non", taille: 18 },
      { x: 182, y: 575, texte: "Oui", taille: 18 },
      { x: 351, y: 691, texte: "Non", taille: 18 },
      { x: 183, y: 778, texte: "Oui", taille: 18 },
      { x: 324, y: 908, texte: "Non", taille: 18 },
      { x: 172, y: 982, texte: "Oui", taille: 18 },
    ],
  };
}

// Ordre de presentation : celui dans lequel les schemas ont ete envoyes
export const PROCEDURES: DiagrammeProc[] = [
  processusGlobal(),
  conditionnement(),
  fabHps(),
  fabGelD(),
  fabPm(),
  fabPa(),
  pesage(),
];
