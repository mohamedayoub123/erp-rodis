// Source unique de verite pour les permissions par page : l'UI Admin, la
// navigation, et le blocage d'acces par page en derivent tous, au lieu
// d'avoir plusieurs listes dupliquees a la main (ancien probleme).
//
// legacyView/legacyWrite : nom du champ de l'ancien systeme (module) dont on
// herite la valeur au premier passage d'un utilisateur existant dans le
// nouveau systeme, pour ne retirer aucun acces deja accorde. Par defaut
// "view{module}"/"write{module}" si non precise.
export type ModuleKey =
  | "Articles"
  | "Stock"
  | "Commandes"
  | "TableauCommandes"
  | "Dormant"
  | "DormantSansCommande"
  | "Planning"
  | "Mouvements"
  | "Production"
  | "Statistique"
  | "Clients"
  | "General";

export type PageDefinition = {
  key: string;
  module: ModuleKey;
  label: string;
  pathPrefixes: string[];
  hasWrite?: boolean;
  legacyView?: string;
  legacyWrite?: string;
  defaultView?: boolean;
  defaultWrite?: boolean;
};

export const MODULE_LABELS: Record<ModuleKey, string> = {
  Articles: "Articles",
  Stock: "Stock",
  Commandes: "Commandes",
  TableauCommandes: "Tableau cmd",
  Dormant: "Dormant",
  DormantSansCommande: "Dormant sans cmd",
  Planning: "Planning",
  Mouvements: "Mouvements",
  Production: "Production",
  Statistique: "Statistique",
  Clients: "Client",
  General: "General",
};

