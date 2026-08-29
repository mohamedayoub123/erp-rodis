import { supabaseServer } from "@/lib/supabase-server";
import { fetchLotsAllDepotsBatch, allocateFefo, type DepotLot } from "@/app/depots/transfer-order/stock-lots";
import { convertirEnFcfa } from "@/lib/prix-devise";

// Cache optionnel {articleMpId -> lots deja recuperes} partage par
// l'appelant (voir fetchCoutsParCartonProduitsFinis) - evite de re-fetcher
// Supabase pour le meme article MP a chaque produit fini qui le partage dans
// sa recette (ex: le meme carton/sleeve utilise par 50 produits differents,
// autrement re-fetch 50 fois pour rien sur une page Commandes).
export type LotsMpCache = Map<number, DepotLot[]>;

export type CoutMpInfo = {
  coutFcfa: number; // cout TOTAL pour la quantite demandee (pas un prix unitaire)
  lots: {
    numeroLot: string;
    quantite: number;
    prixUnitaireFcfa: number;
    nDossErp: string | null;
    nDoss4d: string | null;
  }[];
};

// Cout REEL d'une quantite de MP, tiree sur les lots MP connus dans l'ordre
// FEFO (date d'expiration la plus proche en premier), TOUS depots confondus
// - demande explicite : le prix d'un lot compte des qu'il est connu, peu
// importe dans quel depot il se trouve physiquement aujourd'hui (avant,
// restreint au seul Depot B - "la ou la production consomme reellement" -
// ce qui empechait de chiffrer des lots pourtant recus mais pas encore
// transferes). Si pas assez de lots avec un prix connu pour couvrir TOUTE la
// quantite demandee pour un article, seule la portion couverte par un prix
// connu est chiffree - le reste (aucun prix connu, ou stock insuffisant a
// prix connu) est ignore comme s'il n'existait pas, plutot que de faire
// echouer tout le calcul pour un seul ingredient sans prix (demande
// explicite : la tres grande majorite des articles MP n'ont aujourd'hui
// aucun prix connu, un calcul "tout ou rien" ne donnait donc quasiment
// jamais de cout du tout).
export async function fetchCoutsReelsMpDepotB(
  besoins: { articleMpId: number; quantite: number }[],
  lotCache?: LotsMpCache
): Promise<Map<number, CoutMpInfo>> {
  const result = new Map<number, CoutMpInfo>();

  const parArticle = new Map<number, number>();
  for (const b of besoins) {
    if (b.quantite <= 0) continue;
    parArticle.set(b.articleMpId, (parArticle.get(b.articleMpId) ?? 0) + b.quantite);
  }

  // Un seul aller-retour pour TOUS les articles MP pas deja en cache, au
  // lieu d'une requete par article - avec 50-100+ ingredients distincts
  // (une commande a plusieurs produits finis), autant de requetes
  // individuelles restait lent meme lancees en parallele (mesure : 2s+, le
  // nombre de requetes simultanees devenant lui-meme le goulot
  // d'etranglement).
  const articleIdsAFetcher = [...parArticle.keys()].filter((id) => !lotCache?.has(id));
  if (articleIdsAFetcher.length > 0) {
    const fetched = await fetchLotsAllDepotsBatch("MP", articleIdsAFetcher);
    for (const articleMpId of articleIdsAFetcher) {
      lotCache?.set(articleMpId, fetched.get(articleMpId) ?? []);
    }
  }

  for (const [articleMpId, quantite] of parArticle.entries()) {
    const lots = lotCache?.get(articleMpId) ?? [];
    const lotsAvecPrix = lots.filter((l) => l.prixUnitaireFcfa !== null);
    const { allocations } = allocateFefo(lotsAvecPrix, quantite);

    const lotByNumero = new Map(lotsAvecPrix.map((l) => [l.numeroLot, l]));
    let coutFcfa = 0;
    const lotsUtilises: CoutMpInfo["lots"] = [];
    for (const alloc of allocations) {
      const lot = lotByNumero.get(alloc.numero_lot);
      if (!lot || lot.prixUnitaireFcfa === null) continue; // ne devrait pas arriver, garde-fou
      coutFcfa += alloc.quantite * lot.prixUnitaireFcfa;
      lotsUtilises.push({
        numeroLot: alloc.numero_lot,
        quantite: alloc.quantite,
        prixUnitaireFcfa: lot.prixUnitaireFcfa,
        nDossErp: lot.nDossErp,
        nDoss4d: lot.nDoss4d,
      });
    }
    result.set(articleMpId, { coutFcfa, lots: lotsUtilises });
  }

  return result;
}

