export const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

export const PRIX_FIELDS = [
  { key: "prix_gaz", label: "Prix Gaz (par litre)" },
  { key: "prix_essence", label: "Prix Essence (par litre)" },
  { key: "prix_gasoil", label: "Prix Gasoil (par litre)" },
] as const;

export type FieldKey = (typeof PRIX_FIELDS)[number]["key"];

export type PrixRow = { id: number; annee: number; mois: number; utilisateur: string | null } & Record<
  FieldKey,
  number | null
>;
