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

export type AttachmentFile = { name: string; path: string };

export type FormationRow = {
  id: number;
  annee: number;
  categorie: string | null;
  formation: string;
  ordre: number;
  est_bilan: boolean;
  m1_planifie: boolean;
  m1_date: string | null;
  m1_realise: boolean;
  m1_pieces_jointes: AttachmentFile[];
  m2_planifie: boolean;
  m2_date: string | null;
  m2_realise: boolean;
  m2_pieces_jointes: AttachmentFile[];
  m3_planifie: boolean;
  m3_date: string | null;
  m3_realise: boolean;
  m3_pieces_jointes: AttachmentFile[];
  m4_planifie: boolean;
  m4_date: string | null;
  m4_realise: boolean;
  m4_pieces_jointes: AttachmentFile[];
  m5_planifie: boolean;
  m5_date: string | null;
  m5_realise: boolean;
  m5_pieces_jointes: AttachmentFile[];
  m6_planifie: boolean;
  m6_date: string | null;
  m6_realise: boolean;
  m6_pieces_jointes: AttachmentFile[];
  m7_planifie: boolean;
  m7_date: string | null;
  m7_realise: boolean;
  m7_pieces_jointes: AttachmentFile[];
  m8_planifie: boolean;
  m8_date: string | null;
  m8_realise: boolean;
  m8_pieces_jointes: AttachmentFile[];
  m9_planifie: boolean;
  m9_date: string | null;
  m9_realise: boolean;
  m9_pieces_jointes: AttachmentFile[];
  m10_planifie: boolean;
  m10_date: string | null;
  m10_realise: boolean;
  m10_pieces_jointes: AttachmentFile[];
  m11_planifie: boolean;
  m11_date: string | null;
  m11_realise: boolean;
  m11_pieces_jointes: AttachmentFile[];
  m12_planifie: boolean;
  m12_date: string | null;
  m12_realise: boolean;
  m12_pieces_jointes: AttachmentFile[];
};

export const MOIS_FIELD_KEYS = MOIS_NOMS.map((label, index) => ({
  mois: index + 1,
  planifieKey: `m${index + 1}_planifie` as keyof FormationRow,
  dateKey: `m${index + 1}_date` as keyof FormationRow,
  realiseKey: `m${index + 1}_realise` as keyof FormationRow,
  piecesJointesKey: `m${index + 1}_pieces_jointes` as keyof FormationRow,
  label,
}));