export type LotUtiliseInfo = { articleMpId: number; numeroLot: string; quantite: number; prixUnitaireFcfa: number };

// A plat (tous articles MP confondus) pour pouvoir enregistrer d'un coup
// via enregistrerLotsUtilisesPourEcriture (lib/comptabilite.ts) - trace de
// tracabilite pour le recalcul automatique en cascade quand un prix de lot
// est corrige apres coup.
export function flattenLotsUtilises(couts: Map<number, CoutMpInfo>): LotUtiliseInfo[] {
  const flat: LotUtiliseInfo[] = [];
  for (const [articleMpId, info] of couts.entries()) {
    for (const lot of info.lots) {
      flat.push({
        articleMpId,
        numeroLot: lot.numeroLot,
        quantite: lot.quantite,
        prixUnitaireFcfa: lot.prixUnitaireFcfa,
      });
    }
  }
  return flat;
}

// Prix REEL d'un lot MP precis, tire de sa ligne d'ENTREE (la reception qui
// l'a cree) - jamais une estimation FEFO, puisqu'on connait deja EXACTEMENT
// quel lot a physiquement servi (via une reservation production_mp_reserve
// existante). Retourne null si ce lot precis n'a aucun prix connu.
async function resoudrePrixLotConnu(articleMpId: number, numeroLot: string): Promise<number | null> {
  const { data } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("prix_unitaire, devise, taux_change")
    .eq("article_id", articleMpId)
    .eq("numero_lot", numeroLot)
    .gt("qte_entree", 0)
    .not("prix_unitaire", "is", null)
    .limit(1)
    .maybeSingle();
  const row = data as { prix_unitaire: number | null; devise: string | null; taux_change: number | null } | null;
  if (!row || row.prix_unitaire == null) return null;
  return convertirEnFcfa(row.prix_unitaire, row.devise, row.taux_change);
}

export type CoutReserveInfo = { coutFcfa: number; lotsUtilises: LotUtiliseInfo[]; lignesSansPrix: number[] };

