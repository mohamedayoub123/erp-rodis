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

export type ChargeRow = { id: number; annee: number; mois: number; utilisateur: string | null } & Record<
  FieldKey,
  number | null
>;
