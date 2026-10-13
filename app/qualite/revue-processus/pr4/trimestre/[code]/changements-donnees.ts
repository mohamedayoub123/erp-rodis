// Fiche "Changements et impacts sur le processus" de la Revue Processus PR4, telle que recue dans le fichier
// Fiche_changements_PR4.xlsx (textes repris sans retouche, sauf la colonne "origine" : texte tel qu'ecrit par
// l'utilisateur dans sa version corrigee de la fiche). Une fiche par trimestre, cle = code du trimestre ("2026-T3").
//
// LE REGISTRE EST CUMULATIF : chaque trimestre suivant reprend automatiquement les changements deja enregistres (marques
// "Deja presente en T3 2026" sur la page) et y ajoute ceux de sa propre fiche (marques "Nouveau"). Un trimestre avant la
// premiere fiche affiche "Aucun changement enregistre". Pas besoin de creer la fiche d'un nouveau trimestre pour qu'il
// reprenne les changements precedents.
//
// Pour AJOUTER un changement au trimestre N : ajouter (ou completer) la fiche "AAAA-Tn" avec le changement dans
// "changements" (numero = suite de la numerotation : 5, 6...). Pour FAIRE EVOLUER un changement deja enregistre (ex : statut
// "Verifie efficace", commentaire, echeance) : l'ecrire dans "misesAJour" de la fiche du trimestre ou ca change - les
// trimestres precedents gardent l'etat qu'ils avaient. Le statut suit Planifie > En cours > Realise > Verifie efficace (un
// changement n'est "Verifie efficace" qu'apres la preuve notee dans "verification").

export type NiveauImpact = "Faible" | "Moyen" | "Élevé";
export type StatutChangement = "Planifié" | "En cours" | "Réalisé" | "Vérifié efficace";

export type Changement = {
  numero: number;
  type: string;
  description: string;
  origine: string;
  // "AAAA-MM-JJ", null si non renseignee
  dateEffective: string | null;
  etapes: string;
  impact: string;
  niveau: NiveauImpact;
  documents: string;
  formation: string;
  ressources: string;
  risques: string;
  actions: string;
  responsable: string;
  echeance: string | null;
  statut: StatutChangement;
  verification: string;
  commentaire: string;
};

export type FicheChangements = {
  processus: string;
  periode: string;
  pilote: string;
  // "AAAA-MM-JJ"
  dateRevue: string | null;
  // Conclusion du pilote sur la maitrise des changements ("" = pas encore redigee)
  conclusion: string;
  // Changements enregistres CE trimestre-la (les suivants les reprennent automatiquement)
  changements: Changement[];
  // Evolution, a partir de ce trimestre, de changements deja enregistres plus tot (statut, commentaire, echeance...)
  misesAJour?: ({ numero: number } & Partial<Omit<Changement, "numero">>)[];
};

