// Tableau SWOT du rapport de revue de processus PR4 (texte repris des diapositives d'origine, orthographe conservee).

export type LigneSwot = {
  numero: number;
  theme: string;
  themeGras?: boolean;
  description: string;
  objectif: string;
  // une ligne de texte par action / par outil
  actions: string[];
  outils: string[];
};

export type GroupeSwot = {
  cle: string;
  // texte de la colonne "SWOT" (une ligne par element)
  libelle: string[];
  libelleGras?: boolean;
  fond: string;
  lignes: LigneSwot[];
};

export const GROUPES_SWOT: GroupeSwot[] = [
  {
    cle: "forces",
    libelle: ["Forces"],
    fond: "#e2efda",
    lignes: [
      {
        numero: 1,
        theme: "Documentation bien organisée (Traçabilité et Qualité)",
        description:
          "Un bon système de documentation permet de suivre les étapes de production, les recettes, les règles de qualité et les instructions. Cela aide toute l'équipe à accéder facilement aux informations et assure une bonne traçabilité et une qualité constante.",
        objectif: "Maintenir et améliorer la traçabilité et la qualité grâce à une documentation claire.",
        actions: [
          "Digitaliser les documents pour un accès plus rapide et sécurisé.",
          "Créer un système de mise à jour régulier des documents.",
          "Former les employés sur l'importance de la traçabilité et comment bien utiliser la documentation.",
          "Faire des audits internes pour vérifier que les documents sont bien utilisés.",
        ],
        outils: ["Logiciel de gestion documentaire, dossiers partagés, ERP."],
      },
      {
        numero: 2,
        theme: "Indicateurs de performance clairs (KPI)",
        description:
          "Des indicateurs simples permettent de mesurer l'efficacité et la productivité de nos opérations. Ils offrent une vue d'ensemble sur les performances quotidiennes.",
        objectif: "Améliorer l'efficacité en exploitant les indicateurs de performance.",
        actions: [
          "Analyser régulièrement les KPI ( chaque semaine) et ajuster les actions en fonction.",
          "Mettre en place un tableau de bord visible par toute l'équipe pour suivre les résultats.",
          "Fixer des objectifs clairs en fonction des KPI pour motiver l'équipe.",
          "Récompenser les bonnes performances pour encourager l'amélioration continue.",
        ],
        outils: ["Tableaux de bord, réunion d'analyse rapide, logiciel de suivi des KPI"],
      },
      {
        numero: 3,
        theme: "Suivi quotidien efficace",
        description:
          "Un suivi journalier aide à repérer rapidement les problèmes et à les corriger immédiatement. Cela permet également de prendre des décisions basées sur des données concrètes.",
        objectif: "Renforcer le suivi pour détecter et corriger rapidement les problèmes.",
        actions: [
          "Standardiser le suivi quotidien avec des fiches simples et rapides à remplir.",
          "Organiser un point rapide chaque jour pour analyser les résultats et agir vite.",
          "Mettre en place un plan d'action immédiat en cas de problème détecté.",
          "Améliorer la communication entre les équipes pour assurer une réaction rapide.",
        ],
        outils: ["Rapports de suivi, réunions flash de 5-10 min, fiches de correction rapide."],
      },
    ],
  },
  {
    cle: "faiblesses",
    libelle: ["Faiblesses"],
    libelleGras: true,
    fond: "#fce4d6",
    lignes: [
      {
        numero: 4,
        theme: "Manque de personnel qualifié",
        description: "Il y a un manque de personnel formé pour assurer la production et le contrôle qualité des cosmétiques.",
        objectif: "Avoir une équipe compétente et autonome.",
        actions: ["Recruter du personnel qualifié.", "Organiser des formations régulières.", "Mettre en place un suivi des compétences."],
        outils: ["Plan de formation interne", "demande des nouvelle personnel"],
      },
      {
        numero: 5,
        theme: "Problèmes de livraison entre dépôt article de conditionnement et cosmétique",
        description: "Les matières premières ne sont pas livrées à temps du dépôt vers l'usine de fabrication.",
        objectif: "Avoir toujours les matières premières et les articles de conditionnement à temps.",
        actions: [
          "Mettre en place un planning de livraison interne précis.",
          "Assurer un suivi en temps réel des transferts. Former les équipes logistiques à respecter les délais.",
        ],
        outils: ["Logiciel de gestion des stocks ERP", "Communication améliorée entre dépôt et production"],
      },
      {
        numero: 6,
        theme: "Retards de livraison des cosmétiques sur les chaînes de conditionnement",
        description: "Les article de conditionnement n'arrivent pas à temps sur les lignes de conditionnement.",
        objectif: "Optimiser le flux de production pour éviter les retards.",
        actions: [
          "Planifier les livraisons à l'avance.",
          "Suivre les flux en temps réel.",
          "Mettre en place des solutions alternatives en cas de retard.",
        ],
        outils: [
          "Logiciel de planification de la production",
          "Indicateurs de performance (KPI) pour le suivi des délais",
          "Checklist de contrôle avant l'envoi des produits vers le conditionnement",
        ],
      },
      {
        numero: 7,
        theme: "Plan de nettoyage des équipements et locaux",
        description: "Le nettoyage et la désinfection ne sont pas toujours bien organisés ou respectés.",
        objectif: "Garantir un environnement propre et conforme aux normes.",
        actions: [
          "Créer un planning de nettoyage précis. Vérifier le respect des protocoles.",
          "Former le personnel aux bonnes pratiques d'hygiène.",
        ],
        outils: ["Planning de nettoyage et désinfection avec check-lists"],
      },
    ],
  },
  {
    cle: "menaces",
    libelle: ["Menaces /", "Threats"],
    fond: "#f4b183",
    lignes: [
      {
        numero: 8,
        theme: "Risque de produits défectueux",
        description: "Certains produits peuvent être mal fabriqués ou contaminés ce qui peut poser des problèmes aux clients.",
        objectif: "Réduire au maximum les défauts et garantir des produits conformes.",
        actions: [
          "Mettre en place un contrôle qualité renforcé.",
          "Former les opérateurs sur les bonnes pratiques.",
          "Analyser les causes des défauts et corriger les erreurs.",
        ],
        outils: ["Système de contrôle qualité", "Tests en laboratoire", "Formation du personnel"],
      },
      {
        numero: 9,
        theme: "Départ fréquent des employés",
        description: "d'employés qualifiés quittent l'entreprise, ce qui ralentit la production",
        objectif: "Stabiliser l'équipe et réduire le turn-over.",
        actions: [
          "Améliorer les conditions de travail et les salaires.",
          "Mettre en place des formations et des opportunités de carrière.",
          "Faire des enquêtes internes pour comprendre les raisons des départs.",
        ],
        outils: ["Programme de fidélisation", "Formations internes", "Enquêtes de satisfaction"],
      },
      {
        numero: 10,
        theme: "Risque d'incendie",
        themeGras: true,
        description:
          "Certains produits utilisés (alcool, solvants, encres) sont inflammables. Une mauvaise manipulation ou un stockage incorrect peut provoquer un incendie.",
        objectif: "Sécuriser l'usine et réduire les risques de feu.",
        actions: [
          "Stocker les produits dangereux dans des zones sécurisées.",
          "Installer des extincteurs et alarmes incendie.",
          "Former les employés aux consignes de sécurité.",
        ],
        outils: ["Armoires anti-feu", "Extincteurs et alarmes", "Formation incendie", "systeme de reia"],
      },
      {
        numero: 11,
        theme: "Bouteilles d'encre des machines d'impression",
        description: "L'encre peut être toxique ou fuir, ce qui peut contaminer les produits ou créer des risques pour les employés.",
        objectif: "Assurer un stockage sécurisé et éviter toute fuite",
        actions: [
          "Vérifier régulièrement l'état des bouteilles.",
          "Stocker dans des bacs de rétention.",
          "Équiper les employés de gants et masques adaptés",
        ],
        outils: ["Bacs de rétention", "Équipements de protection", "Inspections régulières"],
      },
      {
        numero: 12,
        theme: "Chiffons de nettoyage avec des produits chimiques",
        description: "Après nettoyage, les chiffons imbibés de produits chimiques peuvent s'enflammer ou causer une pollution.",
        objectif: "Éliminer les chiffons usagés de manière sécurisée.",
        actions: [
          "Mettre en place des conteneurs fermés pour les chiffons usagés.",
          "Utiliser des chiffons lavables et réutilisables.",
          "Travailler avec un prestataire spécialisé pour gérer les déchets chimiques.",
        ],
        outils: ["Conteneurs de déchets", "Système de lavage industriel", "Contrat de gestion des déchets"],
      },
      {
        numero: 13,
        theme: "risck avec les chariots élévateurs (fourchettes)",
        description: "Mauvaise manipulation des chariots élévateurs peut causer des accidents et endommager les matières premières.",
        objectif: "Sécuriser l'utilisation des chariots et prévenir les accidents.",
        actions: [
          "Former les conducteurs de chariots élévateurs.",
          "Définir des zones de circulation avec marquage au sol.",
          "Faire un contrôle technique régulier des chariots.",
        ],
        outils: ["Formation", "Marquage au sol", "Maintenance préventive"],
      },
    ],
  },
  {
    cle: "opportunites",
    libelle: ["Opportunities"],
    fond: "#dae3f3",
    lignes: [
      {
        numero: 14,
        theme: "Expansion du marché des cosmétiques pour hommes",
        description:
          "La demande de produits cosmétiques pour hommes est en forte croissance. Il y a une opportunité d'élargir la gamme de produits pour cette cible.",
        objectif: "Développer des produits adaptés aux besoins spécifiques des hommes et capter une part plus grande du marché.",
        actions: ["Étudier les tendances et besoins des consommateurs masculins.", "Lancer de nouvelles gammes ."],
        outils: ["Études de marché", "tests consommateur"],
      },
      {
        numero: 15,
        theme: "Automatisation des lignes de production pour augmenter la productivité",
        description: "L'automatisation permet d'accélérer la production, réduire les erreurs humaines et optimiser les coûts.",
        objectif:
          "Améliorer l'efficacité et réduire les coûts de production en diminuant le besoin de main-d'œuvre pour des tâches répétitives.",
        actions: [
          "Investir dans des machines automatisées.",
          "Former le personnel à leur utilisation.",
          "Suivre les performances et ajuster les réglages.",
        ],
        outils: ["Robots industriels", "capteurs intelligents", "logiciels de gestion de production."],
      },
      {
        numero: 16,
        theme: "Mise en place d'un système de contrôle qualité en temps réel sur les lignes de production",
        description:
          "Un contrôle qualité automatisé permet d'identifier rapidement les défauts et d'améliorer la conformité des produits.",
        objectif: "Réduire les défauts de fabrication et garantir une qualité constante.",
        actions: [
          "Installer des capteurs et caméras pour un contrôle automatique.",
          "Analyser les données en temps réel pour détecter les anomalies.",
          "Mettre en place des alertes et des actions correctives immédiates.",
        ],
        outils: ["Caméras intelligentes, capteurs de contrôle qualité, logiciels d'analyse de données."],
      },
      {
        numero: 17,
        theme: "Mise en place d'un plan controle  renforcé pour la sécurité et la conformité des produits",
        description:
          "La méthode plant de controle  permet d'identifier et de maîtriser les dangers liés à la production cosmétique.",
        objectif: "Garantir la sécurité des produits et la conformité aux normes réglementaires.",
        actions: [
          "Analyser les risques à chaque étape de production.",
          "Mettre en place des points de contrôle critiques.",
          "Former le personnel aux bonnes pratiques de fabrication.",
        ],
        outils: ["Checklists plant de controle , audits internes, formations en hygiène et sécurité."],
      },
      {
        numero: 18,
        theme: "Méthode de fabrication des gels douche",
        description: "La fabrication se fait dans des fûts en plastique, ce qui augmente le risque de contamination.",
        objectif: "Sécuriser le processus de fabrication et éviter la contamination.",
        actions: [
          "Remplacer les fûts en plastique par des cuves en inox.",
          "Renforcer le nettoyage après chaque production.",
          "Mettre en place des contrôles qualité stricts.",
        ],
        outils: ["Protocoles stricts de nettoyage et de désinfection"],
      },
    ],
  },
];
