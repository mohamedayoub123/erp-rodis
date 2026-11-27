// BROUILLON de la grille "Programme par ligne" : ce qui est ecrit reste apres une actualisation de la page (F5, retour sur la page, onglet
// recharge par le navigateur). Garde sur l'appareil (localStorage) jusqu'au Save / Dispatch ou "Repartir de zero", 7 jours au maximum.
// Rien n'est envoye au serveur.

export type LigneBrouillon = {
  // Machine Conditionnement choisie (la ligne de la grille reste reperee par sa chaine de depart, voir la cle)
  machineId: number;
  chaine: string;
  articleId: number | null;
  produit: string;
  // Ce qui est ecrit dans la case Produit, meme si aucun article n'a encore ete choisi
  produitTexte: string;
  typeArticle: string;
  plateforme: string;
  programe: string;
  machineFabricationId: number | null;
  vracInput: string;
  vracManuel: boolean;
};

export type BrouillonProgramme = {
  t: number;
  jour: string;
  mois: string;
  annee: string;
  remarque: string;
  // Nb de lignes d'une chaine quand il a change (bouton "+"), par "zone::chaine"
  nbLignes: Record<string, number>;
  // Les lignes modifiees seulement, par "zone::chaine::rang"
  lignes: Record<string, LigneBrouillon>;
  // Un Save / Dispatch etait en cours quand ce brouillon a ete garde
  envoi: boolean;
};

const PREFIXE = "brouillon-programme-par-ligne:";
export const DUREE_BROUILLON_MS = 7 * 24 * 60 * 60 * 1000;

export function cleChaine(zone: string, chaine: string): string {
  return `${zone}::${chaine}`;
}

export function cleLigne(zone: string, chaine: string, rang: number): string {
  return `${zone}::${chaine}::${rang}`;
}

export function lireBrouillonProgramme(cle: string): BrouillonProgramme | null {
  try {
    const brut = window.localStorage.getItem(PREFIXE + cle);
    if (!brut) return null;
    const lu = JSON.parse(brut) as Partial<BrouillonProgramme> | null;
    if (!lu || typeof lu.t !== "number" || !lu.lignes || !lu.nbLignes || Date.now() - lu.t > DUREE_BROUILLON_MS) {
      window.localStorage.removeItem(PREFIXE + cle);
      return null;
    }
    return lu as BrouillonProgramme;
  } catch {
    return null;
  }
}

// null = plus rien a garder ; l'heure de la sauvegarde est ajoutee ici (elle sert a la duree de 7 jours)
export function garderBrouillonProgramme(cle: string, brouillon: Omit<BrouillonProgramme, "t"> | null) {
  try {
    if (brouillon) window.localStorage.setItem(PREFIXE + cle, JSON.stringify({ t: Date.now(), ...brouillon }));
    else window.localStorage.removeItem(PREFIXE + cle);
  } catch {
    // Stockage plein ou interdit (navigation privee) : pas de brouillon, la page marche comme avant
  }
}
