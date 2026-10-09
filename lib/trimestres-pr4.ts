// Trimestres de la Revue Processus PR4 : T1 = mois 1 a 3, T2 = mois 4 a 6, T3 = mois 7 a 9, T4 = mois 10 a 12.
// Un nouveau trimestre apparait tout seul des que ses 3 mois commencent (rien a creer a la main).
// Liste : T1 2025 (reference), puis chaque trimestre depuis T1 2026 jusqu'au trimestre en cours.

export type TrimestrePr4 = {
  annee: number;
  trimestre: 1 | 2 | 3 | 4;
  // identifiant dans l'adresse de la page : "2026-T1"
  code: string;
  // "PR4 T1 2026"
  libelle: string;
  // "Janvier - Mars 2026"
  periode: string;
  enCours: boolean;
};

const MOIS = [
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
];

const PREMIERE_ANNEE_SUIVIE = 2026;
// Trimestres plus anciens gardes en plus (ici T1 2025, demande explicite)
const TRIMESTRES_ANCIENS: { annee: number; trimestre: 1 | 2 | 3 | 4 }[] = [{ annee: 2025, trimestre: 1 }];

function construire(annee: number, trimestre: 1 | 2 | 3 | 4, enCours: boolean): TrimestrePr4 {
  const moisDebut = (trimestre - 1) * 3;
  return {
    annee,
    trimestre,
    code: `${annee}-T${trimestre}`,
    libelle: `PR4 T${trimestre} ${annee}`,
    periode: `${MOIS[moisDebut]} - ${MOIS[moisDebut + 2]} ${annee}`,
    enCours,
  };
}

// Trimestre de la date donnee (le Togo est a l'heure UTC, donc pas de decalage a gerer)
export function trimestreDeLaDate(date: Date): { annee: number; trimestre: 1 | 2 | 3 | 4 } {
  return {
    annee: date.getUTCFullYear(),
    trimestre: (Math.floor(date.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  };
}

// Tous les trimestres a afficher : l'annee la plus recente d'abord, et dans une annee T1 -> T4.
export function listerTrimestresPr4(maintenant: Date = new Date()): TrimestrePr4[] {
  const courant = trimestreDeLaDate(maintenant);
  const liste: TrimestrePr4[] = [];

  for (let annee = PREMIERE_ANNEE_SUIVIE; annee <= courant.annee; annee++) {
    for (const trimestre of [1, 2, 3, 4] as const) {
      if (annee === courant.annee && trimestre > courant.trimestre) break;
      liste.push(construire(annee, trimestre, annee === courant.annee && trimestre === courant.trimestre));
    }
  }
  for (const ancien of TRIMESTRES_ANCIENS) liste.push(construire(ancien.annee, ancien.trimestre, false));

  return liste.sort((a, b) => b.annee - a.annee || a.trimestre - b.trimestre);
}

export function trouverTrimestrePr4(code: string, maintenant: Date = new Date()): TrimestrePr4 | null {
  return listerTrimestresPr4(maintenant).find((t) => t.code === code) ?? null;
}
