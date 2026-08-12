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
const CLARIFIANT_TOKENS = new Set(["CLARIFIANT", "CLARIFIANTE"]);
const SIZE_TOKEN_PATTERN = /^\d+(?:[.,]\d+)?(?:ML|CL|L|GRS|GR|G|KG)?$/;
// Contenances/formats exprimes en mot plutot qu'en chiffre (Std=standard,
// Gt=grand tube, Rgl=regulier...) - au meme titre que "500ML" ou "1L", ce
// sont des tailles differentes du MEME produit, donc a retirer de la cle de
// famille pour qu'elles partagent un seul compteur de code (ex: "Creme Skin
// Light Gt/Rgl/Std" doivent avoir le meme code, pas 3 codes separes).
const PACKAGING_SIZE_TOKENS = new Set(["STD", "GT", "RGL"]);

export function detectArticleVariantFromName(name: string | null | undefined): string {
  const words = normalizeFamilyValue(name).split(" ");
  if (words.some((word) => EXFOLIANT_TOKENS.has(word))) return "EXFOLIANT";
  return "CLARIFIANT";
}

// Le nom complet sert de cle (moins la contenance/taille et le marqueur de
// variante Clarifiant/Exfoliant en fin de nom), jamais juste le 1er mot ou
// une categorie de forme (Lait/Creme/Gel douche...) - sinon 2 produits
// totalement differents qui partagent juste le meme 1er mot ou la meme
// categorie (ex: "POMMADE MENTHOLATA 125ML" et "POMMADE WHITE CAT 125ML",
// meme gamme "Menthole") se retrouvent regroupes dans la meme famille et
// partagent a tort le meme code/lot. Ca reste compatible avec le partage
// voulu entre contenances d'un MEME produit : "Gel Douche White Secret 1L"
// et "Gel Douche White Secret 500ml Clarifiant" ont le meme nom une fois la
// contenance ET le marqueur de variante retires (le marqueur est deja gere
// separement par detectArticleVariantFromName ci-dessus, le laisser ici
// romprait le regroupement des lors qu'un seul des 2 noms le precise
// explicitement) - seule la contenance doit differer pour partager la
// famille, pas le reste du nom.
export function detectArticleFamilyFromName(name: string | null | undefined): string {
  const words = normalizeFamilyValue(name).split(" ");

  // "S-H" est deja gere separement par isShVariant (bascule toute la gamme,
  // pas seulement la forme) - le retirer ici aussi evite qu'il reste coince
  // devant la contenance et empeche par erreur 2 contenances S-H du meme
  // produit de partager leur famille (ex: "... 500ML S-H" et "... 300ML
  // S-H" doivent quand meme matcher une fois taille+S-H retires).
  while (words.length > 1) {
    const lastWord = words[words.length - 1];
    if (
      SIZE_TOKEN_PATTERN.test(lastWord) ||
      PACKAGING_SIZE_TOKENS.has(lastWord) ||
      EXFOLIANT_TOKENS.has(lastWord) ||
      CLARIFIANT_TOKENS.has(lastWord) ||
      lastWord === "S-H"
    ) {
      words.pop();
      continue;
    }
    break;
  }

  return words.join(" ");
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
