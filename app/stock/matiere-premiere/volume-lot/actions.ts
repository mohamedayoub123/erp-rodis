"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { lirePagesAvecLimite } from "@/lib/lecteur-valide";
import { logAudit } from "@/lib/audit-log";
import { dimensionsLotMpDisponible, SQL_DIMENSIONS_LOT } from "@/lib/dimensions-lot-mp";
import { calculerVolumeLot, codeLot, regrouperLotsArticle, type LigneLotMp } from "@/lib/volume-lot-mp";

export type DimensionsLot = { longueur: number; largeur: number; hauteur: number };

export type LotAffiche = {
  cle: string;
  numeroLot: string;
  stock: number;
  // "Depot E : 60 000 ; Depot B : 200" - ou se trouve le stock du lot
  depotsTexte: string;
  datePeremption: string | null;
  // dimensions deja enregistrees pour ce lot (null = jamais renseignees)
  dimensions: DimensionsLot | null;
};

export type LotsArticleVolume =
  | { ok: true; article: { id: number; nom: string; unite: string | null }; lots: LotAffiche[]; tableDisponible: boolean }
  | { ok: false; message: string };

export type RetourEnregistrement = { ok: true; message: string } | { ok: false; message: string };

// Lots en stock d'UN article (choisi dans le formulaire "Volume par lot MP") avec leurs dimensions deja enregistrees. Lit seulement les
// lignes de CET article (quelques lignes a quelques milliers), jamais toute la table.
export async function lireLotsArticleVolumeAction(articleId: number): Promise<LotsArticleVolume> {
  const currentUser = await getCurrentStockUser();
  if (!(await canViewPageUser(currentUser, "volumeLotMp"))) {
    return { ok: false, message: "Acces refuse." };
  }
  if (!Number.isInteger(articleId) || articleId <= 0) {
    return { ok: false, message: "Article invalide." };
  }

  try {
    const { data: article, error: erreurArticle } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, unite")
      .eq("id", articleId)
      .maybeSingle();
    if (erreurArticle) return { ok: false, message: erreurArticle.message };
    if (!article) return { ok: false, message: "Article introuvable." };

    const lignes = await lirePagesAvecLimite<LigneLotMp>(
      () =>
        supabaseServer
          .from("lots_stock_matiere_premiere")
          .select("id", { count: "exact", head: true })
          .eq("article_id", articleId),
      (debut, fin) =>
        supabaseServer
          .from("lots_stock_matiere_premiere")
          .select("numero_lot, depot_id, qte_entree, qte_sortie, date_expiration")
          .eq("article_id", articleId)
          .order("id", { ascending: true })
          .range(debut, fin) as unknown as PromiseLike<{
          data: LigneLotMp[] | null;
          error: { message: string } | null;
        }>
    );
    const lots = regrouperLotsArticle(lignes);

    const tableDisponible = await dimensionsLotMpDisponible();
    const dimensionsParCode = new Map<string, DimensionsLot>();
    if (tableDisponible) {
      const { data } = await supabaseServer
        .from("lots_mp_dimensions")
        .select("code_lot, longueur, largeur, hauteur")
        .eq("article_id", articleId);
      for (const ligne of (data ?? []) as { code_lot: string; longueur: number; largeur: number; hauteur: number }[]) {
        dimensionsParCode.set(ligne.code_lot, {
          longueur: Number(ligne.longueur),
          largeur: Number(ligne.largeur),
          hauteur: Number(ligne.hauteur),
        });
      }
    }

    const { data: depotsData } = await supabaseServer.from("depots").select("id, nom");
    const depotNomParId = new Map(((depotsData ?? []) as { id: number; nom: string }[]).map((depot) => [depot.id, depot.nom]));

    return {
      ok: true,
      article: { id: article.id as number, nom: article.nom_article as string, unite: (article.unite as string | null) ?? null },
      tableDisponible,
      lots: lots.map((lot) => ({
        cle: lot.cle,
        numeroLot: lot.numeroLot,
        stock: lot.stock,
        depotsTexte: lot.depots
          .map((depot) => {
            const nom = depot.depotId === null ? "Depot non renseigne" : depotNomParId.get(depot.depotId) ?? `Depot #${depot.depotId}`;
            return `${nom} : ${depot.stock.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}`;
          })
          .join(" ; "),
        datePeremption: lot.datePeremption,
        dimensions: dimensionsParCode.get(lot.cle) ?? null,
      })),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Lots indisponibles." };
  }
}

function lireDimensionsValides(longueur: number, largeur: number, hauteur: number): DimensionsLot | string {
  const valeurs = [longueur, largeur, hauteur];
  if (valeurs.some((valeur) => typeof valeur !== "number" || !Number.isFinite(valeur) || valeur <= 0)) {
    return "La longueur, la largeur et la hauteur doivent etre superieures a 0 (en cm).";
  }
  if (valeurs.some((valeur) => valeur > 100000)) return "Une dimension est trop grande (en cm).";
  return { longueur, largeur, hauteur };
}

type LigneDimensions = { numero_lot: string; longueur: number; largeur: number; hauteur: number };

// Enregistre (ou remplace) les dimensions du lot entier pour un article + lot. Droit "Modifier" de la page Volume par lot MP.
export async function enregistrerDimensionsLotAction(
  articleId: number,
  numeroLot: string,
  longueur: number,
  largeur: number,
  hauteur: number
): Promise<RetourEnregistrement> {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "volumeLotMp"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas enregistrer de dimensions." };
  }
  if (!Number.isInteger(articleId) || articleId <= 0) return { ok: false, message: "Article invalide." };
  const code = codeLot(numeroLot);
  if (!code) return { ok: false, message: "Choisis un lot." };
  const dimensions = lireDimensionsValides(longueur, largeur, hauteur);
  if (typeof dimensions === "string") return { ok: false, message: dimensions };
  if (!(await dimensionsLotMpDisponible())) {
    return { ok: false, message: `Pour enregistrer les dimensions, execute d'abord le SQL ${SQL_DIMENSIONS_LOT} dans Supabase (SQL Editor).` };
  }

  try {
    const { data: article } = await supabaseServer.from("articles_matiere_premiere").select("nom_article").eq("id", articleId).maybeSingle();
    if (!article) return { ok: false, message: "Article introuvable." };

    const { data: avant } = await supabaseServer
      .from("lots_mp_dimensions")
      .select("numero_lot, longueur, largeur, hauteur")
      .eq("article_id", articleId)
      .eq("code_lot", code)
      .maybeSingle();

    const { error } = await supabaseServer.from("lots_mp_dimensions").upsert(
      {
        article_id: articleId,
        code_lot: code,
        numero_lot: String(numeroLot).trim(),
        longueur: dimensions.longueur,
        largeur: dimensions.largeur,
        hauteur: dimensions.hauteur,
        utilisateur: currentUser,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "article_id,code_lot" }
    );
    if (error) return { ok: false, message: error.message };

    const volume = calculerVolumeLot(dimensions.longueur, dimensions.largeur, dimensions.hauteur);
    await logAudit({
      utilisateur: currentUser,
      module: "Volume par lot MP",
      action: avant ? "modification" : "creation",
      cible: `${article.nom_article} / lot ${String(numeroLot).trim()}`,
      resume: `Dimensions du lot ${String(numeroLot).trim()} (${article.nom_article}) : ${dimensions.longueur} x ${dimensions.largeur} x ${dimensions.hauteur} cm`,
      avant: avant ?? null,
      apres: { ...dimensions, volume_m3: volume?.m3 ?? null },
    });

    return { ok: true, message: "Dimensions enregistrees : le volume apparait dans la colonne Volume de la page Stock." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Enregistrement impossible." };
  }
}

// Retire les dimensions enregistrees d'un lot (la colonne Volume redevient vide pour ce lot). Droit "Supprimer" de la page.
export async function supprimerDimensionsLotAction(articleId: number, numeroLot: string): Promise<RetourEnregistrement> {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "volumeLotMp"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas supprimer de dimensions." };
  }
  if (!Number.isInteger(articleId) || articleId <= 0) return { ok: false, message: "Article invalide." };
  const code = codeLot(numeroLot);
  if (!code) return { ok: false, message: "Choisis un lot." };
  if (!(await dimensionsLotMpDisponible())) return { ok: false, message: "Rien a supprimer." };

  try {
    const { data: avant } = await supabaseServer
      .from("lots_mp_dimensions")
      .select("numero_lot, longueur, largeur, hauteur")
      .eq("article_id", articleId)
      .eq("code_lot", code)
      .maybeSingle<LigneDimensions>();
    if (!avant) return { ok: false, message: "Aucune dimension enregistree pour ce lot." };

    const { error } = await supabaseServer.from("lots_mp_dimensions").delete().eq("article_id", articleId).eq("code_lot", code);
    if (error) return { ok: false, message: error.message };

    const { data: article } = await supabaseServer.from("articles_matiere_premiere").select("nom_article").eq("id", articleId).maybeSingle();
    await logAudit({
      utilisateur: currentUser,
      module: "Volume par lot MP",
      action: "suppression",
      cible: `${article?.nom_article ?? `Article #${articleId}`} / lot ${avant.numero_lot}`,
      resume: `Dimensions du lot ${avant.numero_lot} supprimees`,
      avant,
      apres: null,
    });

    return { ok: true, message: "Dimensions supprimees : la colonne Volume est vide pour ce lot." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Suppression impossible." };
  }
}
