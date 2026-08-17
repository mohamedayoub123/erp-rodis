export const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

export const NUMERIC_FIELDS = [
  { key: "electricite_plastique", label: "Electricite Plastique", group: "Energie" },
  { key: "electricite_cosmetique", label: "Electricite Cosmetique", group: "Energie" },
  { key: "gaz", label: "Gaz (litres)", group: "Energie" },
  { key: "gasoil_plastique", label: "Gasoil Plastique (litres)", group: "Energie" },
  { key: "gasoil_cosmetique", label: "Gasoil Cosmetique (litres)", group: "Energie" },
  { key: "essence", label: "Essence (litres)", group: "Energie" },
  { key: "salaire_embauche", label: "Salaire Embauches", group: "Salaires" },
  { key: "salaire_journalier_cosmetique", label: "Salaire journaliers Cosmetique", group: "Salaires" },
  { key: "salaire_journalier_global", label: "Salaire journaliers Global", group: "Salaires" },
  { key: "salaire_cadre", label: "Salaire Cadres", group: "Salaires" },
  { key: "depense_usine", label: "Depenses usine (divers)", group: "Autres" },
] as const;

export type FieldKey = (typeof NUMERIC_FIELDS)[number]["key"];

// A part des couts (NUMERIC_FIELDS) : un nb de carton fabrique saisi a la
// main, utilise par le Graphe Cout par Carton uniquement pour les mois ou
// Suivi Production n'a pas (encore) la donnee reelle - jamais inclus dans
// le Total (FCFA) de la page Charges Usine, qui ne doit sommer que des couts.
export const CARTON_MANUEL_FIELD = {
  key: "carton_fabrique_manuel",
  label: "Nb carton fabrique (manuel - mois anciens sans Suivi Production)",
} as const;

export type ChargeRow = {
  id: number;
  annee: number;
  mois: number;
  utilisateur: string | null;
  carton_fabrique_manuel: number | null;
} & Record<FieldKey, number | null>;
