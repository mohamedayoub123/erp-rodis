import { chargerMoisPr4, type MoisPr4 } from "../../indicateurs/calculs";

// Diapositive "Indicateur" du rapport de revue de processus : les chiffres viennent du tableau PR4 - Indicateurs
// (memes calculs : moyenne des mois du trimestre, un trimestre ne compte qu'une fois son 3e mois termine, et
// l'indicateur 1 compare le total du trimestre au meme trimestre de l'annee precedente).
//
// Cible : un indicateur est "atteint" (vert) si sa valeur est dans la cible, sinon rouge. Un indicateur SANS cible
// (evolution production, capacite, prix du carton) n'est jamais colore et n'est pas compte dans les KPI.

export type CibleIndicateur =
  | { type: "min"; seuil: number } // atteint si valeur >= seuil
  | { type: "max"; seuil: number } // atteint si valeur <= seuil
  | { type: "inferieur"; seuil: number } // atteint si valeur < seuil
  | { type: "plage"; min: number; max: number }; // atteint si min < valeur < max

export type IndicateurDiapo = {
  numero: number;
  indicateur: string;
  methode: string;
  // texte de la colonne "2026" (la cible) ; "" si aucune
  cibleTexte: string;
  cible: CibleIndicateur | null;
  planAction: string;
  fondOrange?: boolean;
  decimales: number;
  pourcentage: boolean;
  valeur: (mois: MoisPr4) => number | null;
};

export const INDICATEURS_DIAPO: IndicateurDiapo[] = [
  {
    numero: 1,
    indicateur: "evolution production par rapport a N-1",
    methode: "Production N - Production N-1 / Production N-1 x 100",
    cibleTexte: "transforme en analyse stat prod",
    cible: null,
    planAction: "plan d'action PR1",
    fondOrange: true,
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.cartonFabrique,
  },
  {
    numero: 2,
    indicateur: "Respect de Realisation des ordres de PRODUCTION",
    methode: "(Nombre d'Ordres de Productions finis en retard / nombre total d'Ordres de Production) x 100",
    cibleTexte: "98%",
    cible: { type: "min", seuil: 98 },
    planAction:
      "Contrôler le fichier de suivi des lignes toutes les heures et mettre en place des actions correctives en cas de retard.",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctProgramme,
  },
  {
    numero: 3,
    indicateur: "taux d'utilisation moyen capacite de production /machine",
    methode: "(∑ taux d'utilisation de la capacité de production hebdomadaire / nb de semaine)",
    cibleTexte: "transforme en analyse stat prod",
    cible: null,
    planAction: "plan d'action PR1",
    fondOrange: true,
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.capacite,
  },
  {
    numero: 4,
    indicateur: "taux d'heures supplementaires par personne",
    methode: "Moyenne de toutes les zones",
    cibleTexte: "2%",
    cible: { type: "max", seuil: 2 },
    planAction:
      "suivre le tableau des capacités de la chaîne ainsi que les heures supplémentaires en fonction des catégories, afin d'identifier les manques éventuels et de prendre les mesures nécessaires.",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.heuresSupplementairesPct,
  },
  {
    numero: 5,
    indicateur: "taux de fabrication non-conforme",
    methode: "(Nombre de fabrication en récupération / Nombre total de fabrication) x 100",
    cibleTexte: "< 0,5%",
    cible: { type: "inferieur", seuil: 0.5 },
    planAction: "plan d'action chez le PR5",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctADetruire,
  },
  {
    numero: 6,
    indicateur: "TAUX DE DEROGATION",
    methode: "(Nombre de lot de fabrication libéré sous dérogation / Nombre de lot de fabrication libéré) x 100",
    cibleTexte: "< 10%  PM1",
    cible: { type: "inferieur", seuil: 10 },
    planAction: "plan d'action chez PM1",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctSousDerogation,
  },
  {
    numero: 7,
    indicateur: "balance matiere",
    methode: "(Poids des produits conditionné par lot / Poids de préparation) x 100",
    cibleTexte: "-0,5% < X < + 0,5%",
    cible: { type: "plage", min: -0.5, max: 0.5 },
    planAction:
      "Utiliser des machines de fabrication automatique ainsi que des balances précises pour le conditionnement, vérifier le poids du vrac avant le conditionnement, et effectuer un contrôle de la contenance (poids) sur les lignes de conditionnement toutes les 15 minutes.",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctEcart,
  },
  {
    numero: 8,
    indicateur: "TEAUX DE ARET GLOBALE",
    methode: "Temps d'arrêt total / Temps de fonctionnement * 100",
    cibleTexte: "< 5%",
    cible: { type: "inferieur", seuil: 5 },
    planAction:
      "Revoir l'organisation et le suivi à l'aide de fichiers adaptés afin de réduire les arrêts et organiser une réunion chaque semaine pour résoudre les problèmes directement.",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctArret,
  },
  {
    numero: 9,
    indicateur: "TAUX SUIVI FORMATION",
    methode: "Taux de formation réalisée (%) = (Total formation faite * 100) / Total formation à faire",
    cibleTexte: "90%",
    cible: { type: "min", seuil: 90 },
    planAction: "Assurer le suivi du tableau de formation.",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctFormation,
  },
  {
    numero: 10,
    indicateur: "TAUX DECHEZ GLOBALE",
    methode: "Taux de déchets (%) = (Total des déchets * 100) / Production totale",
    cibleTexte: "< 1%",
    cible: { type: "inferieur", seuil: 1 },
    planAction: "Suivre le tableau d'analyse des déchets, identifier les problèmes et mettre en place des actions pour les résoudre.",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctDechets,
  },
  {
    numero: 11,
    indicateur: "TAUX DE RECLAMATION DE PRODUIT NON CONFORME / PROD",
    methode: "Total des pieces non conformes/Total des pieces fabriquées *100",
    cibleTexte: "<0,2 DE LA PROD",
    cible: { type: "inferieur", seuil: 0.2 },
    planAction: "Mettre en place une équipe qualité avec des procédures de travail.",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctReclamationNc,
  },
  {
    numero: 12,
    indicateur:
      "Respect du Délai de Livraison  Volume traité : 52 commandes par mois./Répartition : En moyenne, 13 commandes/semaine  sur 23 jours ouvrés.",
    methode: "Date de disponibilité des produits - Date de lancement de la commande",
    cibleTexte: "90%",
    cible: { type: "min", seuil: 90 },
    planAction: "Suivre le tableau afin de maintenir un délai de 10 jours pour les commandes de réception.",
    decimales: 2,
    pourcentage: true,
    valeur: (m) => m.pctLivraison,
  },
  {
    numero: 13,
    indicateur: "prix de revein 1 carton / a journalier cosmetiqueet energie cosmetique",
    methode: "",
    cibleTexte: "",
    cible: null,
    planAction: "",
    decimales: 0,
    pourcentage: false,
    valeur: (m) => m.prixCarton,
  },
];

