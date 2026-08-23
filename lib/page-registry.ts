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
  | "Qualite"
  | "Statistique"
  | "Clients"
  | "General"
  | "Entrepot"
  | "Produit"
  | "ChargesUsine"
  | "Comptabilite"
  | "Fournisseurs"
  | "ProductionPlastique";

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
  Qualite: "Qualite",
  Statistique: "Statistique",
  Clients: "Client",
  General: "General",
  Entrepot: "Entrepot",
  Produit: "Produit",
  ChargesUsine: "Charges Usine",
  Comptabilite: "Comptabilite",
  Fournisseurs: "Fournisseurs",
  ProductionPlastique: "Production Plastique",
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
    key: "stockDelaiCommandesPf",
    module: "Stock",
    label: "Delai commande -> pret PF",
    pathPrefixes: ["/stock/rapport/delai-commandes"],
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
    hasWrite: true,
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
    key: "productionSuiviEnCours",
    module: "Production",
    label: "Suivi par Etape",
    pathPrefixes: ["/production/suivi/en-cours"],
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
  // Cle separee pour le Test labo (sous-page de Fabrication) : un
  // utilisateur peut avoir le droit d'ecrire le Test labo sans avoir celui
  // d'ecrire le rapport Fabrication ("Entrer"), ex: role labo/qualite
  // distinct des chefs de ligne. Meme pathPrefixes que Fabrication - place
  // APRES dans le tableau pour que findPageForPath (longest-match, premier
  // gagnant a egalite) continue de resoudre la vraie route /test-labo via
  // productionSuiviProductionFabrication ; cette entree ne sert qu'a la
  // gestion des droits (page Admin + canWritePageUser), pas au routage.
  {
    key: "productionSuiviProductionTestLabo",
    module: "Production",
    label: "Test labo (ecriture separee de Fabrication)",
    pathPrefixes: ["/production/suivi-production/fabrication"],
    defaultView: false,
    defaultWrite: false,
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
    key: "historiqueMatiereUtilisee",
    module: "Production",
    label: "Historique Matiere Utilisee (par code)",
    pathPrefixes: ["/historique-matiere-utilisee"],
    hasWrite: false,
  },
  {
    key: "retoursConditionnement",
    module: "Production",
    label: "Retours Conditionnement (par PD) - creer un Transfer Order de retour",
    pathPrefixes: ["/production/retours-conditionnement"],
    hasWrite: true,
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
  // depots/produit : portes depuis V2, reserves au compte admin pour le
  // moment (defaultView false) - aucun utilisateur existant n'avait deja
  // acces a ces cles (brand new), donc rien n'est retire a personne. A
  // ouvrir plus tard via l'ecran Admin (ou en repassant defaultView a true)
  // quand le module aura ete valide. Chacune a sa PROPRE section admin
  // (Entrepot, Produit - voir sectionForPage) : demande explicite pour
  // donner l'acces en un seul clic, sans passer par un sous-menu.
  {
    key: "depots",
    module: "Entrepot",
    label: "Entrepot (creer, stock, transferts) - reserve admin pour le moment",
    pathPrefixes: ["/depots"],
    defaultView: false,
  },
  {
    key: "produit",
    module: "Produit",
    label: "Produit (liste unifiee, stock par depot, statistique) - reserve admin pour le moment",
    pathPrefixes: ["/produit"],
    defaultView: false,
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
  {
    key: "productionRapportBalanceMatiere",
    module: "Production",
    label: "Rapport Balance Matiere",
    pathPrefixes: ["/production/rapport/balance-matiere"],
    hasWrite: false,
  },
  {
    key: "productionRapportCarton",
    module: "Production",
    label: "Rapport Carton",
    pathPrefixes: ["/production/rapport/carton"],
    hasWrite: false,
  },
  {
    key: "productionRapportMachinesCapacite",
    module: "Production",
    label: "Rapport Capacite Machines",
    pathPrefixes: ["/production/rapport/machines-capacite"],
    hasWrite: false,
  },
  {
    key: "productionRapportCoutReel",
    module: "Production",
    label: "Rapport Cout Reel (piece/gramme)",
    pathPrefixes: ["/production/rapport/cout-reel"],
    hasWrite: false,
  },
  {
    key: "productionRapportCartonMensuel",
    module: "Production",
    label: "Rapport Carton Mensuel",
    pathPrefixes: ["/production/rapport/carton-mensuel"],
    hasWrite: false,
  },
  {
    key: "productionRapportCartonGamme",
    module: "Production",
    label: "Rapport Carton par Gamme",
    pathPrefixes: ["/production/rapport/carton-gamme"],
    hasWrite: false,
  },
  {
    key: "productionRapportDechets",
    module: "Production",
    label: "Rapport Dechets",
    pathPrefixes: ["/production/rapport/dechets"],
    hasWrite: false,
  },
  {
    key: "productionRapportFluxCode",
    module: "Production",
    label: "Flux par Code (PL/PD/TO/TI/TE/TS/proforma)",
    pathPrefixes: ["/production/rapport/flux-code"],
    hasWrite: false,
    defaultView: false,
    defaultWrite: false,
  },

  // Qualite
  {
    key: "qualiteHub",
    module: "Qualite",
    label: "Accueil Qualite",
    pathPrefixes: ["/qualite"],
    hasWrite: false,
  },
  {
    key: "qualiteSpecs",
    module: "Qualite",
    label: "Specs Labo Vrac (pH, viscosite, densite, degre alcool, stabilite, couleur)",
    pathPrefixes: ["/qualite/specs"],
  },
  {
    key: "qualiteRapport",
    module: "Qualite",
    label: "Rapport Test labo (preparations, conforme/non conforme, derogations)",
    pathPrefixes: ["/qualite/rapport"],
    hasWrite: false,
  },
  {
    key: "qualiteHistoriqueTestLabo",
    module: "Qualite",
    label: "Historique Test labo (toutes les valeurs mesurees par test)",
    pathPrefixes: ["/qualite/historique-test-labo"],
    hasWrite: false,
  },
  {
    key: "qualiteRevueProcessus",
    module: "Qualite",
    label: "Revue Processus (PR4 - indicateurs, saisie manuelle mois anciens)",
    pathPrefixes: ["/qualite/revue-processus"],
  },
  {
    key: "qualiteNcConfidentiel",
    module: "Qualite",
    label: "NC Confidentiel (audit interne)",
    pathPrefixes: ["/qualite/nc-confidentiel"],
    defaultView: false,
    defaultWrite: false,
  },
  {
    key: "qualiteTafConfidentiel",
    module: "Qualite",
    label: "TAF Confidentiel (audit interne)",
    pathPrefixes: ["/qualite/taf-confidentiel"],
    defaultView: false,
    defaultWrite: false,
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
  // Contient des salaires - defaultView: false (contrairement aux autres
  // pages "General" ci-dessus) : reserve aux comptes qui l'ont explicitement.
  // (defaultView omis seul ne suffit pas : le fallback general est
  // "page.defaultView ?? true", donc l'omission donnait view:true a tout le
  // monde par defaut - corrige ici.)
  {
    key: "chargesHub",
    module: "ChargesUsine",
    label: "Charges Usine",
    pathPrefixes: ["/charges"],
    defaultView: false,
  },
  // Page d'accueil "Cout" (tuile accueil) - regroupe Charges Usine (deja
  // ci-dessus) et Cout Reel (Production > Rapport, deja son propre
  // productionRapportCoutReel) sous un seul point d'entree accessible
  // directement depuis Accueil, sans repasser par Production. Meme
  // restriction que chargesHub (contient des couts/salaires).
  {
    key: "coutHub",
    module: "ChargesUsine",
    label: "Cout (accueil - regroupe Charges Usine + Cout Reel)",
    pathPrefixes: ["/cout"],
    hasWrite: false,
    defaultView: false,
  },
  // Module vide pour l'instant (contenu pas encore defini) - cache pour
  // tout le monde par defaut, visible seulement pour l'admin tant qu'aucun
  // acces n'est accorde explicitement ici.
  {
    key: "comptabilite",
    module: "Comptabilite",
    label: "Comptabilite",
    pathPrefixes: ["/comptabilite"],
    defaultView: false,
    defaultWrite: false,
  },
  // Module vide pour l'instant (rien construit encore) - meme convention
  // que Comptabilite au demarrage : cache par defaut, visible seulement
  // pour l'admin tant qu'aucun acces n'est accorde explicitement ici.
  {
    key: "productionPlastique",
    module: "ProductionPlastique",
    label: "Production Plastique",
    pathPrefixes: ["/production-plastique"],
    defaultView: false,
    defaultWrite: false,
  },
  // Fournisseurs (contrepartie de l'ecriture Achat/Fournisseur) - prive par
  // defaut comme Comptabilite.
  {
    key: "fournisseurs",
    module: "Fournisseurs",
    label: "Fournisseurs",
    pathPrefixes: ["/fournisseurs"],
    defaultView: false,
    defaultWrite: false,
  },
];

// Regroupement affiche dans l'admin (Gestion Stock PF / Gestion Stock MP /
// Production) - independant du ModuleKey ci-dessus, car les pages "matiere
// premiere" partagent le meme module que leur equivalent produit fini
// (ex: stockMatierePremiere est module "Stock" comme "stock") mais doivent
// apparaitre sous Gestion Stock MP, pas Gestion Stock PF.
export type AdminSection =
  | "GestionStockPf"
  | "GestionStockMp"
  | "Production"
  | "Qualite"
  | "Entrepot"
  | "Produit"
  | "ChargesUsine"
  | "Comptabilite"
  | "Autre";

export const ADMIN_SECTION_LABELS: Record<AdminSection, string> = {
  GestionStockPf: "Gestion Stock PF",
  GestionStockMp: "Gestion Stock MP",
  Production: "Production",
  Qualite: "Qualite",
  Entrepot: "Entrepot",
  Produit: "Produit",
  ChargesUsine: "Charges Usine",
  Comptabilite: "Comptabilite",
  Autre: "Autre",
};

// Entrepot/Produit/Charges Usine ont leur PROPRE section admin (pas nichees
// dans Production/Autre) : demande explicite pour donner l'acces en un
// clic, sans passer par un sous-menu. Comptabilite pareil (module a part).
export const ADMIN_SECTION_ORDER: AdminSection[] = [
  "GestionStockPf",
  "GestionStockMp",
  "Production",
  "Qualite",
  "Entrepot",
  "Produit",
  "ChargesUsine",
  "Comptabilite",
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
  if (page.module === "Entrepot") return "Entrepot";
  if (page.module === "Produit") return "Produit";
  if (page.module === "ChargesUsine") return "ChargesUsine";
  if (page.module === "Comptabilite" || page.module === "Fournisseurs") return "Comptabilite";
  if (page.module === "Production") return "Production";
  if (page.module === "Qualite") return "Qualite";
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