// Version groupee de fetchCoutReelDepuisReservation, pour plusieurs codes a
// la fois - la page Cout Reel par article (tout l'historique par defaut)
// appelait l'equivalent de fetchCoutReelDepuisReservation + resoudrePrixLotConnu
// UNE FOIS PAR CODE, en sequence (jusqu'a 90+ codes pour un article ancien,
// x2 stages) : mesure reelle, ~500ms par aller-retour, extrapole a 90+ sec
// pour l'article le plus charge. Ici : 3 requetes groupees au total (peu
// importe le nombre de codes), au lieu d'une cascade en cours-du-jour ->
// reservation -> prix par code. Retourne une Map cle "programmeLigneId::code"
// -> CoutReserveInfo (absente si aucune reservation tracee pour ce code,
// meme semantique que le retour null de fetchCoutReelDepuisReservation).
export async function fetchCoutsReelsDepuisReservationBatch(
  codes: { programmeLigneId: number; code: string }[],
  stage: "pesage" | "salle_conditionnement"
): Promise<Map<string, CoutReserveInfo>> {
  const result = new Map<string, CoutReserveInfo>();
  if (codes.length === 0) return result;

  const ligneIds = [...new Set(codes.map((c) => c.programmeLigneId))];

  const termineRows: { id: number; programme_ligne_id: number; code: string }[] = [];
  {
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabaseServer
        .from("production_code_termine")
        .select("id, programme_ligne_id, code")
        .eq("stage", stage)
        .in("programme_ligne_id", ligneIds)
        .range(from, from + pageSize - 1);
      if (error) break;
      const chunk = (data ?? []) as { id: number; programme_ligne_id: number; code: string }[];
      termineRows.push(...chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
  }

  const wantedKeys = new Set(codes.map((c) => `${c.programmeLigneId}::${c.code}`));
  const termineIdToKey = new Map<number, string>();
  for (const row of termineRows) {
    const key = `${row.programme_ligne_id}::${row.code}`;
    if (wantedKeys.has(key)) termineIdToKey.set(row.id, key);
  }
  const termineIds = [...termineIdToKey.keys()];
  if (termineIds.length === 0) return result;

  type ReserveRow = {
    production_code_termine_id: number;
    article_mp_id: number;
    numero_lot: string | null;
    quantite_initiale: number;
    quantite: number;
  };
  const reserveRows: ReserveRow[] = [];
  {
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabaseServer
        .from("production_mp_reserve")
        .select("production_code_termine_id, article_mp_id, numero_lot, quantite_initiale, quantite")
        .in("production_code_termine_id", termineIds)
        .range(from, from + pageSize - 1);
      if (error) break;
      const chunk = (data ?? []) as ReserveRow[];
      reserveRows.push(...chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
  }

  const articleMpIds = [...new Set(reserveRows.map((r) => r.article_mp_id))];
  const priceByKey = new Map<string, number>();
  if (articleMpIds.length > 0) {
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabaseServer
        .from("lots_stock_matiere_premiere")
        .select("article_id, numero_lot, prix_unitaire, devise, taux_change")
        .in("article_id", articleMpIds)
        .gt("qte_entree", 0)
        .not("prix_unitaire", "is", null)
        .range(from, from + pageSize - 1);
      if (error) break;
      const chunk = (data ?? []) as {
        article_id: number;
        numero_lot: string | null;
        prix_unitaire: number | null;
        devise: string | null;
        taux_change: number | null;
      }[];
      for (const row of chunk) {
        if (!row.numero_lot || row.prix_unitaire == null) continue;
        const key = `${row.article_id}::${row.numero_lot}`;
        if (priceByKey.has(key)) continue; // meme choix arbitraire que .limit(1) cote appel individuel
        const prixFcfa = convertirEnFcfa(row.prix_unitaire, row.devise, row.taux_change);
        if (prixFcfa !== null) priceByKey.set(key, prixFcfa);
      }
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
  }

  const reservesByTermineId = new Map<number, ReserveRow[]>();
  for (const row of reserveRows) {
    const list = reservesByTermineId.get(row.production_code_termine_id) ?? [];
    list.push(row);
    reservesByTermineId.set(row.production_code_termine_id, list);
  }

  for (const [termineId, key] of termineIdToKey.entries()) {
    const reserves = reservesByTermineId.get(termineId) ?? [];
    if (reserves.length === 0) continue;

    let coutFcfa = 0;
    const lotsUtilises: LotUtiliseInfo[] = [];
    const lignesSansPrix: number[] = [];
    for (const reserve of reserves) {
      const consomme = Math.max(0, reserve.quantite_initiale - reserve.quantite);
      if (consomme <= 1e-9 || !reserve.numero_lot) continue;
      const prixUnitaireFcfa = priceByKey.get(`${reserve.article_mp_id}::${reserve.numero_lot}`);
      if (prixUnitaireFcfa === undefined) {
        lignesSansPrix.push(reserve.article_mp_id);
        continue;
      }
      coutFcfa += consomme * prixUnitaireFcfa;
      lotsUtilises.push({
        articleMpId: reserve.article_mp_id,
        numeroLot: reserve.numero_lot,
        quantite: consomme,
        prixUnitaireFcfa,
      });
    }
    result.set(key, { coutFcfa, lotsUtilises, lignesSansPrix });
  }

  return result;
}

// Cout REEL d'une production a partir des lots EFFECTIVEMENT reserves/tires
// pour elle (production_mp_reserve garde une trace exacte lot par lot,
// quantite_initiale ne bouge jamais meme apres consommation complete).
// Contrairement a fetchCoutsReelsMpDepotB (qui devine par FEFO sur le stock
// ACTUEL), ceci retrouve le VRAI lot utilise a l'epoque, meme si ce lot est
// aujourd'hui epuise ou remplace dans l'ordre FEFO - demande explicite :
// "AA4263 a deja tout ca (les vrais lots), il faut qu'il prenne ca", plutot
// qu'une approximation recalculee. Retourne null si aucune reservation
// tracee n'existe pour cette production (systeme trop ancien, avant la mise
// en place du suivi par lot) - dans ce cas l'appelant doit se rabattre sur
// une autre methode ou ignorer l'ecriture, jamais inventer un cout.
export async function fetchCoutReelDepuisReservation(
  productionCodeTermineId: number
): Promise<CoutReserveInfo | null> {
  const { data } = await supabaseServer
    .from("production_mp_reserve")
    .select("article_mp_id, numero_lot, quantite_initiale, quantite")
    .eq("production_code_termine_id", productionCodeTermineId);
  const reserves = (data ?? []) as {
    article_mp_id: number;
    numero_lot: string | null;
    quantite_initiale: number;
    quantite: number;
  }[];
  if (reserves.length === 0) return null;

  let coutFcfa = 0;
  const lotsUtilises: LotUtiliseInfo[] = [];
  const lignesSansPrix: number[] = [];

  for (const reserve of reserves) {
    const consomme = Math.max(0, reserve.quantite_initiale - reserve.quantite);
    if (consomme <= 1e-9 || !reserve.numero_lot) continue;

    const prixUnitaireFcfa = await resoudrePrixLotConnu(reserve.article_mp_id, reserve.numero_lot);
    if (prixUnitaireFcfa === null) {
      lignesSansPrix.push(reserve.article_mp_id);
      continue;
    }

    coutFcfa += consomme * prixUnitaireFcfa;
    lotsUtilises.push({
      articleMpId: reserve.article_mp_id,
      numeroLot: reserve.numero_lot,
      quantite: consomme,
      prixUnitaireFcfa,
    });
  }

  return { coutFcfa, lotsUtilises, lignesSansPrix };
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
  lotsUtilises: LotUtiliseInfo[];
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
export async function fetchCoutVracParKg(
  vracArticleId: number,
  quantiteReelle?: number,
  lotCache?: LotsMpCache
): Promise<CoutVracInfo> {
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
    lignesEchelle.map((l) => ({ articleMpId: l.article_mp_id, quantite: l.quantite })),
    lotCache
  );
  const { coutTotal, lignesSansPrix } = computeRecetteCost(lignesEchelle, couts);

  return {
    coutParKg: quantiteUtilisee > 0 ? coutTotal / quantiteUtilisee : null,
    coutTotal,
    quantiteBase,
    lotsUtilises: flattenLotsUtilises(couts),
    lignesSansPrix,
  };
}

export type CoutCartonInfo = {
  coutParCarton: number | null;
  lignesSansPrix: number[];
  lotsUtilises: LotUtiliseInfo[];
};

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
// produite, pour couter par tirage FEFO reel (tous depots) plutot que par la
// seule base theorique (meme principe que fetchCoutVracParKg). Limite connue : si
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

  // Cache des lots MP deja recuperes, PARTAGE entre tous les articles PF de
  // cet appel - sans lui, chaque ingredient commun a plusieurs produits
  // (carton, sleeve, capsule...) etait re-fetch depuis Supabase une fois par
  // produit fini (cause reelle de lenteur constatee sur la page Commandes,
  // des dizaines d'appels reseau redondants pour les memes lots).
  const lotCache: LotsMpCache = new Map();

  const coutVracCache = new Map<string, CoutVracInfo>();
  async function coutVracPourArticle(vracArticleId: number, quantiteReelleVrac: number | undefined) {
    const cacheKey = `${vracArticleId}:${quantiteReelleVrac ?? "base"}`;
    const cached = coutVracCache.get(cacheKey);
    if (cached) return cached;
    const info = await fetchCoutVracParKg(vracArticleId, quantiteReelleVrac, lotCache);
    coutVracCache.set(cacheKey, info);
    return info;
  }

  // Produits finis traites EN PARALLELE (plus seulement un par un) - le
  // cache lotCache/coutVracCache partage evite le travail redondant meme
  // sous concurrence (au pire, un ingredient tout juste nouveau est
  // fetch 2 fois au lieu d'une si 2 produits le decouvrent au meme instant -
  // sans consequence, juste une petite perte d'efficacite ponctuelle).
  await Promise.all(
    ids.map(async (id) => {
      const article = articleById.get(id);
      if (!article) return;

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
        lignesConditionnement.map((l) => ({ articleMpId: l.article_mp_id, quantite: l.quantite })),
        lotCache
      );
      const { coutTotal: coutConditionnement, lignesSansPrix: lignesSansPrixConditionnement } = computeRecetteCost(
        lignesConditionnement,
        coutsConditionnement
      );

      let coutVracUtilise = 0;
      let lignesSansPrixVrac: number[] = [];
      let lotsUtiliseesVrac: LotUtiliseInfo[] = [];
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
        lotsUtiliseesVrac = coutVrac.lotsUtilises;
      }

      const coutTotalPourQuantite = coutVracUtilise + coutConditionnement;
      const quantiteUtiliseeCarton = quantiteReelleCarton ?? quantiteBaseCarton ?? 0;
      const coutParCarton = quantiteUtiliseeCarton > 0 ? coutTotalPourQuantite / quantiteUtiliseeCarton : null;

      result.set(id, {
        coutParCarton,
        lignesSansPrix: [...lignesSansPrixConditionnement, ...lignesSansPrixVrac],
        lotsUtilises: [...flattenLotsUtilises(coutsConditionnement), ...lotsUtiliseesVrac],
      });
    })
  );

  return result;
}
