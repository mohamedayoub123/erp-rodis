import {
  COMPTE_ACHAT_MP,
  COMPTE_CLIENTS,
  COMPTE_EN_COURS_PRODUCTION,
  COMPTE_FOURNISSEURS,
  COMPTE_PERTES_STOCK,
  COMPTE_STOCK_MP,
  COMPTE_STOCK_PRODUIT_FINI,
  COMPTE_VARIATION_STOCK_MP,
  COMPTE_VARIATION_STOCK_PF,
  COMPTE_VENTES,
} from "@/lib/comptabilite";

// Structure des etats financiers SYSCOHADA (systeme normal, revise) -
// rubriques standard dans leur ordre officiel, chacune reliee aux comptes du
// plan comptable qui existent reellement aujourd'hui (10 comptes). Une
// rubrique sans compte reel branche reste affichee a 0 (structure complete,
// pas une liste ad hoc) - c'est normal pour un etat financier (contrairement
// a un cout de production, "0 immobilisation" est une vraie valeur, jamais
// une valeur devinee/manquante a signaler).

export type SoldeByCode = Map<string, number>; // code compte -> solde (debit - credit)

function soldeDebiteur(soldes: SoldeByCode, codes: string[]) {
  return codes.reduce((sum, code) => sum + (soldes.get(code) ?? 0), 0);
}

// Compte "naturellement crediteur" (Fournisseurs, Ventes...) : le solde
// (debit-credit) y est negatif en usage normal - on l'inverse pour afficher
// une valeur positive dans sa rubrique naturelle (Passif, Produits).
function soldeCrediteur(soldes: SoldeByCode, codes: string[]) {
  return -soldeDebiteur(soldes, codes);
}

export type LigneEtat = {
  libelle: string;
  montant: number | null; // null = rubrique sans compte branche pour l'instant (jamais devine, juste pas encore suivie)
  isSousTotal?: boolean;
  isTotal?: boolean;
  indent?: boolean;
};

export type CompteResultatResult = {
  produitsExploitation: LigneEtat[];
  totalProduitsExploitation: number;
  chargesExploitation: LigneEtat[];
  totalChargesExploitation: number;
  resultatExploitation: number;
  resultatFinancier: number;
  resultatActivitesOrdinaires: number;
  resultatHao: number;
  resultatNet: number;
};

export function computeCompteResultat(soldes: SoldeByCode): CompteResultatResult {
  const ventesPf = soldeCrediteur(soldes, [COMPTE_VENTES]);
  const productionStockee = soldeCrediteur(soldes, [COMPTE_VARIATION_STOCK_PF]);

  const produitsExploitation: LigneEtat[] = [
    { libelle: "Ventes de produits fabriques", montant: ventesPf },
    { libelle: "Production stockee (ou destockage)", montant: productionStockee },
    { libelle: "Production immobilisee", montant: null },
    { libelle: "Produits accessoires", montant: null },
  ];
  const totalProduitsExploitation = ventesPf + productionStockee;

  const achatsMp = soldeDebiteur(soldes, [COMPTE_ACHAT_MP]);
  const variationStockMp = soldeDebiteur(soldes, [COMPTE_VARIATION_STOCK_MP]);
  const autresCharges = soldeDebiteur(soldes, [COMPTE_PERTES_STOCK]);

  const chargesExploitation: LigneEtat[] = [
    { libelle: "Achats de matieres premieres et fournitures liees", montant: achatsMp },
    { libelle: "Variation de stocks de matieres premieres", montant: variationStockMp },
    { libelle: "Transports", montant: null },
    { libelle: "Services exterieurs", montant: null },
    { libelle: "Impots et taxes", montant: null },
    { libelle: "Autres charges (dont pertes sur stock)", montant: autresCharges },
    { libelle: "Charges de personnel", montant: null },
  ];
  const totalChargesExploitation = achatsMp + variationStockMp + autresCharges;

  const resultatExploitation = totalProduitsExploitation - totalChargesExploitation;
  const resultatFinancier = 0;
  const resultatActivitesOrdinaires = resultatExploitation + resultatFinancier;
  const resultatHao = 0;
  const resultatNet = resultatActivitesOrdinaires + resultatHao;

  return {
    produitsExploitation,
    totalProduitsExploitation,
    chargesExploitation,
    totalChargesExploitation,
    resultatExploitation,
    resultatFinancier,
    resultatActivitesOrdinaires,
    resultatHao,
    resultatNet,
  };
}

