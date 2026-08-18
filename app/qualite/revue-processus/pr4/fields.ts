export const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

export const MANUEL_FIELDS = [
  { key: "carton_commande", label: "Carton commande", group: "1/2 - Production" },
  { key: "carton_fabrique", label: "Carton fabrique", group: "1/2 - Production" },
  { key: "capacite_pct", label: "% Capacite machines", group: "3 - Capacite" },
  { key: "test_labo_preparations", label: "Preparations Test Labo", group: "5/6 - Test Labo" },
  { key: "test_labo_a_detruire", label: "Dont a detruire", group: "5/6 - Test Labo" },
  { key: "test_labo_sous_derogation", label: "Dont sous derogation", group: "5/6 - Test Labo" },
  { key: "vrac_fabrique_kg", label: "Vrac fabrique (kg)", group: "7 - Balance matiere" },
  { key: "carton_fabrique_kg", label: "Carton fabrique (kg)", group: "7 - Balance matiere" },
  { key: "arret_minutes", label: "Temps arret (min)", group: "8 - Taux d'arret" },
  { key: "travail_minutes", label: "Temps travail (min)", group: "8 - Taux d'arret" },
  { key: "pieces_fabriquees", label: "Pieces fabriquees", group: "10 - Dechets" },
  { key: "dechet_pieces", label: "Dechets (pieces)", group: "10 - Dechets" },
  { key: "prix_carton", label: "Prix de revient 1 carton (FCFA)", group: "13 - Cout" },
  { key: "heures_supplementaires_pct", label: "% heures supplementaires", group: "4 - Heures supplementaires" },
  { key: "formation_a_faire", label: "Nb formation a faire", group: "9 - Formation" },
  { key: "formation_realisee", label: "Nb formation realisee", group: "9 - Formation" },
  { key: "qt_retournee_nc", label: "Qt retournee (non conforme)", group: "11 - Reclamation NC" },
  { key: "qt_commande_livraison", label: "Qt commande", group: "12 - Delai livraison" },
  { key: "qt_livree_a_temps", label: "Qt livree a temps", group: "12 - Delai livraison" },
] as const;

export type FieldKey = (typeof MANUEL_FIELDS)[number]["key"];

export type ManuelRow = {
  id: number;
  annee: number;
  mois: number;
  utilisateur: string | null;
} & Record<FieldKey, number | null>;