export const PAGE_REGISTRY: PageDefinition[] = [
  // Articles
  {
    key: "articlesHub",
    module: "Articles",
    label: "Accueil Articles",
    pathPrefixes: ["/articles"],
    hasWrite: false,
  },
  {
    key: "articlesProduitFini",
    module: "Articles",
    label: "Articles Produit Fini (liste + modifier)",
    pathPrefixes: ["/articles/produit-fini"],
    legacyWrite: "editArticles",
  },
  {
    key: "articlesProduitFiniNouvelle",
    module: "Articles",
    label: "Nouvel article",
    pathPrefixes: ["/articles/produit-fini/nouvelle"],
    legacyWrite: "writeArticles",
  },
  {
    key: "articlesMatierePremiere",
    module: "Articles",
    label: "Articles Matiere Premiere (liste + modifier)",
    pathPrefixes: ["/articles/matiere-premiere"],
  },
  {
    key: "articlesMatierePremiereNouvelle",
    module: "Articles",
    label: "Nouvel article matiere premiere",
    pathPrefixes: ["/articles/matiere-premiere/nouvelle"],
  },

  // Stock
  {
    key: "gestionStockPf",
    module: "Stock",
    label: "Accueil Gestion Stock PF",
    pathPrefixes: ["/gestion-stock-pf"],
    hasWrite: false,
  },
  {
    key: "stock",
    module: "Stock",
    label: "Stock (liste, modifier, supprimer)",
    pathPrefixes: ["/stock"],
    legacyWrite: "editStock",
  },
  {
    key: "stockRapportPf",
    module: "Stock",
    label: "Rapport PF (accueil)",
    pathPrefixes: ["/stock/rapport"],
    hasWrite: false,
  },
  {
    key: "stockActuelPf",
    module: "Stock",
    label: "Stock Actuel PF",
    pathPrefixes: ["/stock/stock-actuel"],
    hasWrite: false,
  },
  {
    key: "stockCodePf",
    module: "Stock",
    label: "Stock par Code PF",
    pathPrefixes: ["/stock/rapport/code"],
    hasWrite: false,
  },
  {
    key: "stockMatierePremiere",
    module: "Stock",
    label: "Stock Matiere Premiere",
    pathPrefixes: ["/stock/matiere-premiere"],
    hasWrite: false,
  },
  {
    key: "stockAlerteMp",
    module: "Stock",
    label: "Stock Alert MP",
    pathPrefixes: ["/stock/matiere-premiere/alerte"],
    hasWrite: false,
  },
  {
    key: "stockRapportMp",
    module: "Stock",
    label: "Rapport MP (accueil)",
    pathPrefixes: ["/stock/matiere-premiere/rapport"],
    hasWrite: false,
  },
  {
    key: "stockMinProposeMp",
    module: "Stock",
    label: "Stock Min Propose MP",
    pathPrefixes: ["/stock/matiere-premiere/rapport/stock-min"],
    hasWrite: false,
  },
  {
    key: "stockBesoinCommandeMp",
    module: "Stock",
    label: "Besoin Commande MP",
    pathPrefixes: ["/stock/matiere-premiere/rapport/commande"],
    hasWrite: false,
  },
  {
    key: "stockPropositionCommandeMp",
    module: "Stock",
    label: "Proposition de Commande MP",
    pathPrefixes: ["/stock/matiere-premiere/rapport/proposition"],
    hasWrite: false,
  },
  {
    key: "stockSurstockMp",
    module: "Stock",
    label: "Surstock MP",
    pathPrefixes: ["/stock/matiere-premiere/rapport/surstock"],
    hasWrite: false,
  },
  {
    key: "stockActuelMp",
    module: "Stock",
    label: "Stock Actuel MP",
    pathPrefixes: ["/stock/matiere-premiere/stock-actuel"],
    hasWrite: false,
  },
  {
    key: "stockRotationMp",
    module: "Stock",
    label: "Rotation de Stock MP",
    pathPrefixes: ["/stock/matiere-premiere/rotation"],
    hasWrite: false,
  },
  {
    key: "stockPerimeMp",
    module: "Stock",
    label: "Stock Perime MP (liste + note)",
    pathPrefixes: ["/stock/matiere-premiere/perime"],
  },
  {
    key: "stockDormantMp",
    module: "Stock",
    label: "Stock Dormant MP",
    pathPrefixes: ["/stock/matiere-premiere/dormant"],
    hasWrite: false,
  },
  {
    key: "statistiqueMp",
    module: "Stock",
    label: "Statistique MP",
    pathPrefixes: ["/stock/matiere-premiere/statistique"],
    hasWrite: false,
  },
  {
    key: "commandeMp",
    module: "Stock",
    label: "Import MP (vue calculee, reception, statut dossier)",
    pathPrefixes: ["/stock/matiere-premiere/commande"],
  },
  {
    key: "commandeBcMp",
    module: "Stock",
    label: "Commande MP - BC (liste + modifier)",
    pathPrefixes: ["/stock/matiere-premiere/bc"],
  },
  {
    key: "commandeBcMpNouvelle",
    module: "Stock",
    label: "Nouvelle commande MP - BC",
    pathPrefixes: ["/stock/matiere-premiere/bc/nouvelle"],
  },

  // Commandes
  {
    key: "commandesListe",
    module: "Commandes",
    label: "Commandes (liste)",
    pathPrefixes: ["/commandes"],
    hasWrite: false,
  },
  {
    key: "commandesNouvelle",
    module: "Commandes",
    label: "Nouvelle commande",
    pathPrefixes: ["/commandes/nouvelle"],
    legacyView: "viewCommandes",
    legacyWrite: "writeCommandes",
  },
  {
    key: "commandesDetail",
    module: "Commandes",
    label: "Detail commande (FIFO, livraison, modifier)",
    pathPrefixes: ["/commandes/"],
    legacyView: "viewCommandes",
    legacyWrite: "editCommandes",
  },

  // Tableau commandes
  {
    key: "tableauCommandes",
    module: "TableauCommandes",
    label: "Tableau commandes",
    pathPrefixes: ["/tableau-commandes"],
    hasWrite: false,
  },

  // Dormant
  {
    key: "stockDormant",
    module: "Dormant",
    label: "Stock dormant",
    pathPrefixes: ["/stock-dormant"],
    hasWrite: false,
  },
  {
    key: "articleManquant",
    module: "Dormant",
    label: "Article manquant",
    pathPrefixes: ["/article-manquant"],
    legacyView: "viewDormant",
    legacyWrite: "editDormant",
  },

  // Dormant sans commande
  {
    key: "stockDormantSansCommande",
    module: "DormantSansCommande",
    label: "Stock dormant sans commande",
    pathPrefixes: ["/stock-dormant-sans-commande"],
    hasWrite: false,
  },

  // Planning
  {
    key: "planning",
    module: "Planning",
    label: "Planning",
    pathPrefixes: ["/planning"],
    hasWrite: false,
  },

  // Mouvements
  {
    key: "mouvementsHub",
    module: "Mouvements",
    label: "Accueil Mouvements",
    pathPrefixes: ["/mouvements"],
    hasWrite: false,
  },
  {
    key: "mouvementsProduitFini",
    module: "Mouvements",
    label: "Mouvements Produit Fini (liste, supprimer)",
    pathPrefixes: ["/mouvements/produit-fini"],
    legacyView: "viewMouvements",
    legacyWrite: "editStock",
  },
  {
    key: "mouvementsEntreeProduction",
    module: "Mouvements",
    label: "Entree Production",
    pathPrefixes: ["/mouvements/produit-fini/entree-production"],
    legacyView: "viewMouvements",
    legacyWrite: "writeMouvements",
  },
  {
    key: "mouvementsEntree",
    module: "Mouvements",
    label: "Entrer stock",
    pathPrefixes: ["/mouvements/entree"],
    legacyView: "viewMouvements",
    legacyWrite: "writeMouvements",
  },
  {
    key: "mouvementsSortie",
    module: "Mouvements",
    label: "Sortie stock",
    pathPrefixes: ["/mouvements/sortie"],
    legacyView: "viewMouvements",
    legacyWrite: "writeMouvements",
  },
  {
    key: "mouvementsEntreeDetail",
    module: "Mouvements",
    label: "Detail entree (TE) - modifier/supprimer",
    pathPrefixes: ["/mouvements/entrees"],
    legacyView: "viewMouvements",
    legacyWrite: "editStock",
  },
  {
    key: "mouvementsSortieDetail",
    module: "Mouvements",
    label: "Detail sortie (TS) - modifier/supprimer",
    pathPrefixes: ["/mouvements/sorties"],
    legacyView: "viewMouvements",
    legacyWrite: "editStock",
  },
  {
    key: "mouvementsMatierePremiere",
    module: "Mouvements",
    label: "Mouvements Matiere Premiere (liste, supprimer)",
    pathPrefixes: ["/mouvements/matiere-premiere"],
    legacyView: "viewMouvements",
    legacyWrite: "editStock",
  },
  {
    key: "mouvementsMatierePremiereEntree",
    module: "Mouvements",
    label: "Entrer stock Matiere Premiere",
    pathPrefixes: ["/mouvements/matiere-premiere/entree"],
    legacyView: "viewMouvements",
    legacyWrite: "writeMouvements",
  },
  {
    key: "mouvementsMatierePremiereSortie",
    module: "Mouvements",
    label: "Sortie stock Matiere Premiere",
    pathPrefixes: ["/mouvements/matiere-premiere/sortie"],
    legacyView: "viewMouvements",
    legacyWrite: "writeMouvements",
  },
  {
    key: "mouvementsMatierePremiereSortieAdmin",
    module: "Mouvements",
    label: "Sortie Admin Matiere Premiere (stock force, sans verification)",
    pathPrefixes: ["/mouvements/matiere-premiere/sortie-admin"],
    // Droit distinct, sans heritage de l'ancien "writeMouvements" - a
    // accorder explicitement, meme a un utilisateur qui a deja la sortie
    // normale, car cette page force la sortie sans verification de stock.
    legacyView: "__no_legacy_sortie_admin_mp__",
    legacyWrite: "__no_legacy_sortie_admin_mp__",
    defaultView: false,
    defaultWrite: false,
  },
  {
    key: "mouvementsMatierePremiereEntreeDetail",
    module: "Mouvements",
    label: "Detail entree MP (TE) - modifier/supprimer",
    pathPrefixes: ["/mouvements/matiere-premiere/entrees"],
    legacyView: "viewMouvements",
    legacyWrite: "editStock",
  },
  {
    key: "mouvementsMatierePremiereSortieDetail",
    module: "Mouvements",
    label: "Detail sortie MP (TS) - modifier/supprimer",
    pathPrefixes: ["/mouvements/matiere-premiere/sorties"],
    legacyView: "viewMouvements",
    legacyWrite: "editStock",
  },

  // Production
  {
    key: "productionHub",
    module: "Production",
    label: "Accueil Production",
    pathPrefixes: ["/production"],
    hasWrite: false,
  },
  {
    key: "productionSuiviHub",
    module: "Production",
    label: "Planning Production (accueil)",
    pathPrefixes: ["/production/suivi"],
    hasWrite: false,
  },
  {
    key: "productionSuiviDashboard",
    module: "Production",
    label: "Dashboard Production (Fin programme)",
    pathPrefixes: ["/production/suivi/dashboard"],
  },
  {
    key: "productionSuiviCalendrier",
    module: "Production",
    label: "Calendrier Production",
    pathPrefixes: ["/production/suivi/calendrier"],
    hasWrite: false,
  },
  {
    key: "productionSuiviProductionListe",
    module: "Production",
    label: "Suivi Production (liste, supprimer)",
    pathPrefixes: ["/production/suivi-production"],
    legacyWrite: "editProduction",
  },
  {
    key: "productionSuiviProductionFabrication",
    module: "Production",
    label: "Rapport Fabrication",
    pathPrefixes: ["/production/suivi-production/fabrication"],
  },
  {
    key: "productionSuiviProductionConditionnement",
    module: "Production",
    label: "Rapport Conditionnement",
    pathPrefixes: ["/production/suivi-production/conditionnement"],
  },
  {
    key: "productionSuiviProductionEmballage",
    module: "Production",
    label: "Rapport Emballage",
    pathPrefixes: ["/production/suivi-production/emballage"],
  },
  {
    key: "productionSuiviProductionLegacyDetail",
    module: "Production",
    label: "Rapport Production (ancienne page, sans lien dans l'appli)",
    pathPrefixes: ["/production/suivi-production/__legacy__"],
    defaultView: false,
    defaultWrite: false,
  },
  {
    key: "programeParLigne",
    module: "Production",
    label: "Programme par ligne",
    pathPrefixes: ["/programe-par-ligne"],
  },
  {
    key: "historiqueProgramme",
    module: "Production",
    label: "Historique programme (MB) - supprimer",
    pathPrefixes: ["/historique-programme"],
    legacyWrite: "editProduction",
  },
  {
    key: "ravitailleurParLigne",
    module: "Production",
    label: "Ravitailleur par ligne (Dispatcher, Save, Supprimer, Imprimer)",
    pathPrefixes: ["/ravitailleur-par-ligne"],
  },
  {
    key: "historiqueProgrammeDispatcher",
    module: "Production",
    label: "Historique Programme Dispatcher (PD) - supprimer",
    pathPrefixes: ["/historique-programme-dispatcher"],
    legacyWrite: "editProduction",
  },
  {
    key: "codeParArticle",
    module: "Production",
    label: "Code par article",
    pathPrefixes: ["/code-par-article"],
    legacyWrite: "editArticles",
  },
  {
    key: "productionRapportHub",
    module: "Production",
    label: "Rapport (accueil)",
    pathPrefixes: ["/production/rapport"],
    hasWrite: false,
  },
  {
    key: "programme",
    module: "Production",
    label: "Programme",
    pathPrefixes: ["/production/programme"],
  },
  {
    key: "recetteFabrication",
    module: "Production",
    label: "Recette Fabrication",
    pathPrefixes: ["/production/recette-fabrication"],
  },
  {
    key: "recetteConditionnement",
    module: "Production",
    label: "Recette Conditionnement",
    pathPrefixes: ["/production/recette-conditionnement"],
  },
  {
    key: "machines",
    module: "Production",
    label: "Machines",
    pathPrefixes: ["/production/machines"],
  },
  {
    key: "productionRapportEcarts",
    module: "Production",
    label: "Rapport Ecarts Production - supprimer",
    pathPrefixes: ["/production/rapport/ecarts"],
    legacyWrite: "editProduction",
  },
  {
    key: "productionRapportTempsArret",
    module: "Production",
    label: "Rapport Temps d'Arret",
    pathPrefixes: ["/production/rapport/temps-arret"],
    hasWrite: false,
  },

  // Statistique
  {
    key: "statistiqueHub",
    module: "Statistique",
    label: "Accueil Statistique",
    pathPrefixes: ["/statistique"],
    hasWrite: false,
  },
  {
    key: "historiqueMouvements",
    module: "Statistique",
    label: "Statistique ventes par mois",
    pathPrefixes: ["/historique-mouvements"],
    hasWrite: false,
  },
  {
    key: "statistiqueLivraison",
    module: "Statistique",
    label: "Statistique livraison",
    pathPrefixes: ["/statistique-livraison"],
    hasWrite: false,
  },
  {
    key: "statistiqueLivraisonClient",
    module: "Statistique",
    label: "Statistique livraison client",
    pathPrefixes: ["/statistique-livraison-client"],
    hasWrite: false,
  },

  // Clients
  {
    key: "clients",
    module: "Clients",
    label: "Clients (liste, modifier, supprimer)",
    pathPrefixes: ["/clients"],
    legacyWrite: "editClients",
  },

  // General - pages jusque-la inaccessibles (aucun cas par defaut dans
  // l'ancien controle d'acces), reparees ici : visibles a tout utilisateur
  // connecte, lecture seule.
  {
    key: "generalDashboard",
    module: "General",
    label: "Dashboard",
    pathPrefixes: ["/dashboard"],
    hasWrite: false,
    defaultView: true,
  },
  {
    key: "generalOperations",
    module: "General",
    label: "Operations",
    pathPrefixes: ["/operations"],
    hasWrite: false,
    defaultView: true,
  },
  {
    key: "generalParametres",
    module: "General",
    label: "Parametres",
    pathPrefixes: ["/parametres"],
    hasWrite: false,
    defaultView: true,
  },
  {
    key: "generalFifo",
    module: "General",
    label: "FIFO (resultats)",
    pathPrefixes: ["/fifo"],
    hasWrite: false,
    defaultView: true,
  },
];

