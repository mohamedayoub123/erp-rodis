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
      "/clients",
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
      { href: "/clients", label: "Client", pageKey: "clients" },
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
    label: "Production",
    pageKey: "productionHub",
    matchPrefixes: [
      "/production",
      "/programe-par-ligne",
      "/historique-programme",
      "/historique-programme-dispatcher",
      "/ravitailleur-par-ligne",
      "/code-par-article",
      "/depots",
      "/produit",
    ],
    subLinks: [
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
      { href: "/production/rapport", label: "Rapport", pageKey: "productionRapportHub" },
      { href: "/production/machines", label: "Machines", pageKey: "machines" },
      { href: "/depots", label: "Entrepot", pageKey: "depots" },
      { href: "/produit", label: "Produit", pageKey: "produit" },
    ],
  },
  {
    href: "/qualite",
    label: "Qualite",
    pageKey: "qualiteHub",
    matchPrefixes: ["/qualite"],
    subLinks: [],
  },
  { href: "/admin", label: "Admin", adminOnly: true },
];

// Une section (hub + sous-pages) est visible des qu'on voit le hub LUI-MEME
// OU au moins une des pages a l'interieur.
export function isSectionVisible(pageKey: string, pageViewMap: Record<string, boolean>): boolean {
  if (pageViewMap[pageKey]) return true;

  const item = navItems.find((navItem) => navItem.pageKey === pageKey);
  return (item?.subLinks ?? []).some((link) => link.pageKey && pageViewMap[link.pageKey]);
}
