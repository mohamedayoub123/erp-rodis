import type { QtEnCoursDetail } from "@/app/tableau-commandes/family-data";

// Filtre par PD du "programme en cours" (pages Commandes par type et Stock restant par type) : le programme en cours d'un article (emballe pas encore
// en stock + reste a conditionner / emballer, voir fetchQtEnCoursConditionnementByArticle) est reparti entre les PD ou il se trouve - chaque code de lot
// appartient a un PD (buildPdLabelByCode : "PD12"...). On choisit les PD voulus et seul le programme en cours de ces PD compte dans le stock restant.
// Ce fichier ne depend d'aucun acces base : il sert cote serveur (repartition) ET cote navigateur (somme des PD choisis).

// Programme en cours dont le code n'appartient a aucun PD (jamais enregistre depuis Ravitailleur / Programme Dispatcher)
export const SANS_PD = "__sans_pd__";

// PD -> cartons de programme en cours d'UN article
export type EnCoursParPd = Record<string, number>;

export type PdDuType = {
  // "PD12" ou SANS_PD
  cle: string;
  // nombre d'articles du type qui ont du programme en cours dans ce PD, et leur total en cartons
  articles: number;
  cartons: number;
};

export function libellePd(cle: string): string {
  return cle === SANS_PD ? "Sans PD" : cle;
}

// PD du plus recent au plus ancien (PD145 avant PD9), "Sans PD" a la fin
export function comparerPd(a: string, b: string): number {
  if (a === SANS_PD) return b === SANS_PD ? 0 : 1;
  if (b === SANS_PD) return -1;
  return b.localeCompare(a, "fr", { numeric: true, sensitivity: "base" });
}

// PD choisis dans le filtre quand il en manque (null = tous les PD) : pour le sous-titre des Excel
export type FiltrePdExport = { choisis: string[]; total: number };

export function texteFiltrePd(filtre: FiltrePdExport): string {
  const liste = filtre.choisis.length > 0 ? filtre.choisis.map(libellePd).join(", ") : "aucun PD";
  const court = liste.length > 120 ? liste.slice(0, 117).replace(/[,\s]+\S*$/, "") + "..." : liste;
  return `programme en cours de ${filtre.choisis.length} PD sur ${filtre.total} : ${court}`;
}

// Repartit le programme en cours detaille par code entre les PD : article (nom normalise) -> PD -> cartons
export function repartirEnCoursParPd(details: QtEnCoursDetail[], pdParCode: Map<string, string>): Map<string, EnCoursParPd> {
  const parArticle = new Map<string, EnCoursParPd>();
  for (const detail of details) {
    if (detail.quantite === 0) continue;
    const pd = pdParCode.get(detail.code) ?? SANS_PD;
    const ligne = parArticle.get(detail.articleKey) ?? {};
    ligne[pd] = (ligne[pd] ?? 0) + detail.quantite;
    parArticle.set(detail.articleKey, ligne);
  }
  return parArticle;
}

// Les PD qui contiennent des articles du type choisi (cles = noms normalises de TOUS les articles du type, commandes ou non) avec du programme en
// cours : un PD sans aucun programme en cours pour ces articles ne change rien et n'est pas propose. Du plus recent au plus ancien.
export function pdsDesArticles(cles: Iterable<string>, enCoursParPd: Map<string, EnCoursParPd>): PdDuType[] {
  const parPd = new Map<string, { articles: number; cartons: number }>();
  for (const cle of new Set(cles)) {
    for (const [pd, cartons] of Object.entries(enCoursParPd.get(cle) ?? {})) {
      if (!(cartons > 0)) continue;
      const cumul = parPd.get(pd) ?? { articles: 0, cartons: 0 };
      cumul.articles += 1;
      cumul.cartons += cartons;
      parPd.set(pd, cumul);
    }
  }
  return [...parPd.entries()]
    .map(([cle, cumul]) => ({ cle, articles: cumul.articles, cartons: Math.round(cumul.cartons) }))
    .sort((a, b) => comparerPd(a.cle, b.cle));
}

// Programme en cours d'un article selon les PD choisis, en cartons ENTIERS comme Commandes par type. choisis = null : tous les PD, donc la valeur
// d'origine de l'article (enCoursTous, deja arrondie) - rien ne change tant qu'on ne filtre pas.
export function enCoursSelonPd(enCoursTous: number, parPd: EnCoursParPd, choisis: Set<string> | null): number {
  if (choisis === null) return enCoursTous;
  let somme = 0;
  for (const pd of choisis) somme += parPd[pd] ?? 0;
  // arrondi a 4 decimales avant l'arrondi au carton : une somme de decimales (3,33 + 3,33 + ...) ne bascule pas a cause du bruit de calcul
  return Math.round(Math.round(somme * 10000) / 10000);
}
