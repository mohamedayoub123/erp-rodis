import { supabaseServer } from "@/lib/supabase-server";

// Familles "curees" : chacune a un bouton, une couleur, et des regles de
// correspondance (gamme, parfois nom d'article) definies a la main ici.
// Toute gamme reelle qui ne matche AUCUNE de ces familles n'est plus
// invisible pour autant - voir fetchDynamicFamilies() plus bas, qui cree un
// "bucket" automatique par gamme non couverte, pour que plus aucun article
// produit fini ne disparaisse silencieusement du tableau de commandes.
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
  "MOSTDEFENCE",
  "ANTI MOUSTIQUE",
  "PARFUME",
];

export const FAMILY_BUTTON_STYLES: Record<string, string> = {
  "White Secret": "bg-[#ff1f1f] text-white",
  "Precious Perfect": "bg-[#7f57c2] text-white",
  "Perfect Glow": "bg-[#e0a85d] text-white",
  "BB Clear": "bg-[#0dbb62] text-white",
  "BB Clear VIT C": "bg-[#f3c74c] text-white",
  Elixir: "bg-[#bf4fc9] text-white",
  "Pro White": "bg-[#fff137] text-white",
  "Luxury Cocoa": "bg-[#b78b22] text-white",
  "Luxury Avocado": "bg-[#8bc34a] text-white",
  "Egyptian Beauty": "bg-[#4f78a8] text-white",
  "MOROCCO SKIN": "bg-[#ffc31a] text-white",
  "ABSOLUTE CARE REALITY": "bg-[#171717] text-white",
  "REAL CARE R": "bg-[#f0f0f0] text-white",
  "TONE THERAPY R": "bg-[#f7ed65] text-white",
  "MY FAMILY CARE": "bg-[#6654b8] text-white",
  DERMATONE: "bg-[#d94faf] text-white",
  "Coco Clear": "bg-[#c8ecea] text-white",
  "Cocoa Skin": "bg-[#bfd9a6] text-white",
  "ECO+OFA+CDV+SKL": "bg-[#4f4f4f] text-white",
  SOOPURE: "bg-[#5b5b5b] text-white",
  "EDT RODIS": "bg-[#4f6174] text-white",
  "EDT REALITY": "bg-[#72839a] text-white",
  "MENTHOLE ETDIVERS": "bg-[#d9d9d9] text-white",
  MOSTDEFENCE: "bg-[#2e7d32] text-white",
  "ANTI MOUSTIQUE": "bg-[#ff8f00] text-white",
  PARFUME: "bg-[#c2185b] text-white",
};

