// Logique de regroupement par gamme+forme (Lait/Creme/DSR/...) partagee
// entre la generation automatique de code (Programme par ligne) et la
// modification manuelle (Code par article) - les deux doivent utiliser
// exactement la meme regle pour ne jamais desynchroniser une famille.
//
// IMPORTANT : la colonne articles.type_article contient une categorie de
// formulation (clarifiant, hydratant, parfume...), PAS la forme du produit
// (Lait/Creme/DSR/...). Deux articles de forme differente (ex: "Creme
// WHITE SECRET 320grs" et "Lait WHITE SECRET 300ml") peuvent tres bien
// partager le meme type_article="clarifiant" - la forme est donc TOUJOURS
// deduite du nom de l'article, jamais de type_article.

export function normalizeFamilyValue(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Certaines gammes declinent le MEME produit en plusieurs variantes de
// formulation (typiquement "Clarifiant" / "Exfoliant" sur les gels douche) -
// ces variantes ne doivent PAS partager le meme code ni le meme lot entre
// elles (formules differentes), mais chaque variante garde son propre
// compteur de code partage a travers ses contenances (1L/500ml/...), au
// meme titre que gamme+forme pour tout le reste.
// Un nom SANS marqueur "Exfoliant" est considere comme la variante
// "Clarifiant" par defaut - c'est la formulation standard/implicite quand
// le nom ne precise rien (ex: "Gel Douche White Secret 1L" sans suffixe est
// en realite la version Clarifiant, elle doit donc partager son code avec
// "Gel Douche White Secret 500ml Clarifiant") - seul un marqueur Exfoliant
// explicite bascule dans l'autre variante, separee.
const EXFOLIANT_TOKENS = new Set(["EXFOLIANT", "EXFOLIANTE", "EXFO", "EXF"]);

export function detectArticleVariantFromName(name: string | null | undefined): string {
  const words = normalizeFamilyValue(name).split(" ");
  if (words.some((word) => EXFOLIANT_TOKENS.has(word))) return "EXFOLIANT";
  return "CLARIFIANT";
}

export function detectArticleFamilyFromName(name: string | null | undefined): string {
  const normalized = normalizeFamilyValue(name);

  if (normalized.startsWith("LAIT ")) return "LAIT";
  if (normalized.startsWith("CREME ")) return "CREME";
  if (normalized.startsWith("DSR ")) return "DSR";
  if (normalized.startsWith("HUILE ")) return "HUILE";
  if (normalized.startsWith("SERUM ")) return "SERUM";
  if (normalized.startsWith("SAVON ")) return "SAVON";
  if (normalized.startsWith("GEL DOUCHE ")) return "GEL DOUCHE";
  if (normalized.startsWith("TUBE ")) return "TUBE";

  // Aucune categorie de forme reconnue (ex: "Pommade", "Baume"...) : le nom
  // complet sert de cle (moins la contenance/taille en toute fin de nom,
  // ex: "125ML"/"50"), pas seulement le 1er mot - sinon 2 produits
  // totalement differents qui commencent par le meme mot (ex: "POMMADE
  // MENTHOLATA 125ML" et "POMMADE WHITE CAT 125ML", meme gamme "Menthole")
  // se retrouvaient regroupes dans la meme famille et partageaient a tort
  // le meme code/lot.
  const withoutTrailingSize = normalized
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:ML|CL|L|GRS|GR|G|KG)?$/, "")
    .trim();

  return withoutTrailingSize || normalized;
}

export function detectArticleGammeFromName(name: string | null | undefined): string {
  const normalized = normalizeFamilyValue(name);

  if (normalized.includes("WHITE SECRET")) return "WHITE SECRET";
  if (normalized.includes("PRECIOUS PERFECT")) return "PRECIOUS PERFECT";
  if (normalized.includes("PERFECT GLOW")) return "PERFECT GLOW";
  if (normalized.includes("BB CLEAR VIT C")) return "BB CLEAR VIT C";
  if (normalized.includes("BB CLEAR")) return "BB CLEAR";
  if (normalized.includes("PRO WHITE")) return "PRO WHITE";
  if (normalized.includes("LUXURY COCOA")) return "LUXURY COCOA";
  if (normalized.includes("LUXURY AVOCADO")) return "LUXURY AVOCADO";
  if (normalized.includes("MOROCCO SKIN")) return "MOROCCO SKIN";
  if (normalized.includes("MY FAMILY CARE")) return "MY FAMILY CARE";
  if (normalized.includes("ABSOLUTE CARE REALITY")) return "ABSOLUTE CARE REALITY";
  if (normalized.includes("REAL CARE R")) return "REAL CARE R";
  if (normalized.includes("TONE THERAPY R")) return "TONE THERAPY R";
  if (normalized.includes("COCO CLEAR")) return "COCO CLEAR";
  if (normalized.includes("COCOA SKIN")) return "COCOA SKIN";
  if (normalized.includes("DERMATONE")) return "DERMATONE";
  if (normalized.includes("ECO+OFA+CDV+SKL")) return "ECO+OFA+CDV+SKL";
  if (normalized.includes("SOOPURE")) return "SOOPURE";
  if (normalized.includes("EDT RODIS")) return "EDT RODIS";
  if (normalized.includes("EDT REALITY")) return "EDT REALITY";
  if (normalized.includes("MENTHOLE ETDIVERS")) return "MENTHOLE ETDIVERS";
  if (normalized.includes("ELIXIR")) return "ELIXIR";
  if (normalized.includes("EGYPTIAN BEAUTY")) return "EGYPTIAN BEAUTY";

  return "";
}

// Le suffixe "S-H" dans le nom marque une gamme completement differente
// (meme si le reste du nom ressemble a un article existant, ex: "Creme
// WHITE SECRET 320grs" vs "CREME WHITE SECRET 320ML S-H") - jamais le
// meme compteur de code que la version sans "S-H".
function isShVariant(normalizedName: string): boolean {
  return normalizedName.endsWith(" S-H") || normalizedName === "S-H";
}

export function computeArticleFamilyKey(nomArticle: string | null | undefined, gamme: string | null | undefined): string {
  const resolvedGamme = normalizeFamilyValue(gamme) || detectArticleGammeFromName(nomArticle);
  const resolvedForm = detectArticleFamilyFromName(nomArticle);
  const resolvedVariant = detectArticleVariantFromName(nomArticle);
  const normalizedName = normalizeFamilyValue(nomArticle);
  const gammeKey = isShVariant(normalizedName) ? `${resolvedGamme} S-H` : resolvedGamme;
  return `${gammeKey}::${resolvedForm}::${resolvedVariant}`;
}

export function extractTrailingNumber(code: string): number | null {
  const match = code.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  return Number(match[1]);
}

// Incremente le dernier groupe de chiffres d'un code, en gardant le nombre
// de chiffres (zeros a gauche) et tout le reste identique.
// Ex: "AA2365VI/E" -> "AA2366VI/E".
export function incrementCode(code: string): string | null {
  const match = code.match(/(\d+)(?!.*\d)/);
  if (!match || match.index === undefined) return null;

  const digits = match[1];
  const nextValue = String(Number(digits) + 1).padStart(digits.length, "0");
  return code.slice(0, match.index) + nextValue + code.slice(match.index + digits.length);
}
