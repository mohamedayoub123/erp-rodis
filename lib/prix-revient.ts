import { supabaseServer } from "@/lib/supabase-server";
import { fetchLotsInDepot, allocateFefo } from "@/app/depots/transfer-order/stock-lots";

export type CoutMpInfo = {
  coutFcfa: number; // cout TOTAL pour la quantite demandee (pas un prix unitaire)
  lots: { numeroLot: string; quantite: number; nDossErp: string | null; nDoss4d: string | null }[];
};

let depotBIdCache: number | null | undefined;

// Resolu une seule fois par process (le nom du depot ne change pas en cours
// de route) - evite de re-chercher "Depot B" a chaque appel de cout.
async function resoudreDepotBId(): Promise<number | null> {
  if (depotBIdCache !== undefined) return depotBIdCache;
  const { data } = await supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle();
  depotBIdCache = (data as { id: number } | null)?.id ?? null;
  return depotBIdCache;
}

// Cout REEL d'une quantite de MP, tiree sur les lots physiquement presents a
// Depot B (la ou la production consomme reellement) dans l'ordre FEFO (date
// d'expiration la plus proche en premier) - jamais le "dernier prix connu"
// toutes dates/tous depots confondus (un lot encore a Depot E, jamais
// transfere, n'est pas physiquement consommable et ne doit jamais fixer le
// prix). Si Depot B n'a pas assez de lots avec un prix connu pour couvrir
// TOUTE la quantite demandee pour un article, cet article est absent de la
// map retournee (jamais un cout partiel traite comme complet).
export async function fetchCoutsReelsMpDepotB(
  besoins: { articleMpId: number; quantite: number }[]
): Promise<Map<number, CoutMpInfo>> {
  const result = new Map<number, CoutMpInfo>();
  const depotBId = await resoudreDepotBId();
  if (!depotBId) return result;

  const parArticle = new Map<number, number>();
  for (const b of besoins) {
    if (b.quantite <= 0) continue;
    parArticle.set(b.articleMpId, (parArticle.get(b.articleMpId) ?? 0) + b.quantite);
  }

  await Promise.all(
    [...parArticle.entries()].map(async ([articleMpId, quantite]) => {
      const lots = await fetchLotsInDepot("MP", articleMpId, depotBId);
      const lotsAvecPrix = lots.filter((l) => l.prixUnitaireFcfa !== null);
      const { allocations, covered } = allocateFefo(lotsAvecPrix, quantite);
      if (!covered) return;

      const lotByNumero = new Map(lotsAvecPrix.map((l) => [l.numeroLot, l]));
      let coutFcfa = 0;
      const lotsUtilises: CoutMpInfo["lots"] = [];
      for (const alloc of allocations) {
        const lot = lotByNumero.get(alloc.numero_lot);
        if (!lot || lot.prixUnitaireFcfa === null) return; // ne devrait pas arriver, garde-fou
        coutFcfa += alloc.quantite * lot.prixUnitaireFcfa;
        lotsUtilises.push({
          numeroLot: alloc.numero_lot,
          quantite: alloc.quantite,
          nDossErp: lot.nDossErp,
          nDoss4d: lot.nDoss4d,
        });
      }
      result.set(articleMpId, { coutFcfa, lots: lotsUtilises });
    })
  );

  return result;
}

export function computeRecetteCost(
  lignes: { article_mp_id: number; quantite: number }[],
  couts: Map<number, CoutMpInfo>
): { coutTotal: number; lignesSansPrix: number[] } {
  let coutTotal = 0;
  const lignesSansPrix: number[] = [];

  for (const ligne of lignes) {
    const info = couts.get(ligne.article_mp_id);
    if (!info) {
      lignesSansPrix.push(ligne.article_mp_id);
      continue;
    }
    coutTotal += info.coutFcfa;
  }

  return { coutTotal, lignesSansPrix };
}

export type CoutVracInfo = {
  coutParKg: number | null;
  coutTotal: number;
  quantiteBase: number | null;
  lignesSansPrix: number[];
};

