import { supabaseServer } from "@/lib/supabase-server";
import { fetchCoutsReelsMpDepotB } from "@/lib/prix-revient";

// Categorie large regroupant tout article plastique fabrique en interne
// (flacon/capsule/pot...), jamais achete - demande explicite : au lieu
// d'une liste figee de sous-types (fragile, cassee des qu'un sous-type est
// renomme/ajoute cote catalogue - voir l'ancien CATEGORIES_PLASTIQUE),
// s'appuie sur cette etiquette large stable. articles_matiere_premiere.
// categorie porte cette etiquette large ; sous_famille porte le sous-type
// precis (CAPSULE, FLACON, FLACON PET, POT, POT PET...) affiche a l'ecran.
export const CATEGORIE_PLASTIQUE = "ARTICLE DE CONDITIONNEMENT PLASTIQUE";

// Les sous-types (sous_famille) sont deja normalises au catalogue depuis le
// nettoyage categorie/sous_famille (plus de variantes CAPSULES/CAPSULES-IMP/
// FLACONS PET/POTS/POTS PET a regrouper) - ne fait plus que le repli "-".
export function normalizeCategoriePlastique(categorie: string | null): string {
  return categorie || "-";
}

// Categories des matieres qui composent une recette plastique (resine +
// colorant) - demande explicite : seules ces 2 categories doivent
// apparaitre dans le picker "Ajouter une matiere", pas tout le catalogue MP.
// "COLORANT PLAS." (abrege) ne correspondait a aucune valeur reelle du
// catalogue (toujours "COLORANT PLASTIQUE" en entier) - aucun colorant
// n'apparaissait jamais dans le picker, bug decouvert en verifiant les
// valeurs reelles suite a l'echange categorie/sous_famille.
export const CATEGORIES_INGREDIENT_PLASTIQUE = ["mp plastique", "COLORANT PLASTIQUE"] as const;

// Depots par defaut du programme plastique - la production entre toujours
// dans le depot "fabrication" (F) puis part immediatement vers le depot
// "utilisable" (E) via un Transfer Order auto-approuve. Modifiables ligne
// par ligne depuis le formulaire (voir programme/page.tsx).
export const DEPOT_PLASTIQUE_SOURCE_DEFAULT = 4;
export const DEPOT_PLASTIQUE_DEST_DEFAULT = 3;

export type ArticlePlastiqueRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  poids_net: number | null;
  depot_id: number | null;
};

export async function fetchArticlesPlastique(): Promise<ArticlePlastiqueRow[]> {
  const rows: ArticlePlastiqueRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, sous_famille, poids_net, depot_id")
      .eq("categorie", CATEGORIE_PLASTIQUE)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (
      (data ?? []) as { id: number; nom_article: string; sous_famille: string | null; poids_net: number | null; depot_id: number | null }[]
    ).map((row) => ({
      id: row.id,
      nom_article: row.nom_article,
      categorie: row.sous_famille,
      poids_net: row.poids_net,
      depot_id: row.depot_id,
    }));
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