export type BilanResult = {
  actifImmobilise: LigneEtat[];
  totalActifImmobilise: number;
  actifCirculant: LigneEtat[];
  totalActifCirculant: number;
  tresorerieActif: LigneEtat[];
  totalTresorerieActif: number;
  totalActif: number;

  capitauxPropres: LigneEtat[];
  totalCapitauxPropres: number;
  dettesFinancieres: LigneEtat[];
  totalDettesFinancieres: number;
  passifCirculant: LigneEtat[];
  totalPassifCirculant: number;
  tresoreriePassif: LigneEtat[];
  totalTresoreriePassif: number;
  totalPassif: number;
};

// resultatNet vient du Compte de Resultat (computeCompteResultat) - le Bilan
// ne le recalcule pas lui-meme, pour ne jamais avoir 2 calculs qui pourraient
// diverger. Total Actif = Total Passif est garanti par construction (meme
// grand livre en partie double des 2 cotes), verifie a l'affichage.
export function computeBilan(soldes: SoldeByCode, resultatNet: number): BilanResult {
  const stockMp = soldeDebiteur(soldes, [COMPTE_STOCK_MP]);
  const enCours = soldeDebiteur(soldes, [COMPTE_EN_COURS_PRODUCTION]);
  const stockPf = soldeDebiteur(soldes, [COMPTE_STOCK_PRODUIT_FINI]);
  const clients = soldeDebiteur(soldes, [COMPTE_CLIENTS]);

  const actifImmobilise: LigneEtat[] = [
    { libelle: "Immobilisations incorporelles", montant: null },
    { libelle: "Immobilisations corporelles", montant: null },
    { libelle: "Immobilisations financieres", montant: null },
  ];
  const totalActifImmobilise = 0;

  const actifCirculant: LigneEtat[] = [
    { libelle: "Stock de matieres premieres", montant: stockMp, indent: true },
    { libelle: "En-cours de production", montant: enCours, indent: true },
    { libelle: "Stock de produits finis", montant: stockPf, indent: true },
    { libelle: "Clients", montant: clients, indent: true },
    { libelle: "Autres creances", montant: null, indent: true },
  ];
  const totalActifCirculant = stockMp + enCours + stockPf + clients;

  const tresorerieActif: LigneEtat[] = [
    { libelle: "Banques, cheques postaux, caisse", montant: null },
  ];
  const totalTresorerieActif = 0;

  const totalActif = totalActifImmobilise + totalActifCirculant + totalTresorerieActif;

  const fournisseurs = soldeCrediteur(soldes, [COMPTE_FOURNISSEURS]);

  const capitauxPropres: LigneEtat[] = [
    { libelle: "Capital", montant: null, indent: true },
    { libelle: "Reserves et report a nouveau", montant: null, indent: true },
    { libelle: "Resultat net de l'exercice", montant: resultatNet, indent: true },
  ];
  const totalCapitauxPropres = resultatNet;

  const dettesFinancieres: LigneEtat[] = [
    { libelle: "Emprunts et dettes financieres", montant: null },
  ];
  const totalDettesFinancieres = 0;

  const passifCirculant: LigneEtat[] = [
    { libelle: "Fournisseurs d'exploitation", montant: fournisseurs, indent: true },
    { libelle: "Dettes fiscales et sociales", montant: null, indent: true },
    { libelle: "Autres dettes", montant: null, indent: true },
  ];
  const totalPassifCirculant = fournisseurs;

  const tresoreriePassif: LigneEtat[] = [
    { libelle: "Banques, credits de tresorerie", montant: null },
  ];
  const totalTresoreriePassif = 0;

  const totalPassif = totalCapitauxPropres + totalDettesFinancieres + totalPassifCirculant + totalTresoreriePassif;

  return {
    actifImmobilise,
    totalActifImmobilise,
    actifCirculant,
    totalActifCirculant,
    tresorerieActif,
    totalTresorerieActif,
    totalActif,
    capitauxPropres,
    totalCapitauxPropres,
    dettesFinancieres,
    totalDettesFinancieres,
    passifCirculant,
    totalPassifCirculant,
    tresoreriePassif,
    totalTresoreriePassif,
    totalPassif,
  };
}
