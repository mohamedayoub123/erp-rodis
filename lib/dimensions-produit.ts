import { supabaseServer } from "@/lib/supabase-server";

export type DimensionsArticle = {
  longueur: number | null;
  largeur: number | null;
  hauteur: number | null;
  poidsBrut: number | null;
};

// Longueur/largeur/hauteur/poids brut sont saisis par carton sur la fiche
// Produit (/produit/[type]/[id], voir app/produit/[type]/[id]/dimensions-form.tsx) -
// reutilise ici pour chiffrer le volume/poids d'une commande client.
export async function fetchDimensionsProduitsFinis(articleIds: number[]): Promise<Map<number, DimensionsArticle>> {
  const result = new Map<number, DimensionsArticle>();
  const ids = [...new Set(articleIds)];
  if (ids.length === 0) return result;

  const { data } = await supabaseServer
    .from("articles")
    .select("id, longueur, largeur, hauteur, poids_brut")
    .in("id", ids);

  for (const row of (data ?? []) as {
    id: number;
    longueur: number | null;
    largeur: number | null;
    hauteur: number | null;
    poids_brut: number | null;
  }[]) {
    result.set(row.id, {
      longueur: row.longueur,
      largeur: row.largeur,
      hauteur: row.hauteur,
      poidsBrut: row.poids_brut,
    });
  }

  return result;
}

// Volume d'1 carton en m3 - L/largeur/hauteur saisis en cm sur la fiche
// Produit (convention logistique standard pour le fret/conteneur).
export function volumeCartonM3(dim: DimensionsArticle | undefined): number | null {
  if (!dim || dim.longueur === null || dim.largeur === null || dim.hauteur === null) return null;
  return (dim.longueur * dim.largeur * dim.hauteur) / 1_000_000;
}