export const FICHES_CHANGEMENTS: Record<string, FicheChangements> = {
  "2026-T3": {
    processus: "PR4 – Gérer la fabrication des produits cosmétiques, le stockage et l'expédition des PF",
    periode: "T3 2026 (revue du 12/10/2026)",
    pilote: "directeur production cosmetique",
    dateRevue: "2026-10-12",
    conclusion: "",
    changements: [
      {
        numero: 1,
        type: "Système d'information",
        description: "Remplacement de tous les fichiers Excel par un ERP interne pour la production, le stock MP et le stock PF",
        origine: "directeur technique et directeur production cosmetique",
        dateEffective: "2026-08-01",
        etapes: "Vérification stock PF, OF/OC, programme de fabrication, pesage, réception et stockage PF, préparation commandes",
        impact: "Qualité : traçabilité des lots et des stocks en temps réel, moins d'erreurs de saisie. Délai : information disponible immédiatement, plus de consolidation manuelle. Efficacité jugée très positive depuis août 2026.",
        niveau: "Élevé",
        documents: "Procédure de gestion des stocks MP, procédure de gestion du dépôt PF, procédure OF/OC, formulaires papier remplacés (à retirer du système documentaire)",
        formation: "Formation de tous les utilisateurs (magasin MP, dépôt PF, chefs de section, préparation commandes) ; mode opératoire ERP par poste",
        ressources: "Postes informatiques / tablettes, maintenance de l'ERP, sauvegardes quotidiennes",
        risques: "Perte de données si panne → sauvegardes ; double saisie papier/ERP pendant la transition → fixer une date d'arrêt du papier ; utilisateurs non formés → formation avant habilitation",
        actions: "1. Retirer les anciens fichiers Excel et formulaires papier du système documentaire. 2. Mettre à jour les procédures stock MP / PF / OF. 3. Enregistrer les formations ERP. 4. Mettre en place la sauvegarde et la tester.",
        responsable: "directeur production cosmetique & directeur technique",
        echeance: null,
        statut: "En cours",
        verification: "Procédures mises à jour et approuvées ; 100 % des utilisateurs formés ; écart d'inventaire ERP vs physique < 1 % sur 2 inventaires consécutifs ; test de restauration de sauvegarde réussi",
        commentaire: "ERP en service depuis août 2026 ; gain de valeur et de facilité constaté"
      },
      {
        numero: 2,
        type: "Nouvelle machine / équipement",
        description: "Réception d'une nouvelle machine d'emballage (il y a 4 mois)",
        origine: "Direction General",
        dateEffective: "2026-06-01",
        etapes: "Conditionnement, ramassage PF, palettisation",
        impact: "Délai : amélioration de la cadence d'emballage. Limite : la capacité ne couvre pas toute la production, une partie reste en manuel.",
        niveau: "Moyen",
        documents: "Procédure de conditionnement, instruction machine, plan de maintenance préventive, fiche de poste chef de ligne",
        formation: "Formation des chefs de ligne et opérateurs à la conduite et au nettoyage de la machine ; consignes de sécurité",
        ressources: "Pièces de rechange, contrat ou compétence maintenance interne, 2e machine ou extension de capacité à chiffrer",
        risques: "Capacité insuffisante → goulot d'étranglement en fin de ligne aux pics de production ; dépendance à une seule machine → plan de secours manuel",
        actions: "1. Mesurer le taux de couverture (volume emballé machine / volume total). 2. Chiffrer une 2e machine ou une mise à niveau. 3. Intégrer la machine au plan de maintenance et d'étalonnage. 4. Formaliser l'instruction et la formation.",
        responsable: "directeur menteancet , directeur technique et directeur production cosmetique",
        echeance: null,
        statut: "Réalisé",
        verification: "Taux de couverture mesuré ; instruction approuvée ; formations enregistrées ; taux d'arrêt machine < 5 %",
        commentaire: "Machine utile mais capacité à compléter pour couvrir 100 % de la production"
      },
      {
        numero: 3,
        type: "Nouvelle machine / équipement",
        description: "Tunnel à vapeur reçu, non encore installé, en attente de la machine automatique de conditionnement prévue en février 2027",
        origine: "auditeur",
        dateEffective: "2027-02-01",
        etapes: "Conditionnement (remplissage, bouchage, sleeve/étiquetage), ramassage PF",
        impact: "Hygiène : suppression de l'utilisation d'eau dans des seaux (risque de contamination). Qualité et sécurité : moins de contact manuel avec le produit. Coût : réduction de la main-d'œuvre sur la ligne. Réglementaire : amélioration de la conformité ISO 22716 §4 et §5.",
        niveau: "Élevé",
        documents: "Procédure de conditionnement, instruction tunnel vapeur, instruction machine automatique, plan de nettoyage, plan de maintenance, analyse des risques hygiène, fiches de poste",
        formation: "Formation des chefs de ligne, tireurs et opérateurs ; sécurité vapeur (brûlures) ; qualification des opérateurs sur la machine automatique",
        ressources: "Installation électrique et vapeur, espace au sol, réaffectation du personnel libéré, pièces de rechange",
        risques: "Retard de livraison de la machine automatique → tunnel immobilisé ; risque brûlure vapeur → protections et consignes ; réaffectation du personnel → anticiper les postes de destination",
        actions: "1. Préparer l'implantation (énergie, vapeur, sol). 2. Suivre la livraison de la machine automatique. 3. Installer et qualifier tunnel + machine. 4. Rédiger instructions et plan de nettoyage. 5. Former et réaffecter le personnel. 6. Retirer l'usage des seaux d'eau de la ligne.",
        responsable: "directeur tehchnique &production cosmetique",
        echeance: null,
        statut: "Planifié",
        verification: "Installation qualifiée ; aucune utilisation de seaux d'eau sur la ligne ; effectif de ligne réduit conformément au prévisionnel ; taux de NC conditionnement stable ou en baisse sur 3 mois",
        commentaire: "Tunnel en stock ; machine automatique attendue en février 2027"
      },
      {
        numero: 4,
        type: "Système d'information",
        description: "Installation de tablettes (iPad) sur toutes les chaînes de conditionnement pour la saisie en ligne – démarrage avec 1 tablette aujourd'hui",
        origine: "directeur technique et directeur production cosmetique",
        dateEffective: "2026-10-12",
        etapes: "Conditionnement (suivi de production, contrôles en cours), libération, remontée des données vers l'ERP",
        impact: "Qualité : suppression des erreurs de recopie ; données saisies à la source par chaque ligne. Délai : fin de la collecte papier par une seule personne qui ne finissait pas à temps ; information disponible immédiatement. Efficacité : suppression des retards de saisie.",
        niveau: "Moyen",
        documents: "Procédure de conditionnement (enregistrements), formulaires papier de suivi de ligne remplacés, instruction de saisie sur tablette, politique de sauvegarde",
        formation: "Formation des chefs de ligne à la saisie ; règle : saisie au fil de l'eau, pas en fin de poste",
        ressources: "1 tablette par chaîne (nombre à définir), supports de fixation, wifi dans l'atelier, protections contre l'eau et les produits",
        risques: "Tablette endommagée par l'eau/produits → coque étanche ; panne wifi → mode hors ligne ou retour papier temporaire ; mauvaise saisie → contrôle par le chef de section",
        actions: "1. Déployer la 1re tablette et mesurer 2 semaines (erreurs, retards). 2. Décider le déploiement sur toutes les chaînes. 3. Retirer les formulaires papier. 4. Former les chefs de ligne. 5. Mettre à jour la procédure.",
        responsable: "directeur technique &production cosmetique",
        echeance: null,
        statut: "En cours",
        verification: "Toutes les chaînes équipées ; zéro recopie papier ; données de production disponibles le jour même ; nombre d'erreurs de saisie mesuré en baisse",
        commentaire: "Pilote démarré le 12/10/2026 avec 1 tablette"
      }
    ]
  },
};