// Regroupement affiche dans l'admin (Gestion Stock PF / Gestion Stock MP /
// Production) - independant du ModuleKey ci-dessus, car les pages "matiere
// premiere" partagent le meme module que leur equivalent produit fini
// (ex: stockMatierePremiere est module "Stock" comme "stock") mais doivent
// apparaitre sous Gestion Stock MP, pas Gestion Stock PF.
export type AdminSection = "GestionStockPf" | "GestionStockMp" | "Production" | "Autre";

export const ADMIN_SECTION_LABELS: Record<AdminSection, string> = {
  GestionStockPf: "Gestion Stock PF",
  GestionStockMp: "Gestion Stock MP",
  Production: "Production",
  Autre: "Autre",
};

export const ADMIN_SECTION_ORDER: AdminSection[] = [
  "GestionStockPf",
  "GestionStockMp",
  "Production",
  "Autre",
];

const MATIERE_PREMIERE_PAGE_KEYS = new Set([
  "stockMatierePremiere",
  "stockAlerteMp",
  "stockActuelMp",
  "stockRapportMp",
  "stockRotationMp",
  "stockMinProposeMp",
  "stockBesoinCommandeMp",
  "stockPropositionCommandeMp",
  "stockSurstockMp",
  "stockPerimeMp",
  "stockDormantMp",
  "statistiqueMp",
  "commandeMp",
  "commandeBcMp",
  "commandeBcMpNouvelle",
  "articlesMatierePremiere",
  "articlesMatierePremiereNouvelle",
  "mouvementsMatierePremiere",
  "mouvementsMatierePremiereEntree",
  "mouvementsMatierePremiereSortie",
  "mouvementsMatierePremiereSortieAdmin",
  "mouvementsMatierePremiereEntreeDetail",
  "mouvementsMatierePremiereSortieDetail",
]);

