// Entree par ligne du Conditionnement : calculs partages entre le formulaire (affichage en direct) et
// l'action serveur (qui recalcule tout elle-meme, jamais les chiffres envoyes par le navigateur).
// Aucun import serveur ici : ce fichier est aussi charge cote navigateur.

export const NB_RELEVES = 10;
export const NB_CASIERS_MAX = 50;

export type Releve = number | null;

export function arrondir2(valeur: number) {
  return Math.round(valeur * 100) / 100;
}

// Moyenne des cases remplies (les cases vides ne comptent pas) - 0 si rien n'est rempli.
export function moyenne(valeurs: readonly (number | null | undefined)[]): number {
  const nombres = valeurs.filter((valeur): valeur is number => typeof valeur === "number" && Number.isFinite(valeur));
  if (nombres.length === 0) return 0;
  return arrondir2(nombres.reduce((total, valeur) => total + valeur, 0) / nombres.length);
}

// Chaque casier coche = un casier sorti de la ligne, avec "pieces par casier" pieces dedans ;
// cartons = pieces totales / pieces par carton de l'article.
export function calculerCartonsCasiers(params: {
  nbCasiers: number;
  piecesParCasier: number | null | undefined;
  piecesParCarton: number | null | undefined;
}): { pieces: number; cartons: number } {
  const { nbCasiers, piecesParCasier, piecesParCarton } = params;
  const pieces = piecesParCasier && piecesParCasier > 0 ? nbCasiers * piecesParCasier : 0;
  const cartons = piecesParCarton && piecesParCarton > 0 ? arrondir2(pieces / piecesParCarton) : 0;
  return { pieces, cartons };
}

function nombreOuNull(texte: FormDataEntryValue | null): Releve {
  const brut = String(texte ?? "").trim().replace(",", ".");
  if (!brut) return null;
  const valeur = Number(brut);
  return Number.isFinite(valeur) ? valeur : null;
}

// Champs "<prefixe>_1" ... "<prefixe>_10" du formulaire (ex: poids_1, cadence_1).
export function lireReleves(formData: FormData, prefixe: string): Releve[] {
  return Array.from({ length: NB_RELEVES }, (_, index) => nombreOuNull(formData.get(`${prefixe}_${index + 1}`)));
}

// Cases cochees (champ "casier", valeur = numero de 1 a 50), sans doublon, dans l'ordre.
export function lireCasiersCoches(formData: FormData): number[] {
  const numeros = formData
    .getAll("casier")
    .map((valeur) => Number(String(valeur)))
    .filter((numero) => Number.isInteger(numero) && numero >= 1 && numero <= NB_CASIERS_MAX);
  return [...new Set(numeros)].sort((a, b) => a - b);
}