export type ChangementAffiche = Changement & {
  // code du trimestre ou le changement a ete enregistre ("2026-T3")
  trimestreOrigine: string;
};

export type FicheAffichee = Omit<FicheChangements, "changements" | "misesAJour"> & {
  changements: ChangementAffiche[];
};

// "2026-T3" -> "T3 2026"
export const libelleTrimestre = (code: string) => `${code.slice(5)} ${code.slice(0, 4)}`;

// Fiche affichee pour un trimestre : tous les changements enregistres jusque-la (reprises, dans l'etat qu'ils avaient a ce
// trimestre) + ceux enregistres ce trimestre. null avant la toute premiere fiche. Les codes "AAAA-Tn" se comparent
// directement comme du texte.
export function ficheDuTrimestre(code: string): FicheAffichee | null {
  const codes = Object.keys(FICHES_CHANGEMENTS).sort();
  if (codes.length === 0 || code < codes[0]) return null;

  const jusquIci = codes.filter((c) => c <= code);
  const changements: ChangementAffiche[] = [];
  for (const c of jusquIci) {
    const fiche = FICHES_CHANGEMENTS[c];
    for (const miseAJour of fiche.misesAJour ?? []) {
      const cible = changements.find((existant) => existant.numero === miseAJour.numero);
      if (cible) Object.assign(cible, miseAJour);
    }
    for (const changement of fiche.changements) changements.push({ ...changement, trimestreOrigine: c });
  }

  const propre = FICHES_CHANGEMENTS[code];
  const derniere = FICHES_CHANGEMENTS[jusquIci[jusquIci.length - 1]];
  return {
    processus: derniere.processus,
    pilote: derniere.pilote,
    periode: propre ? propre.periode : libelleTrimestre(code),
    dateRevue: propre ? propre.dateRevue : null,
    conclusion: propre ? propre.conclusion : "",
    changements,
  };
}