// Parent family buttons that actually cover several distinct real gamme
// values - each sub-entry gets its own colored banner row inside that
// family's table, in this order.
export const FAMILY_SUBGAMMES: Record<string, { label: string; match: string; bannerClass: string }[]> = {
  "ABSOLUTE CARE REALITY": [
    { label: "WATER LILIES", match: "absolute care water lilies", bannerClass: "bg-[#1a56db] text-white" },
    { label: "ALOE VERA", match: "absolute care aloe vera", bannerClass: "bg-[#6aa84f] text-white" },
    { label: "FRESH LIME", match: "fresh lime", bannerClass: "bg-[#ffd400] text-slate-950" },
    { label: "PAPAYE", match: "absolute care papaya", bannerClass: "bg-[#e63946] text-white" },
  ],
  "REAL CARE R": [
    { label: "REAL CARE FAMILY", match: "real care family", bannerClass: "bg-[#1a56db] text-white" },
    { label: "REAL CARE MEN", match: "real care men", bannerClass: "bg-[#f5a623] text-white" },
    { label: "REAL CARE BABY", match: "real care baby", bannerClass: "bg-[#d6f5f5] text-slate-950" },
  ],
  "TONE THERAPY R": [
    { label: "TONE THERAPY INTENSE", match: "tone therapy intense", bannerClass: "bg-[#8c8c8c] text-white" },
    { label: "TONE THERAPY ADVANCED", match: "tone therapy advanced", bannerClass: "bg-[#e6e6e6] text-slate-700" },
  ],
  "MY FAMILY CARE": [
    { label: "FAMILY CARE ALMOND", match: "my family care almond", bannerClass: "bg-[#1a56db] text-white" },
    { label: "FAMILY CARE ALOE VERA", match: "my family care aloe vera", bannerClass: "bg-[#8bc34a] text-white" },
    { label: "FAMILY CARE LEMON", match: "my family care lemon", bannerClass: "bg-[#ffeb3b] text-slate-950" },
    { label: "FAMILY CARE POMEGRANATE", match: "my family care pomegranate", bannerClass: "bg-[#c76b1e] text-white" },
  ],
  "ECO+OFA+CDV+SKL": [
    { label: "SKIN LIGHT", match: "skin light", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "COEUR DE VASELINE", match: "c.d.v", bannerClass: "bg-[#a6a6a6] text-white" },
    // Meme gamme, ecrite en toutes lettres sur certains articles ("Cœur de
    // Vaseline") au lieu de l'abreviation "C.D.V" - sans cette entree ces
    // articles ne matchaient aucune famille et disparaissaient du tableau.
    { label: "COEUR DE VASELINE", match: "vaseline", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "ECO FAMILY", match: "eco family", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "ONE FOR ALL", match: "one for all", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "RAPIDE WHITE", match: "rapide white", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "VIT FEE", match: "vit fee", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "COCO BUTTEUR", match: "coco butteur", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "PINK LADIES", match: "pink ladies", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
  "EDT RODIS": [
    { label: "EDT 6SCENT", match: "6th scent", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "EDT PRETTY", match: "pretty", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "SWEET SCENT", match: "sweet scent", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "NUIT D'ORIENT", match: "nuit d", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "JANNA", match: "janna", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
  "EDT REALITY": [
    { label: "1001 NIGHTS", match: "1001 nights", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "ENCHANTED", match: "enchanted", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "GODDESS", match: "goddess", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "BOUQUET", match: "bouquet", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "ORIENTAL SCENT", match: "oriental scent", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "DEEM", match: "deem", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
  "MENTHOLE ETDIVERS": [
    { label: "MATRIX", match: "matrix", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "MENTHOL", match: "menthole", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "PARFUM", match: "parfum", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "MAMASSITA", match: "mamassita", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "AMALIA", match: "amalia", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "EFFICACITE", match: "efficacite", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "DR JOHNSON", match: "dr johnson", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
  // FOREVER CARE, EXELLENCE, AQUA BELLA, CAPITAL, O DE FEMME n'avaient
  // aucune famille avant le 07/09/2026 - decouvert via le "bouton articles
  // sans gamme" (voir articles-sans-gamme/page.tsx). PARFUME regroupe les 4
  // petites gammes parfum/body splash sur decision explicite de
  // l'utilisateur ; FOREVER CARE se divise en deux (MOSTDEFENCE et
  // l'ancienne gamme anti-moustique) - voir matchesForeverCareFamily(),
  // car ces deux-la partagent la MEME valeur "gamme" en base et ne se
  // distinguent que par le nom de l'article.
  PARFUME: [
    { label: "EXCELLENCE", match: "exellence", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "AQUA BELLA", match: "aqua bella", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "CAPITAL", match: "capital", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "O DE FEMME", match: "o de femme", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
};

export function getFamilySubGamme(family: string, gamme: string) {
  const subGammes = FAMILY_SUBGAMMES[family];
  if (!subGammes) return null;

  const gammeLower = String(gamme || "").toLowerCase();
  return subGammes.find((entry) => gammeLower.includes(entry.match)) ?? null;
}

export function familyHasSubGammeMatch(family: string, gamme: string) {
  const subGammes = FAMILY_SUBGAMMES[family];
  if (!subGammes) return false;

  const gammeLower = String(gamme || "").toLowerCase();
  return subGammes.some((entry) => gammeLower.includes(entry.match));
}

// La gamme reelle "FOREVER CARE" recouvre deux lignes commerciales
// distinctes (MOSTDEFENCE et l'ancienne anti-moustique generique) qui ne se
// distinguent que par le nom de l'article, pas par la gamme elle-meme.
function matchesForeverCareFamily(gamme: string, nomArticle: string, family: string) {
  if (String(gamme || "").toLowerCase().trim() !== "forever care") return false;
  const nameLower = String(nomArticle || "").toLowerCase();
  if (family === "MOSTDEFENCE") return nameLower.includes("mostdefence");
  if (family === "ANTI MOUSTIQUE") return nameLower.includes("mosquito");
  return false;
}

export function matchesFamilyGamme(gamme: string, nomArticle: string, family: string): boolean {
  const gammeLower = String(gamme || "").toLowerCase();
  if (family === "White Secret") {
    return gammeLower.includes("white secret");
  }
  if (matchesForeverCareFamily(gamme, nomArticle, family)) {
    return true;
  }
  // Some family buttons (ABSOLUTE CARE REALITY, REAL CARE R, TONE
  // THERAPY R...) cover several real gamme values that don't literally
  // contain the family name - group them under that one button.
  if (familyHasSubGammeMatch(family, gamme)) {
    return true;
  }
  // The real gamme value is abbreviated "bb clear v c" (no "it"), not
  // "vit c".
  if (family === "BB Clear VIT C") {
    return gammeLower.includes("bb clear v c") || gammeLower.includes("bb clear vit c");
  }
  if (family === "BB Clear") {
    return gammeLower.includes("bb clear") && !gammeLower.includes("bb clear v");
  }
  return gammeLower.includes(family.toLowerCase());
}

// Some families names are substrings of another (e.g. "BB Clear" is
// contained in "BB Clear VIT C"), so a plain substring match would put an
// article in both. Always resolve to the most specific (longest) matching
// family name.
export function resolveFamilyForGamme(
  gamme: string,
  nomArticle: string,
  families: string[] = FAMILY_ORDER
): string | null {
  let best: string | null = null;

  for (const family of families) {
    if (matchesFamilyGamme(gamme, nomArticle, family) && (!best || family.length > best.length)) {
      best = family;
    }
  }

  return best;
}

export function ilikePatternForFamily(family: string) {
  if (FAMILY_SUBGAMMES[family]) {
    // Their sub-gamme real values don't share one common prefix, so fetch
    // broadly and refine afterwards with matchesFamilyGamme instead of
    // guessing a pattern.
    return "%";
  }
  if (family === "BB Clear" || family === "BB Clear VIT C") return "%bb clear%";
  if (family === "MOSTDEFENCE" || family === "ANTI MOUSTIQUE") return "%FOREVER CARE%";
  return `%${family}%`;
}

// Toute gamme reelle presente sur au moins un article produit fini (nature
// != vrac) qui ne correspond a AUCUNE famille curee ci-dessus devient son
// propre "bucket" automatique (bouton gris, nom = la gamme telle quelle) -
// pour qu'un nouvel article (ou une gamme mal orthographiee) n'ait plus
// jamais a attendre une intervention manuelle pour redevenir visible dans
// le tableau de commandes. Voir articles-sans-gamme/page.tsx pour l'outil
// qui permet de re-affecter ces articles vers une famille curee (ou de
// renommer la gamme) au lieu de les laisser dans leur bucket automatique.
export async function fetchDynamicFamilies(): Promise<string[]> {
  const { data } = await supabaseServer.from("articles").select("gamme, nom_article, nature");

  const rows = (data as { gamme: string | null; nom_article: string | null; nature: string | null }[] | null) ?? [];
  const extra = new Set<string>();

  for (const row of rows) {
    if (row.nature === "vrac") continue;
    const gamme = String(row.gamme || "").trim();
    if (!gamme) continue;
    if (!resolveFamilyForGamme(gamme, String(row.nom_article || ""))) {
      extra.add(gamme);
    }
  }

  return [...extra].sort((a, b) => a.localeCompare(b, "fr"));
}
