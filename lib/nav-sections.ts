// Donnees partagees entre la barre de navigation (global-nav.tsx) et les
// tuiles de la page d'accueil (app/page.tsx) - un seul endroit pour savoir
// quelles sous-pages appartiennent a quelle section, pour eviter que les
// deux se desynchronisent (bug reel : ismail avait acces a "Articles
// Produit Fini" mais pas au hub "Accueil Gestion Stock PF", et perdait tout
// l'onglet/la tuile alors qu'il avait bien acces a une page a l'interieur).
export type NavItem = {
  href: string;
  label: string;
  pageKey?: string;
  adminOnly?: boolean;
  matchPrefixes?: string[];
  subLinks?: { href: string; label: string; pageKey?: string }[];
};

export const navItems: NavItem[] = [
  { href: "/", label: "Accueil" },
  {
    href: "/gestion-stock-pf",
    label: "Gestion Stock PF",
    pageKey: "gestionStockPf",
    matchPrefixes: [
      "/gestion-stock-pf",
      "/stock",
      "/articles",
      "/mouvements",
      "/commandes",
      "/tableau-commandes",
      "/stock-dormant",
      "/stock-dormant-sans-commande",
      "/statistique",
      "/statistique-livraison",
      "/statistique-livraison-client",
    ],
    subLinks: [
      { href: "/stock", label: "Stock", pageKey: "stock" },
      { href: "/stock/rapport", label: "Rapport", pageKey: "stockRapportPf" },
      { href: "/articles", label: "Articles", pageKey: "articlesHub" },
      { href: "/mouvements", label: "Mouvements", pageKey: "mouvementsHub" },
      { href: "/commandes", label: "Commandes", pageKey: "commandesListe" },
      { href: "/tableau-commandes", label: "Tableau cmd", pageKey: "tableauCommandes" },
      { href: "/stock-dormant", label: "Dormant", pageKey: "stockDormant" },
      {
        href: "/stock-dormant-sans-commande",
        label: "Dormant sans cmd",
        pageKey: "stockDormantSansCommande",
      },
      { href: "/statistique", label: "Statistique", pageKey: "statistiqueHub" },
    ],
  },
  {
    href: "/stock/matiere-premiere",
    label: "Gestion Stock MP",
    pageKey: "stockMatierePremiere",
    matchPrefixes: [
      "/stock/matiere-premiere",
      "/mouvements/matiere-premiere",
      "/articles/matiere-premiere",
    ],
    subLinks: [
      { href: "/stock/matiere-premiere/stock", label: "Stock", pageKey: "stockMatierePremiere" },
      {
        href: "/articles/matiere-premiere",
        label: "Articles",
        pageKey: "articlesMatierePremiere",
      },
      {
        href: "/mouvements/matiere-premiere",
        label: "Mouvements",
        pageKey: "mouvementsMatierePremiere",
      },
      { href: "/stock/matiere-premiere/alerte", label: "Stock Alert", pageKey: "stockAlerteMp" },
      { href: "/stock/matiere-premiere/rapport", label: "Rapport", pageKey: "stockRapportMp" },
      { href: "/stock/matiere-premiere/dormant", label: "Stock Dormant", pageKey: "stockDormantMp" },
      { href: "/stock/matiere-premiere/statistique", label: "Statistique", pageKey: "statistiqueMp" },
      { href: "/stock/matiere-premiere/perime", label: "Stock Perime", pageKey: "stockPerimeMp" },
      { href: "/stock/matiere-premiere/commande", label: "Import", pageKey: "commandeMp" },
      { href: "/stock/matiere-premiere/bc", label: "Commande", pageKey: "commandeBcMp" },
    ],
  },
  {
    href: "/production",
    label: "Production Cosmetique",
    pageKey: "productionHub",
    matchPrefixes: [
      "/production",
      "/programe-par-ligne",
      "/historique-programme",
      "/historique-programme-dispatcher",
      "/ravitailleur-par-ligne",
      "/code-par-article",
    ],
    subLinks: [
      { href: "/production/programme", label: "Programme", pageKey: "programme" },
      { href: "/production/suivi", label: "Planning Production", pageKey: "productionSuiviHub" },
      {
        href: "/production/suivi-production",
        label: "Suivi Production",
        pageKey: "productionSuiviProductionListe",
      },
      { href: "/programe-par-ligne", label: "Programme par ligne", pageKey: "programeParLigne" },
      { href: "/historique-programme", label: "Historique programme", pageKey: "historiqueProgramme" },
      {
        href: "/ravitailleur-par-ligne",
        label: "Ravitailleur par ligne",
        pageKey: "ravitailleurParLigne",
      },
      {
        href: "/historique-programme-dispatcher",
        label: "Historique Programme Dispatcher",
        pageKey: "historiqueProgrammeDispatcher",
      },
      { href: "/code-par-article", label: "Code par article", pageKey: "codeParArticle" },
      {
        href: "/historique-matiere-utilisee",
        label: "Historique Matiere Utilisee",
        pageKey: "historiqueMatiereUtilisee",
      },
      { href: "/production/rapport", label: "Rapport", pageKey: "productionRapportHub" },
      { href: "/production/machines", label: "Equipements", pageKey: "machines" },
      { href: "/production/recette-fabrication", label: "Recette Fabrication", pageKey: "recetteFabrication" },
      {
        href: "/production/recette-conditionnement",
        label: "Recette Conditionnement",
        pageKey: "recetteConditionnement",
      },
      {
        href: "/production/retours-conditionnement",
        label: "Retours Conditionnement",
        pageKey: "retoursConditionnement",
      },
    ],
  },
  {
    href: "/production-plastique",
    label: "Production Plastique",
    pageKey: "productionPlastique",
    matchPrefixes: ["/production-plastique"],
    subLinks: [
      { href: "/production-plastique/articles", label: "Articles", pageKey: "productionPlastique" },
      { href: "/production-plastique/recettes", label: "Recette Plastique", pageKey: "productionPlastique" },
      { href: "/production-plastique/programme", label: "Ajouter Programme", pageKey: "productionPlastique" },
      {
        href: "/production-plastique/historique-matiere",
        label: "Historique Matiere",
        pageKey: "productionPlastique",
      },
      { href: "/production-plastique/statistique", label: "Statistique", pageKey: "productionPlastique" },
      { href: "/production-plastique/commandes", label: "Commandes", pageKey: "productionPlastique" },
    ],
  },
  {
    href: "/produit",
    label: "Produit",
    pageKey: "produit",
    matchPrefixes: ["/produit"],
    subLinks: [],
  },
  {
    href: "/depots",
    label: "Entrepot",
    pageKey: "depots",
    matchPrefixes: ["/depots"],
    subLinks: [
      { href: "/depots/transfer-order", label: "Transfer Order" },
      { href: "/depots/invoice-order", label: "Transfer Invoice" },
    ],
  },
  {
    href: "/qualite",
    label: "Qualite",
    pageKey: "qualiteHub",
    matchPrefixes: ["/qualite"],
    subLinks: [
      { href: "/qualite/specs", label: "Specs Labo (Vrac)", pageKey: "qualiteSpecs" },
      { href: "/qualite/rapport", label: "Rapport Test labo", pageKey: "qualiteRapport" },
      { href: "/qualite/historique-test-labo", label: "Historique Test labo", pageKey: "qualiteHistoriqueTestLabo" },
      { href: "/qualite/revue-processus", label: "Revue Processus", pageKey: "qualiteRevueProcessus" },
      { href: "/qualite/nc-confidentiel", label: "NC Confidentiel", pageKey: "qualiteNcConfidentiel" },
      { href: "/qualite/taf-confidentiel", label: "TAF Confidentiel", pageKey: "qualiteTafConfidentiel" },
    ],
  },
  {
    href: "/cout",
    label: "Cout",
    pageKey: "coutHub",
    matchPrefixes: ["/cout", "/charges", "/production/rapport/cout-reel"],
    subLinks: [
      { href: "/charges", label: "Charges mensuelles", pageKey: "chargesHub" },
      { href: "/production/rapport/cout-reel", label: "Cout Reel (piece/gramme)", pageKey: "productionRapportCoutReel" },
    ],
  },
  {
    href: "/comptabilite",
    label: "Comptabilite",
    pageKey: "comptabilite",
    matchPrefixes: ["/comptabilite", "/fournisseurs", "/clients"],
    subLinks: [
      { href: "/comptabilite/balance", label: "Balance des comptes" },
      { href: "/comptabilite/journal", label: "Journal" },
      { href: "/comptabilite/grand-livre", label: "Ecriture comptable" },
      { href: "/comptabilite/plan-comptable", label: "Plan comptable" },
      { href: "/comptabilite/ecriture-manuelle", label: "Ecriture manuelle" },
      { href: "/comptabilite/paie", label: "Paie" },
      { href: "/comptabilite/charges-recurrentes", label: "Charges recurrentes" },
      { href: "/comptabilite/immobilisations", label: "Immobilisations" },
      { href: "/comptabilite/tva", label: "TVA" },
      { href: "/clients", label: "Clients" },
      { href: "/fournisseurs", label: "Fournisseurs" },
      { href: "/comptabilite/prix-vente", label: "Prix de vente" },
      { href: "/comptabilite/bilan", label: "Bilan" },
      { href: "/comptabilite/compte-resultat", label: "Compte de resultat" },
    ],
  },
  {
    href: "/admin",
    label: "Admin",
    adminOnly: true,
    subLinks: [{ href: "/admin/historique", label: "Historique" }],
  },
];

// Une section (hub + sous-pages) est visible des qu'on voit le hub LUI-MEME
// OU au moins une des pages a l'interieur.
export function isSectionVisible(pageKey: string, pageViewMap: Record<string, boolean>): boolean {
  if (pageViewMap[pageKey]) return true;

  const item = navItems.find((navItem) => navItem.pageKey === pageKey);
  return (item?.subLinks ?? []).some((link) => link.pageKey && pageViewMap[link.pageKey]);
}
