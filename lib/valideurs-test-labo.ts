// Personnes qui peuvent etre choisies dans la colonne "Valide par" du Test labo (Dashboard Production > Fabrication).
// Liste fermee : on n'enregistre jamais un nom tape a la main.
export const VALIDEURS_TEST_LABO = ["HASSAN", "M.MTERIK", "KUDZO EDAN", "GILLES KOUEVI"] as const;

export type ValideurTestLabo = (typeof VALIDEURS_TEST_LABO)[number];

export function estValideurTestLabo(nom: string): nom is ValideurTestLabo {
  return (VALIDEURS_TEST_LABO as readonly string[]).includes(nom);
}
