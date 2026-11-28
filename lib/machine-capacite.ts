// Capacite des machines, saisie dans Production > Equipements :
// - Conditionnement / Emballage : capacite = pieces par minute, produit par produit (machine > "Ajouter un produit") ;
// - Fabrication : Min et Max d'un batch, en kg de vrac. Ils s'ecrivent sur la machine elle-meme (valables pour
//   tous ses produits, colonnes machines.capacite_min / capacite_max) ; a defaut, produit par produit.
// Fonctions pures (aucun acces base), partagees par la grille "Programme par ligne" et son Dispatch pour que les
// 2 prennent exactement les memes valeurs.

// Journee normale d'une chaine (meme base que lib/heures-supplementaires.ts) - choix confirme par l'utilisateur.
export const HEURES_PAR_JOUR = 8;

export type MachineCapacite = {
  machineId: number;
  articleId: number;
  capacite: number | null;
  capaciteMin: number | null;
  capaciteMax: number | null;
};

// "Article" reserve aux Min / Max ecrits sur la machine elle-meme (aucun article n'a l'id 0) : ils voyagent dans
// la meme liste que les capacites par produit.
export const ARTICLE_MACHINE_ENTIERE = 0;

const positif = (valeur: number | null | undefined): number | null => (valeur != null && Number(valeur) > 0 ? Number(valeur) : null);

// Capacite Fabrication saisie PRODUIT PAR PRODUIT. Elle l'est normalement sur le vrac_article_id de l'article fini,
// mais le formulaire d'ajout ne distingue pas vrac/fini dans son champ de recherche - certaines fiches machine sont
// donc saisies directement sur l'article fini (ex: machine "Melangeur I" / article "POMMADE MY FAMILY CARE ALMOND
// 200ML", au lieu de son vrac reel). Le lookup essaie le vrac d'abord puis retombe sur l'article fini.
export function findCapaciteProduitFabrication(
  capacites: Map<string, MachineCapacite>,
  machineFabricationId: number | null | undefined,
  vracArticleId: number | null | undefined,
  articleId: number | null | undefined
): MachineCapacite | undefined {
  if (machineFabricationId == null || articleId == null) return undefined;
  return (
    (vracArticleId != null ? capacites.get(`${machineFabricationId}::${vracArticleId}`) : undefined) ??
    capacites.get(`${machineFabricationId}::${articleId}`)
  );
}

// Min / Max d'un batch de la machine Fabrication pour un produit : ceux ecrits sur la machine elle-meme des qu'il y
// en a au moins un (ils remplacent alors ceux du produit), sinon ceux ecrits sur le produit dans cette machine.
export function findCapaciteFabrication(
  capacites: Map<string, MachineCapacite>,
  machineFabricationId: number | null | undefined,
  vracArticleId: number | null | undefined,
  articleId: number | null | undefined
): MachineCapacite | undefined {
  if (machineFabricationId == null || articleId == null) return undefined;
  const machine = capacites.get(`${machineFabricationId}::${ARTICLE_MACHINE_ENTIERE}`);
  if (machine && (positif(machine.capaciteMin) !== null || positif(machine.capaciteMax) !== null)) return machine;
  return findCapaciteProduitFabrication(capacites, machineFabricationId, vracArticleId, articleId);
}

export type LimitesKg = { min: number | null; max: number | null };

// Les memes, en kg ; null quand la machine n'a ni Min ni Max pour ce produit.
export function limitesMachineFabrication(
  capacites: Map<string, MachineCapacite>,
  machineFabricationId: number | null | undefined,
  vracArticleId: number | null | undefined,
  articleId: number | null | undefined
): LimitesKg | null {
  const capa = findCapaciteFabrication(capacites, machineFabricationId, vracArticleId, articleId);
  const min = positif(capa?.capaciteMin);
  const max = positif(capa?.capaciteMax);
  return min === null && max === null ? null : { min, max };
}

// Min / Max d'un lot au Dispatch : ceux de la machine Fabrication ; l'article ne sert plus que pour la valeur que la
// machine n'a pas (machine pas encore remplie, ou ligne sans machine). Si les 2 sources se contredisent (Min au-dessus
// du Max), la valeur de la machine gagne et celle de l'article est ignoree.
export function limitesDuLot(machine: LimitesKg | null, article: LimitesKg): LimitesKg {
  let min = positif(machine?.min) ?? positif(article.min);
  let max = positif(machine?.max) ?? positif(article.max);
  if (machine && min !== null && max !== null && min > max) {
    if (positif(machine.min) === null) min = null;
    else if (positif(machine.max) === null) max = null;
  }
  return { min, max };
}

// Min / Max (kg) ecrits a la main sur une machine : vide = pas de valeur ; "2 300" et "1000,5" sont compris.
export function lireLimitesKg(
  minSaisi: unknown,
  maxSaisi: unknown
): { ok: true; min: number | null; max: number | null } | { ok: false; message: string } {
  const lire = (valeur: unknown) => {
    const texte = String(valeur ?? "").replace(/\s/g, "").replace(",", ".");
    if (!texte) return null;
    const nombre = Number(texte);
    return Number.isFinite(nombre) && nombre > 0 ? nombre : Number.NaN;
  };
  const min = lire(minSaisi);
  const max = lire(maxSaisi);
  if (Number.isNaN(min)) return { ok: false, message: "Le Min doit etre un nombre de kg plus grand que 0 (ou vide)." };
  if (Number.isNaN(max)) return { ok: false, message: "Le Max doit etre un nombre de kg plus grand que 0 (ou vide)." };
  if (min !== null && max !== null && min > max) return { ok: false, message: "Le Min ne peut pas etre plus grand que le Max." };
  return { ok: true, min, max };
}

export type EtatMinMax = { ok: boolean; message: string };
