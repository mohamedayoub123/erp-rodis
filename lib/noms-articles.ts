// Rapprochement des noms d'articles lus sur une photo avec ceux de l'ERP (fonctions pures, sans base).
// Les noms sont en principe identiques dans les 2 systemes, mais on tolere les petites differences :
// ordre des mots, espaces ou ponctuation differents (METHYL PARABEN / METHYLPARABEN), faute de
// frappe (DIMETHICONE / DIMETCHICONE) et chiffres inverses (350 / 530). Un chiffre qui n'est PAS
// juste inverse (350 / 360) reste refuse. Un nom qui n'est pas strictement identique est propose
// avec "A verifier" ; si plusieurs articles se ressemblent autant, rien n'est pre-choisi.

export type ArticleTypePhoto = "MP" | "PF";
export type StatutRapprochement = "trouve" | "proche" | "introuvable";

export type ArticleRapprochable = { id: number; nom: string };
export type ArticlePrepare = ArticleRapprochable & {
  mots: string[];
  ensemble: Set<string>;
  // Nom sans aucun espace ni ponctuation, et ses chiffres tries (pour comparer sans tenir compte de l'ordre)
  compact: string;
  chiffres: string;
};

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

function compacter(texte: string): string {
  return normaliserNom(texte).replace(/ /g, "");
}

function chiffresTries(compact: string): string {
  return compact.replace(/[^0-9]/g, "").split("").sort().join("");
}

// Decoupe chaque nom une seule fois (la meme liste sert pour toutes les lignes lues)
export function preparerArticles(articles: ArticleRapprochable[]): ArticlePrepare[] {
  return articles.map((a) => {
    const mots = decouper(a.nom);
    const compact = compacter(a.nom);
    return { ...a, mots, ensemble: new Set(mots), compact, chiffres: chiffresTries(compact) };
  });
}

// Seuls les mots d'au moins 5 lettres, sans chiffre, peuvent avoir une faute : les petits mots
// (GM, 30ML, B1...) doivent etre exactement identiques.
function motTolerant(mot: string): boolean {
  return /^[a-z]{5,}$/.test(mot);
}

function distanceAutorisee(mot: string): number {
  return mot.length >= 9 ? 2 : 1;
}

// Nombre entier de 2 chiffres ou plus (350) : peut etre ecrit avec ses chiffres inverses (530, 305)
function nombre(mot: string): boolean {
  return /^[0-9]{2,}$/.test(mot);
}

function memesChiffres(a: string, b: string): boolean {
  return a.split("").sort().join("") === b.split("").sort().join("");
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

type NomLu = { mots: string[]; ensemble: Set<string>; compact: string; chiffres: string };

// 1 = memes mots (peu importe l'ordre) ; une faute de frappe compte 0,95 ; des chiffres inverses 0,9
function similariteParMots(lu: NomLu, article: ArticlePrepare): number {
  const total = lu.mots.length + article.mots.length;
  if (total === 0) return 0;

  let poids = 0;
  const restantsLus: string[] = [];
  for (const mot of lu.mots) {
    if (article.ensemble.has(mot)) poids += 1;
    else restantsLus.push(mot);
  }

  if (restantsLus.length > 0) {
    const restantsArticle = article.mots.filter((m) => !lu.ensemble.has(m));
    const utilises = new Set<number>();
    for (const mot of restantsLus) {
      const tolerant = motTolerant(mot);
      const numerique = nombre(mot);
      if (!tolerant && !numerique) continue;
      const limite = distanceAutorisee(mot);
      for (let i = 0; i < restantsArticle.length; i++) {
        if (utilises.has(i)) continue;
        const candidat = restantsArticle[i];
        if (numerique) {
          if (nombre(candidat) && candidat.length === mot.length && memesChiffres(mot, candidat)) {
            poids += 0.9;
            utilises.add(i);
            break;
          }
          continue;
        }
        if (!motTolerant(candidat) || Math.abs(candidat.length - mot.length) > limite) continue;
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

// Meme nom sans tenir compte des espaces / de la ponctuation (METHYL PARABEN = METHYLPARABEN),
// avec en plus une petite faute de frappe possible sur les noms longs. Les chiffres doivent etre
// les memes (dans n'importe quel ordre).
function similariteCompacte(lu: NomLu, article: ArticlePrepare): number {
  if (lu.compact === "" || article.compact === "") return 0;
  if (lu.compact === article.compact) return 0.99;
  if (lu.chiffres !== article.chiffres || lu.compact.length < 10) return 0;
  const limite = lu.compact.length >= 20 ? 2 : 1;
  if (Math.abs(lu.compact.length - article.compact.length) > limite) return 0;
  const distance = distanceEdition(lu.compact, article.compact);
  return distance <= limite ? 0.97 - 0.02 * distance : 0;
}

// Cherche le nom lu dans les articles MP puis PF ; garde le plus ressemblant. Si plusieurs
// articles se ressemblent autant (ex: meme nom sauf la couleur), rien n'est pre-choisi :
// mieux vaut laisser l'utilisateur choisir que deviner le mauvais article.
export function rapprocherArticle(
  nomLu: string,
  articlesMp: ArticlePrepare[],
  articlesPf: ArticlePrepare[]
): ResultatRapprochement {
  const mots = decouper(nomLu);
  const compact = compacter(nomLu);
  const lu: NomLu = { mots, ensemble: new Set(mots), compact, chiffres: chiffresTries(compact) };

  let meilleur: { type: ArticleTypePhoto; article: ArticlePrepare; score: number } | null = null;
  let egalites = 0;

  for (const [type, liste] of [
    ["MP", articlesMp],
    ["PF", articlesPf],
  ] as const) {
    for (const article of liste) {
      const score = Math.max(similariteParMots(lu, article), similariteCompacte(lu, article));
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