export function sectionForPage(page: PageDefinition): AdminSection {
  if (MATIERE_PREMIERE_PAGE_KEYS.has(page.key)) return "GestionStockMp";
  if (page.module === "Production") return "Production";
  if (page.module === "Planning" || page.module === "General") return "Autre";
  return "GestionStockPf";
}

// Longueur du prefixe le plus specifique qui matche pathname parmi les
// pathPrefixes de "page" - sert de tie-breaker pour le longest-match.
function matchedPrefixLength(page: PageDefinition, pathname: string): number {
  let best = -1;
  for (const prefix of page.pathPrefixes) {
    // Un prefixe qui se termine deja par "/" (ex: commandesDetail,
    // "/commandes/" pour matcher tout /commandes/<id> dynamique) doit
    // matcher directement via startsWith - sinon on testerait
    // pathname.startsWith("/commandes//") avec un double slash, qui ne
    // matche jamais aucune vraie URL et laisse la page detail totalement
    // injoignable (son propre "/commandes/" gagne aussi en longueur sur le
    // "/commandes" de la liste, donc reste bien le plus specifique).
    const matches = prefix.endsWith("/")
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (matches && prefix.length > best) {
      best = prefix.length;
    }
  }
  return best;
}

// Trouve la page dont le prefixe de chemin correspondant est le plus long
// (le plus specifique) - independant de l'ordre de declaration dans
// PAGE_REGISTRY, contrairement a un simple if/else en chaine.
export function findPageForPath(pathname: string): PageDefinition | null {
  let best: PageDefinition | null = null;
  let bestLength = -1;

  for (const page of PAGE_REGISTRY) {
    const length = matchedPrefixLength(page, pathname);
    if (length > bestLength) {
      best = page;
      bestLength = length;
    }
  }

  return best;
}
