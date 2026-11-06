import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import { lirePagesAvecLimite } from "@/lib/lecteur-valide";
import { calculerVolumeLot, cleDimensionsLot } from "@/lib/volume-lot-mp";

// Dimensions des LOTS (table lots_mp_dimensions, voir scripts/sql/add_dimensions_lot_mp.sql) : une ligne par article + lot. Tant que ce SQL
// n'est pas execute, la table n'existe pas : rien n'est lu, rien n'est ecrit, et la colonne Volume de la page Stock reste vide.
export const SQL_DIMENSIONS_LOT = "scripts/sql/add_dimensions_lot_mp.sql";

export type DimensionsLotLue = {
  articleId: number;
  codeLot: string;
  numeroLot: string;
  longueur: number;
  largeur: number;
  hauteur: number;
};

export const dimensionsLotMpDisponible = cache(async (): Promise<boolean> => {
  const { error } = await supabaseServer.from("lots_mp_dimensions").select("article_id").limit(1);
  return !error;
});

type LigneBrute = { article_id: number; code_lot: string; numero_lot: string; longueur: number; largeur: number; hauteur: number };

function versDimensions(ligne: LigneBrute): DimensionsLotLue {
  return {
    articleId: ligne.article_id,
    codeLot: ligne.code_lot,
    numeroLot: ligne.numero_lot,
    longueur: Number(ligne.longueur),
    largeur: Number(ligne.largeur),
    hauteur: Number(ligne.hauteur),
  };
}

// Dimensions enregistrees des lots de QUELQUES articles (ceux des lignes affichees) ; liste vide si la table n'existe pas encore
export async function lireDimensionsLotsDesArticles(articleIds: number[]): Promise<DimensionsLotLue[]> {
  const ids = [...new Set(articleIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return [];
  const { data, error } = await supabaseServer
    .from("lots_mp_dimensions")
    .select("article_id, code_lot, numero_lot, longueur, largeur, hauteur")
    .in("article_id", ids);
  if (error) return [];
  return ((data ?? []) as LigneBrute[]).map(versDimensions);
}

// Toutes les dimensions enregistrees (export Excel) ; liste vide si la table n'existe pas encore
export async function lireToutesDimensionsLots(): Promise<DimensionsLotLue[]> {
  try {
    const lignes = await lirePagesAvecLimite<LigneBrute>(
      () => supabaseServer.from("lots_mp_dimensions").select("article_id", { count: "exact", head: true }),
      (debut, fin) =>
        supabaseServer
          .from("lots_mp_dimensions")
          .select("article_id, code_lot, numero_lot, longueur, largeur, hauteur")
          .order("article_id", { ascending: true })
          .order("code_lot", { ascending: true })
          .range(debut, fin) as unknown as PromiseLike<{ data: LigneBrute[] | null; error: { message: string } | null }>
    );
    return lignes.map(versDimensions);
  } catch {
    return [];
  }
}

// Volume en m3 de chaque lot qui a des dimensions, par cle "article|LOT" (voir cleDimensionsLot) : sert a remplir la colonne Volume
export function volumesParCleLot(dimensions: DimensionsLotLue[]): Map<string, number> {
  const volumes = new Map<string, number>();
  for (const dim of dimensions) {
    const volume = calculerVolumeLot(dim.longueur, dim.largeur, dim.hauteur);
    const cle = cleDimensionsLot(dim.articleId, dim.codeLot);
    if (volume && cle) volumes.set(cle, volume.m3);
  }
  return volumes;
}
