"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { lirePagesAvecLimite } from "@/lib/lecteur-valide";
import { conditionnementMpDisponible, contenanceMpDisponible, uniteContenance } from "@/lib/contenance-mp";
import { regrouperLotsArticle, type LigneLotMp } from "@/lib/volume-lot-mp";

export type ArticleVolume = {
  id: number;
  nom: string;
  unite: string | null;
  // unite dans laquelle se compte la contenance d'un colis : kg, ou pieces pour un article compte a la piece
  uniteContenance: "kg" | "pièces";
  longueur: number | null;
  largeur: number | null;
  hauteur: number | null;
  contenance: number | null;
};

export type LotAffiche = {
  cle: string;
  numeroLot: string;
  depotNom: string;
  stock: number;
  contenance: number | null;
  conditionnement: string | null;
  datePeremption: string | null;
};

export type LotsArticleVolume =
  | { ok: true; article: ArticleVolume; lots: LotAffiche[] }
  | { ok: false; message: string };

// Lots en stock d'UN article (choisi dans le formulaire "Volume par lot MP") + ses dimensions de colis deja connues, pour
// pre-remplir les champs. Lit seulement les lignes de CET article (quelques lignes a quelques milliers), jamais toute la table.
export async function lireLotsArticleVolumeAction(articleId: number): Promise<LotsArticleVolume> {
  const currentUser = await getCurrentStockUser();
  if (!(await canViewPageUser(currentUser, "volumeLotMp"))) {
    return { ok: false, message: "Acces refuse." };
  }
  if (!Number.isInteger(articleId) || articleId <= 0) {
    return { ok: false, message: "Article invalide." };
  }

  try {
    const [avecContenance, avecType] = await Promise.all([contenanceMpDisponible(), conditionnementMpDisponible()]);
    const champContenance = avecContenance ? ", contenance" : "";
    const champType = avecType ? ", conditionnement" : "";

    const { data: articleData, error: erreurArticle } = await supabaseServer
      .from("articles_matiere_premiere")
      .select(`id, nom_article, unite, longueur, largeur, hauteur${champContenance}`)
      .eq("id", articleId)
      .maybeSingle();
    if (erreurArticle) return { ok: false, message: erreurArticle.message };
    if (!articleData) return { ok: false, message: "Article introuvable." };
    const article = articleData as unknown as {
      id: number;
      nom_article: string;
      unite: string | null;
      longueur: number | null;
      largeur: number | null;
      hauteur: number | null;
      contenance?: number | null;
    };

    const lignes = await lirePagesAvecLimite<LigneLotMp>(
      () =>
        supabaseServer
          .from("lots_stock_matiere_premiere")
          .select("id", { count: "exact", head: true })
          .eq("article_id", articleId),
      (debut, fin) =>
        supabaseServer
          .from("lots_stock_matiere_premiere")
          .select(`numero_lot, depot_id, qte_entree, qte_sortie, date_expiration${champContenance}${champType}`)
          .eq("article_id", articleId)
          .order("id", { ascending: true })
          .range(debut, fin) as unknown as PromiseLike<{
          data: LigneLotMp[] | null;
          error: { message: string } | null;
        }>
    );

    const lots = regrouperLotsArticle(lignes);

    const { data: depotsData } = await supabaseServer.from("depots").select("id, nom");
    const depotNomParId = new Map(((depotsData ?? []) as { id: number; nom: string }[]).map((depot) => [depot.id, depot.nom]));

    return {
      ok: true,
      article: {
        id: article.id,
        nom: article.nom_article,
        unite: article.unite,
        uniteContenance: uniteContenance(article.unite),
        longueur: article.longueur ?? null,
        largeur: article.largeur ?? null,
        hauteur: article.hauteur ?? null,
        contenance: article.contenance ?? null,
      },
      lots: lots.map((lot) => ({
        cle: lot.cle,
        numeroLot: lot.numeroLot,
        depotNom: lot.depotId === null ? "Depot non renseigne" : depotNomParId.get(lot.depotId) ?? `Depot #${lot.depotId}`,
        stock: lot.stock,
        contenance: lot.contenance,
        conditionnement: lot.conditionnement,
        datePeremption: lot.datePeremption,
      })),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Lots indisponibles." };
  }
}
