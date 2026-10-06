// Rapprochement des noms d'articles lus sur une photo avec ceux de l'ERP (fonctions pures, sans base).
// Les noms sont en principe identiques dans les 2 systemes ; une petite faute de frappe d'un cote
// (ex: DIMETHICONE / DIMETCHICONE) est toleree, mais jamais un chiffre different (350 / 360).

export type ArticleTypePhoto = "MP" | "PF";
export type StatutRapprochement = "trouve" | "proche" | "introuvable";

export type ArticleRapprochable = { id: number; nom: string };
export type ArticlePrepare = ArticleRapprochable & { mots: string[]; ensemble: Set<string> };

export type ResultatRapprochement = {
  articleType: ArticleTypePhoto;
  articleId: number | null;
  articleNom: string;
  statut: StatutRapprochement;
};

export function normaliserNom(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function decouper(texte: string): string[] {
  return [...new Set(normaliserNom(texte).split(" ").filter(Boolean))];
}

// Decoupe chaque nom une seule fois (la meme liste sert pour toutes les lignes lues)
export function preparerArticles(articles: ArticleRapprochable[]): ArticlePrepare[] {
  return articles.map((a) => {
    const mots = decouper(a.nom);
    return { ...a, mots, ensemble: new Set(mots) };
  });
}

// Seuls les mots d'au moins 5 lettres, sans chiffre, peuvent avoir une faute : les petits mots
// (GM, 30ML, 350...) doivent etre exactement identiques.
function motTolerant(mot: string): boolean {
  return /^[a-z]{5,}$/.test(mot);
}

function distanceAutorisee(mot: string): number {
  return mot.length >= 9 ? 2 : 1;
}

// Distance de Levenshtein (nombre de lettres a ajouter / enlever / changer)
function distanceEdition(a: string, b: string): number {
  const precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonale = precedente[0];
    precedente[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const haut = precedente[j];
      precedente[j] = Math.min(precedente[j] + 1, precedente[j - 1] + 1, diagonale + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonale = haut;
    }
  }
  return precedente[b.length];
}

// 1 = memes mots (peu importe l'ordre) ; un mot avec une petite faute compte 0,95 ; 0 = rien en commun
function similarite(motsLus: string[], ensembleLu: Set<string>, article: ArticlePrepare): number {
  const total = motsLus.length + article.mots.length;
  if (total === 0) return 0;

  let poids = 0;
  const restantsLus: string[] = [];
  for (const mot of motsLus) {
    if (article.ensemble.has(mot)) poids += 1;
    else restantsLus.push(mot);
  }

  if (restantsLus.length > 0) {
    const restantsArticle = article.mots.filter((m) => !ensembleLu.has(m));
    const utilises = new Set<number>();
    for (const mot of restantsLus) {
      if (!motTolerant(mot)) continue;
      const limite = distanceAutorisee(mot);
      for (let i = 0; i < restantsArticle.length; i++) {
        const candidat = restantsArticle[i];
        if (utilises.has(i) || !motTolerant(candidat) || Math.abs(candidat.length - mot.length) > limite) continue;
        if (distanceEdition(mot, candidat) <= limite) {
          poids += 0.95;
          utilises.add(i);
          break;
        }
      }
    }
  }

  return (2 * poids) / total;
}

// Cherche le nom lu dans les articles MP puis PF ; garde le plus ressemblant. Si plusieurs
// articles se ressemblent autant (ex: meme nom sauf la couleur), rien n'est pre-choisi :
// mieux vaut laisser l'utilisateur choisir que deviner le mauvais article.
export function rapprocherArticle(
  nomLu: string,
  articlesMp: ArticlePrepare[],
  articlesPf: ArticlePrepare[]
): ResultatRapprochement {
  const motsLus = decouper(nomLu);
  const ensembleLu = new Set(motsLus);

  let meilleur: { type: ArticleTypePhoto; article: ArticlePrepare; score: number } | null = null;
  let egalites = 0;

  for (const [type, liste] of [
    ["MP", articlesMp],
    ["PF", articlesPf],
  ] as const) {
    for (const article of liste) {
      const score = similarite(motsLus, ensembleLu, article);
      if (score <= 0) continue;
      if (!meilleur || score > meilleur.score + 1e-9) {
        meilleur = { type, article, score };
        egalites = 1;
      } else if (Math.abs(score - meilleur.score) <= 1e-9) {
        egalites += 1;
      }
    }
  }

  if (!meilleur || meilleur.score < 0.8 || egalites > 1) {
    return { articleType: meilleur?.type ?? "MP", articleId: null, articleNom: "", statut: "introuvable" };
  }
  return {
    articleType: meilleur.type,
    articleId: meilleur.article.id,
    articleNom: meilleur.article.nom,
    statut: meilleur.score >= 0.999 ? "trouve" : "proche",
  };
}

// "Depot B", "depot b", "B", "DEPOT RD"... -> id du depot de l'ERP (null si pas reconnu)
export function rapprocherDepot(lu: string | null, depots: { id: number; nom: string }[]): number | null {
  if (!lu) return null;
  const cible = normaliserNom(lu);
  if (!cible) return null;
  const exact = depots.find((d) => normaliserNom(d.nom) === cible);
  if (exact) return exact.id;
  const parLettre = depots.filter((d) => normaliserNom(d.nom).replace(/^depot /, "") === cible.replace(/^depot /, ""));
  return parLettre.length === 1 ? parLettre[0].id : null;
}