// Recharge la recette Fabrication du vrac (recettes_pf ou article_pf_id =
// vracArticleId) pour chiffrer son cout par kg - reutilise depuis la page
// Conditionnement pour ne pas dupliquer la logique de calcul.
//
// quantiteReelle (optionnel) : si connue (ex: un vrai vrac_fabrique), met a
// l'echelle les quantites de la recette AVANT de resoudre le cout FEFO Depot
// B, pour que le tirage sur les lots reflete la VRAIE quantite consommee
// (pas seulement la base theorique) - le cout par kg n'est alors plus une
// simple division lineaire, il peut refleter un melange de plusieurs lots a
// des prix differents si la quantite reelle depasse ce qu'un seul lot
// couvre. Sans ce parametre (affichage "Prix de revient" theorique), reste
// base sur quantite_recette_base comme avant.
export async function fetchCoutVracParKg(vracArticleId: number, quantiteReelle?: number): Promise<CoutVracInfo> {
  const [{ data: articleData }, { data: lignesData }] = await Promise.all([
    supabaseServer.from("articles").select("quantite_recette_base").eq("id", vracArticleId).maybeSingle(),
    supabaseServer
      .from("recettes_pf")
      .select("article_mp_id, quantite")
      .eq("article_pf_id", vracArticleId),
  ]);

  const quantiteBase = (articleData as { quantite_recette_base: number | null } | null)?.quantite_recette_base ?? null;
  const lignes = (lignesData ?? []) as { article_mp_id: number; quantite: number }[];

  const quantiteUtilisee = quantiteReelle ?? quantiteBase ?? 0;
  const ratio = quantiteBase && quantiteBase > 0 ? quantiteUtilisee / quantiteBase : 0;
  const lignesEchelle = lignes.map((l) => ({ article_mp_id: l.article_mp_id, quantite: l.quantite * ratio }));

  const couts = await fetchCoutsReelsMpDepotB(
    lignesEchelle.map((l) => ({ articleMpId: l.article_mp_id, quantite: l.quantite }))
  );
  const { coutTotal, lignesSansPrix } = computeRecetteCost(lignesEchelle, couts);

  return {
    coutParKg: quantiteUtilisee > 0 ? coutTotal / quantiteUtilisee : null,
    coutTotal,
    quantiteBase,
    lignesSansPrix,
  };
}

export type CoutCartonInfo = { coutParCarton: number | null; lignesSansPrix: number[] };

