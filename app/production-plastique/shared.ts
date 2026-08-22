import { supabaseServer } from "@/lib/supabase-server";
import { fetchCoutsReelsMpDepotB } from "@/lib/prix-revient";

// Categories articles_matiere_premiere considerees "plastique" (fabriquees
// en interne, jamais achetees) - demande explicite : flacon/capsule/pot.
// Plusieurs variantes de nom existent en base pour la meme famille physique
// (ex: CAPSULE/CAPSULES/CAPSULES-IMP sont toutes des capsules/capots,
// FLACON/FLACONS PET sont tous des flacons) - toutes reprises ici, puis
// regroupees a l'affichage par normalizeCategoriePlastique. TOPETTE est sa
// propre famille (petit flacon a bille/roulette), distincte des flacons.
export const CATEGORIES_PLASTIQUE = [
  "FLACON",
  "FLACONS PET",
  "CAPSULE",
  "CAPSULES",
  "CAPSULES-IMP",
  "POTS",
  "TOPETTE",
] as const;

// Etiquette d'affichage regroupee - les variantes CAPSULES/CAPSULES-IMP et
// FLACONS PET s'affichent sous le meme nom que leur famille principale.
export function normalizeCategoriePlastique(categorie: string | null): string {
  if (categorie === "CAPSULES" || categorie === "CAPSULES-IMP") return "CAPSULE";
  if (categorie === "FLACONS PET") return "FLACON";
  return categorie || "-";
}

// Categories des matieres qui composent une recette plastique (resine +
// colorant) - demande explicite : seules ces 2 categories doivent
// apparaitre dans le picker "Ajouter une matiere", pas tout le catalogue MP.
export const CATEGORIES_INGREDIENT_PLASTIQUE = ["mp plastique", "COLORANT PLAS."] as const;

export type ArticlePlastiqueRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  poids_net: number | null;
};

export async function fetchArticlesPlastique(): Promise<ArticlePlastiqueRow[]> {
  const rows: ArticlePlastiqueRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, poids_net")
      .in("categorie", CATEGORIES_PLASTIQUE)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as ArticlePlastiqueRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows.sort((a, b) => a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" }));
}

export type RecettePlastiqueLigne = {
  id: number;
  article_produit_id: number;
  article_matiere_id: number;
  pourcentage: number;
};

export type CoutPlastiqueInfo = {
  coutParPiece: number | null;
  lignesSansPrix: number[];
};

// Cout REEL d'1 piece = pour chaque ligne de la recette (% + poids net de la
// piece en grammes), le poids de CETTE matiere en kg x son cout FEFO reel
// (fetchCoutsReelsMpDepotB, tous depots - meme fonction que partout
// ailleurs). Necessite poids_net renseigne sur l'article produit, sinon
// aucun cout ne peut etre chiffre (rien a convertir un % en quantite reelle).
export async function computeCoutPlastiqueParPiece(
  poidsNetGrammes: number | null,
  lignes: RecettePlastiqueLigne[]
): Promise<CoutPlastiqueInfo> {
  if (!poidsNetGrammes || poidsNetGrammes <= 0 || lignes.length === 0) {
    return { coutParPiece: null, lignesSansPrix: [] };
  }

  const besoins = lignes.map((ligne) => ({
    articleMpId: ligne.article_matiere_id,
    quantite: (poidsNetGrammes * (ligne.pourcentage / 100)) / 1000, // grammes -> kg
  }));

  const couts = await fetchCoutsReelsMpDepotB(besoins);
  let coutTotal = 0;
  const lignesSansPrix: number[] = [];

  for (const besoin of besoins) {
    const info = couts.get(besoin.articleMpId);
    if (!info) {
      lignesSansPrix.push(besoin.articleMpId);
      continue;
    }
    coutTotal += info.coutFcfa;
  }

  return { coutParPiece: coutTotal, lignesSansPrix };
}
