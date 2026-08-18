export const MOIS_NOMS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
] as const;

export type FormationRow = {
  id: number;
  annee: number;
  categorie: string | null;
  formation: string;
  ordre: number;
  est_bilan: boolean;
  m1_planifie: boolean;
  m1_date: string | null;
  m2_planifie: boolean;
  m2_date: string | null;
  m3_planifie: boolean;
  m3_date: string | null;
  m4_planifie: boolean;
  m4_date: string | null;
  m5_planifie: boolean;
  m5_date: string | null;
  m6_planifie: boolean;
  m6_date: string | null;
  m7_planifie: boolean;
  m7_date: string | null;
  m8_planifie: boolean;
  m8_date: string | null;
  m9_planifie: boolean;
  m9_date: string | null;
  m10_planifie: boolean;
  m10_date: string | null;
  m11_planifie: boolean;
  m11_date: string | null;
  m12_planifie: boolean;
  m12_date: string | null;
};

export const MOIS_FIELD_KEYS = MOIS_NOMS.map((label, index) => ({
  planifieKey: `m${index + 1}_planifie` as keyof FormationRow,
  dateKey: `m${index + 1}_date` as keyof FormationRow,
  label,
}));
