// Module "Vrac a recuperer" : le vrac (article nature "vrac") a recuperer est
// enregistre avec le code de son lot, et entre dans le Depot B (table
// lots_stock). Le rapport Fabrication propose ensuite ce code dans "Code vrac
// recupere" (meme lecture du Depot B que le vrac mis de cote en Fabrication).

// Reconnait dans lots_stock les lignes creees par ce module (liste, suppression)
export const SOURCE_VRAC_A_RECUPERER = "web:vrac-a-recuperer";

export const MAX_LIGNES_VRAC_A_RECUPERER = 50;

export type ArticleVrac = { id: number; nom: string };

export type VracEnregistre = {
  id: number;
  articleId: number;
  article: string;
  code: string;
  quantite: number;
  // Stock actuel de ce code dans le Depot B (entrees - sorties, tous mouvements)
  solde: number;
  date: string;
  remarque: string | null;
  utilisateur: string | null;
};

export type LigneVracAEnregistrer = {
  articleId: number;
  code: string;
  quantite: number | null;
  remarque: string;
};

export function dateIsoValide(valeur: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const d = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur;
}

// Accepte la virgule ou le point ; null si vide ou pas un nombre
export function lireQuantite(texte: string): number | null {
  const propre = texte.trim().replace(/\s/g, "").replace(",", ".");
  if (propre === "") return null;
  const nombre = Number(propre);
  return Number.isFinite(nombre) ? nombre : null;
}

export function formaterQuantiteVrac(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}
