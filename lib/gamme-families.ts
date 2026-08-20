// Meme ordre et meme logique de rapprochement gamme -> famille que
// app/tableau-commandes/page.tsx (FAMILY_ORDER / matchesFamilyGamme /
// resolveFamilyForGamme), extraits ici pour que d'autres pages (Articles)
// puissent trier dans le meme ordre sans dupliquer la logique de matching.
export const FAMILY_ORDER = [
  "White Secret",
  "Precious Perfect",
  "Perfect Glow",
  "BB Clear",
  "BB Clear VIT C",
  "Elixir",
  "Pro White",
  "Luxury Cocoa",
  "Luxury Avocado",
  "Egyptian Beauty",
  "MOROCCO SKIN",
  "ABSOLUTE CARE REALITY",
  "REAL CARE R",
  "TONE THERAPY R",
  "MY FAMILY CARE",
  "DERMATONE",
  "Coco Clear",
  "Cocoa Skin",
  "ECO+OFA+CDV+SKL",
  "SOOPURE",
  "EDT RODIS",
  "EDT REALITY",
  "MENTHOLE ETDIVERS",
];

const FAMILY_SUBGAMMES: Record<string, { match: string }[]> = {
  "ABSOLUTE CARE REALITY": [
    { match: "absolute care water lilies" },
    { match: "absolute care aloe vera" },
    { match: "fresh lime" },
    { match: "absolute care papaya" },
  ],
  "REAL CARE R": [
    { match: "real care family" },
    { match: "real care men" },
    { match: "real care baby" },
  ],
  "TONE THERAPY R": [{ match: "tone therapy intense" }, { match: "tone therapy advanced" }],
  "MY FAMILY CARE": [
    { match: "my family care almond" },
    { match: "my family care aloe vera" },
    { match: "my family care lemon" },
    { match: "my family care pomegranate" },
  ],
  "ECO+OFA+CDV+SKL": [
    { match: "skin light" },
    { match: "c.d.v" },
    { match: "eco family" },
    { match: "one for all" },
    { match: "rapide white" },
    { match: "vit fee" },
    { match: "coco butteur" },
    { match: "pink ladies" },
  ],
  "EDT RODIS": [
    { match: "6th scent" },
    { match: "pretty" },
    { match: "sweet scent" },
    { match: "nuit d" },
    { match: "janna" },
  ],
  "EDT REALITY": [
    { match: "1001 nights" },
    { match: "enchanted" },
    { match: "goddess" },
    { match: "bouquet" },
    { match: "oriental scent" },
    { match: "deem" },
  ],
  "MENTHOLE ETDIVERS": [
    { match: "matrix" },
    { match: "menthole" },
    { match: "parfum" },
    { match: "mamassita" },
    { match: "amalia" },
    { match: "efficacite" },
    { match: "dr johnson" },
  ],
};

function familyHasSubGammeMatch(family: string, gamme: string) {
  const subGammes = FAMILY_SUBGAMMES[family];
  if (!subGammes) return false;

  const gammeLower = String(gamme || "").toLowerCase();
  return subGammes.some((entry) => gammeLower.includes(entry.match));
}

function matchesFamilyGamme(gamme: string, family: string) {
  const gammeLower = String(gamme || "").toLowerCase();
  if (family === "White Secret") {
    return gammeLower.includes("white secret");
  }
  if (familyHasSubGammeMatch(family, gamme)) {
    return true;
  }
  if (family === "BB Clear VIT C") {
    return gammeLower.includes("bb clear v c") || gammeLower.includes("bb clear vit c");
  }
  return gammeLower.includes(family.toLowerCase());
}

// Resout le nom de famille (au sens FAMILY_ORDER) le plus specifique pour
// une valeur de gamme brute - retourne null si aucune famille ne matche.
export function resolveFamilyForGamme(gamme: string | null | undefined) {
  let best: string | null = null;

  for (const family of FAMILY_ORDER) {
    if (matchesFamilyGamme(gamme || "", family) && (!best || family.length > best.length)) {
      best = family;
    }
  }

  return best;
}

export function familyRank(gamme: string | null | undefined) {
  const family = resolveFamilyForGamme(gamme);
  if (!family) return FAMILY_ORDER.length;
  const index = FAMILY_ORDER.indexOf(family);
  return index === -1 ? FAMILY_ORDER.length : index;
}

// Meme logique que getWhiteSecretArticleRank/getWhiteSecretContenance dans
// app/tableau-commandes/page.tsx : classe un article par type de produit
// (Lait, Creme, DSR...) puis par contenance decroissante - utilise partout
// dans le tableau de commande (pas seulement pour White Secret).
export function articleTypeRank(nomArticle: string | null | undefined) {
  const value = String(nomArticle || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  if (value.endsWith("S-H")) return 99;
  if (value.startsWith("LAIT ")) return 1;
  if (value.startsWith("CREME ")) return 2;
  if (value.startsWith("DSR ")) return 3;
  if (value.startsWith("HUILE ")) return 4;
  if (value.startsWith("SERUM ")) return 5;
  if (value.startsWith("SAVON ")) return 6;
  if (value.startsWith("GEL DOUCHE ")) return 7;
  if (value.startsWith("EDC ")) return 8;
  if (value.startsWith("POMMADE ")) return 9;
  if (value.startsWith("TALC ")) return 10;

  return 50;
}

// Retire la contenance (ex: "200ml", "140 GRS") du nom d'un article, pour
// un affichage plus compact - meme motif de reconnaissance que
// articleContenanceFromName ci-dessous, en preservant la casse d'origine.
export function stripContenanceFromName(nomArticle: string | null | undefined) {
  const value = String(nomArticle || "");
  return value
    .replace(/\s*\d+(?:[.,]\d+)?\s*(KG|GRS|G|ML|L)\b/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Prefixe "Vrac" devant le nom (contenance deja retiree) - utilise sur le
// tableau Fabrication (vrac) du Dashboard Production.
export function vracLabelFromName(nomArticle: string | null | undefined) {
  const withoutContenance = stripContenanceFromName(nomArticle);
  if (!withoutContenance) return "";
  return `Vrac ${withoutContenance}`;
}

export function articleContenanceFromName(nomArticle: string | null | undefined) {
  const value = String(nomArticle || "").toUpperCase();
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(KG|GRS|G|ML|L)\b/);

  if (!match) return 0;

  const amount = Number(String(match[1]).replace(",", ".")) || 0;
  const unit = match[2];

  if (unit === "L") return amount * 1000;
  if (unit === "KG") return amount * 1000;
  if (unit === "G" || unit === "GRS") return amount;
  return amount;
}