// Dans la cible ? (jugee sur la valeur arrondie a 2 decimales, comme affichee)
export function estDansLaCible(cible: CibleIndicateur, valeur: number): boolean {
  const v = Math.round(valeur * 100) / 100;
  switch (cible.type) {
    case "min":
      return v >= cible.seuil;
    case "max":
      return v <= cible.seuil;
    case "inferieur":
      return v < cible.seuil;
    case "plage":
      return v > cible.min && v < cible.max;
  }
}

export type TrimestreIndicateurs = {
  trimestre: 1 | 2 | 3 | 4;
  // faux tant que le 3e mois du trimestre n'est pas termine : aucune valeur affichee
  complet: boolean;
  valeurs: Record<number, number | null>;
  kpiOk: number;
  kpiTotal: number;
  pourcentageAtteint: number | null;
};

// Le calcul lit toutes les sources du tableau PR4 (plusieurs secondes) : on garde le resultat 60 s, partage entre
// les pages de trimestre ouvertes dans la foulee (une modification manuelle apparait donc au plus 60 s plus tard).
let memoire: { jusqua: number; promesse: ReturnType<typeof chargerMoisPr4> } | null = null;
export function moisPr4() {
  if (!memoire || memoire.jusqua < Date.now()) {
    const promesse = chargerMoisPr4();
    memoire = { jusqua: Date.now() + 60_000, promesse };
    promesse.catch(() => {
      if (memoire?.promesse === promesse) memoire = null;
    });
  }
  return memoire.promesse;
}

export async function lireIndicateursAnnee(annee: number): Promise<TrimestreIndicateurs[]> {
  const { monthRows, currentMoisKey } = await moisPr4();
  const moisParCle = new Map(monthRows.map((row) => [row.mois, row]));

  const moyenne = (moisKeys: string[], valeur: (m: MoisPr4) => number | null) => {
    const valeurs = moisKeys
      .map((cle) => moisParCle.get(cle))
      .filter((row): row is MoisPr4 => Boolean(row))
      .map((row) => valeur(row))
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    if (valeurs.length === 0) return null;
    return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  };

  // Indicateur 1 : total du trimestre compare au MEME trimestre de l'annee precedente (% d'evolution)
  const evolutionN1 = (moisKeys: string[]) => {
    const totalCourant = moisKeys.reduce((somme, cle) => somme + (moisParCle.get(cle)?.cartonFabrique ?? 0), 0);
    const moisPrecedents = moisKeys.map((cle) => `${Number(cle.slice(0, 4)) - 1}-${cle.slice(5)}`);
    if (!moisPrecedents.some((cle) => moisParCle.has(cle))) return null;
    const totalPrecedent = moisPrecedents.reduce((somme, cle) => somme + (moisParCle.get(cle)?.cartonFabrique ?? 0), 0);
    if (totalPrecedent <= 0) return null;
    return ((totalCourant - totalPrecedent) / totalPrecedent) * 100;
  };

  return ([1, 2, 3, 4] as const).map((trimestre) => {
    const moisKeys = [1, 2, 3].map((decalage) => `${annee}-${String((trimestre - 1) * 3 + decalage).padStart(2, "0")}`);
    // Un trimestre ne compte que si son 3e mois est strictement avant le mois en cours
    const complet = moisKeys[2] < currentMoisKey;
    const valeurs: Record<number, number | null> = {};
    let kpiOk = 0;
    let kpiTotal = 0;
    for (const indicateur of INDICATEURS_DIAPO) {
      const valeur = !complet
        ? null
        : indicateur.numero === 1
          ? evolutionN1(moisKeys)
          : moyenne(moisKeys, indicateur.valeur);
      valeurs[indicateur.numero] = valeur;
      if (indicateur.cible && valeur !== null) {
        kpiTotal++;
        if (estDansLaCible(indicateur.cible, valeur)) kpiOk++;
      }
    }
    return {
      trimestre,
      complet,
      valeurs,
      kpiOk,
      kpiTotal,
      pourcentageAtteint: complet && kpiTotal > 0 ? (kpiOk / kpiTotal) * 100 : null,
    };
  });
}