type ArticlePfCoutRow = {
  id: number;
  quantite_recette_base: number | null;
  vrac_article_id: number | null;
  vrac_quantite_recette: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

type RecetteLigneRow = { article_pf_id: number; article_mp_id: number; quantite: number };

// Meme calcul que la carte "Prix de revient" de recette-conditionnement/[id]/page.tsx
// (cout du vrac utilise + cout des articles de conditionnement, divise par
// le nombre de cartons du lot), mais chiffre PLUSIEURS produits finis en une
// poignee de requetes au lieu d'une par article - utilise par les pages
// Commandes (une commande a plusieurs lignes/articles, potentiellement
// beaucoup de commandes listees a la fois).
//
// quantitesReelles (optionnel) : article_pf_id -> vraie quantite de cartons
// produite, pour couter par tirage FEFO reel Depot B plutot que par la seule
// base theorique (meme principe que fetchCoutVracParKg). Limite connue : si
// PLUSIEURS articles de ce lot partagent le meme vrac_article_id, chacun
// resout son propre cout vrac independamment (chaque appel FEFO ne "voit"
// pas ce que l'autre a deja pris sur les memes lots) - acceptable pour un
// affichage/regroupement de commandes, pas pour 2 evenements comptables
// simultanes sur le meme vrac (qui passent par fetchCoutVracParKg directement,
// pas par cette fonction).
export async function fetchCoutsParCartonProduitsFinis(
  articlePfIds: number[],
  quantitesReelles?: Map<number, number>
): Promise<Map<number, CoutCartonInfo>> {
  const result = new Map<number, CoutCartonInfo>();
  const ids = [...new Set(articlePfIds)];
  if (ids.length === 0) return result;

  const { data: articlesData } = await supabaseServer
    .from("articles")
    .select("id, quantite_recette_base, vrac_article_id, vrac_quantite_recette, contenance, piece_par_carton")
    .in("id", ids);
  const articles = (articlesData ?? []) as ArticlePfCoutRow[];
  const articleById = new Map(articles.map((article) => [article.id, article]));

  const { data: lignesData } = await supabaseServer
    .from("recettes_pf")
    .select("article_pf_id, article_mp_id, quantite")
    .in("article_pf_id", ids);

  const lignesByPf = new Map<number, { article_mp_id: number; quantite: number }[]>();
  for (const ligne of (lignesData ?? []) as RecetteLigneRow[]) {
    const list = lignesByPf.get(ligne.article_pf_id) ?? [];
    list.push({ article_mp_id: ligne.article_mp_id, quantite: ligne.quantite });
    lignesByPf.set(ligne.article_pf_id, list);
  }

  const coutVracCache = new Map<string, CoutVracInfo>();
  async function coutVracPourArticle(vracArticleId: number, quantiteReelleVrac: number | undefined) {
    const cacheKey = `${vracArticleId}:${quantiteReelleVrac ?? "base"}`;
    const cached = coutVracCache.get(cacheKey);
    if (cached) return cached;
    const info = await fetchCoutVracParKg(vracArticleId, quantiteReelleVrac);
    coutVracCache.set(cacheKey, info);
    return info;
  }

  for (const id of ids) {
    const article = articleById.get(id);
    if (!article) continue;

    const quantiteReelleCarton = quantitesReelles?.get(id);
    const quantiteBaseCarton = article.quantite_recette_base;
    const ratioCarton =
      quantiteReelleCarton !== undefined && quantiteBaseCarton && quantiteBaseCarton > 0
        ? quantiteReelleCarton / quantiteBaseCarton
        : 1;

    const lignesConditionnementBase = lignesByPf.get(id) ?? [];
    const lignesConditionnement = lignesConditionnementBase.map((l) => ({
      article_mp_id: l.article_mp_id,
      quantite: l.quantite * ratioCarton,
    }));
    const coutsConditionnement = await fetchCoutsReelsMpDepotB(
      lignesConditionnement.map((l) => ({ articleMpId: l.article_mp_id, quantite: l.quantite }))
    );
    const { coutTotal: coutConditionnement, lignesSansPrix: lignesSansPrixConditionnement } = computeRecetteCost(
      lignesConditionnement,
      coutsConditionnement
    );

    let coutVracUtilise = 0;
    let lignesSansPrixVrac: number[] = [];
    if (article.vrac_article_id) {
      // Meme repli que la page recette-conditionnement : si la quantite de
      // vrac necessaire n'a pas ete saisie a la main, on la calcule depuis
      // contenance * piece_par_carton (pour 1 carton), plutot que de traiter
      // le cout vrac comme 0/absent.
      const qtVracAuto =
        article.contenance && article.piece_par_carton
          ? round((quantiteBaseCarton || 1) * article.piece_par_carton * article.contenance, 3)
          : null;
      const qtVracNecessaireBase = article.vrac_quantite_recette ?? qtVracAuto;
      const qtVracReelleNecessaire = qtVracNecessaireBase !== null ? qtVracNecessaireBase * ratioCarton : undefined;

      const coutVrac = await coutVracPourArticle(article.vrac_article_id, qtVracReelleNecessaire);
      if (coutVrac.coutParKg !== null && qtVracReelleNecessaire) {
        coutVracUtilise = coutVrac.coutParKg * qtVracReelleNecessaire;
      }
      lignesSansPrixVrac = coutVrac.lignesSansPrix;
    }

    const coutTotalPourQuantite = coutVracUtilise + coutConditionnement;
    const quantiteUtiliseeCarton = quantiteReelleCarton ?? quantiteBaseCarton ?? 0;
    const coutParCarton = quantiteUtiliseeCarton > 0 ? coutTotalPourQuantite / quantiteUtiliseeCarton : null;

    result.set(id, {
      coutParCarton,
      lignesSansPrix: [...lignesSansPrixConditionnement, ...lignesSansPrixVrac],
    });
  }

  return result;
}
