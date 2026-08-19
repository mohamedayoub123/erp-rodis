import { supabaseServer } from "@/lib/supabase-server";
import { convertirEnFcfa } from "@/lib/prix-devise";

export type CoutMpInfo = { coutFcfa: number; source: "lot" | "bc" };

type LotRow = {
  article_id: number;
  prix_unitaire: number | null;
  devise: string | null;
  taux_change: number | null;
  date_reception: string | null;
};

type BcLigneRow = {
  article_id: number;
  prix_unitaire: number | null;
  devise: string | null;
  taux_change: number | null;
  date_jour: string | null;
};

// Dernier prix d'achat par article MP (pas une moyenne - le prix change
// souvent d'un achat a l'autre et l'utilisateur veut voir le prix du DERNIER
// achat dans la formule), avec repli pour ne jamais traiter silencieusement
// un article sans prix connu comme un cout de 0 :
//  1. prix du lot le plus recemment receptionne (prix reel paye) pour cet
//     article.
//  2. si aucun lot receptionne avec prix : prix de la ligne BC la plus
//     recente (prix negocie, pas encore receptionne).
//  3. sinon : absent de la map retournee (prix inconnu).
export async function fetchCoutsMoyenMp(articleMpIds: number[]): Promise<Map<number, CoutMpInfo>> {
  const result = new Map<number, CoutMpInfo>();
  const ids = [...new Set(articleMpIds)];
  if (ids.length === 0) return result;

  const { data: lotsData } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("article_id, prix_unitaire, devise, taux_change, date_reception")
    .in("article_id", ids)
    .not("prix_unitaire", "is", null)
    .order("date_reception", { ascending: false });

  const lots = (lotsData ?? []) as LotRow[];
  for (const lot of lots) {
    if (result.has(lot.article_id)) continue;
    const prixFcfa = convertirEnFcfa(lot.prix_unitaire, lot.devise, lot.taux_change);
    if (prixFcfa === null) continue;
    result.set(lot.article_id, { coutFcfa: prixFcfa, source: "lot" });
  }

  const idsRestants = ids.filter((id) => !result.has(id));
  if (idsRestants.length > 0) {
    const { data: bcData } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select("article_id, prix_unitaire, devise, taux_change, date_jour")
      .in("article_id", idsRestants)
      .not("prix_unitaire", "is", null)
      .order("date_jour", { ascending: false });

    const bcLignes = (bcData ?? []) as BcLigneRow[];
    for (const ligne of bcLignes) {
      if (result.has(ligne.article_id)) continue;
      const prixFcfa = convertirEnFcfa(ligne.prix_unitaire, ligne.devise, ligne.taux_change);
      if (prixFcfa === null) continue;
      result.set(ligne.article_id, { coutFcfa: prixFcfa, source: "bc" });
    }
  }

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
    coutTotal += Number(ligne.quantite ?? 0) * info.coutFcfa;
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
export async function fetchCoutVracParKg(vracArticleId: number): Promise<CoutVracInfo> {
  const [{ data: articleData }, { data: lignesData }] = await Promise.all([
    supabaseServer.from("articles").select("quantite_recette_base").eq("id", vracArticleId).maybeSingle(),
    supabaseServer
      .from("recettes_pf")
      .select("article_mp_id, quantite")
      .eq("article_pf_id", vracArticleId),
  ]);

  const quantiteBase = (articleData as { quantite_recette_base: number | null } | null)?.quantite_recette_base ?? null;
  const lignes = (lignesData ?? []) as { article_mp_id: number; quantite: number }[];

  const couts = await fetchCoutsMoyenMp(lignes.map((ligne) => ligne.article_mp_id));
  const { coutTotal, lignesSansPrix } = computeRecetteCost(lignes, couts);

  return {
    coutParKg: quantiteBase && quantiteBase > 0 ? coutTotal / quantiteBase : null,
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
};

type RecetteLigneRow = { article_pf_id: number; article_mp_id: number; quantite: number };

// Meme calcul que la carte "Prix de revient" de recette-conditionnement/[id]/page.tsx
// (cout du vrac utilise + cout des articles de conditionnement, divise par
// le nombre de cartons du lot), mais chiffre PLUSIEURS produits finis en une
// poignee de requetes au lieu d'une par article - utilise par les pages
// Commandes (une commande a plusieurs lignes/articles, potentiellement
// beaucoup de commandes listees a la fois).
export async function fetchCoutsParCartonProduitsFinis(
  articlePfIds: number[]
): Promise<Map<number, CoutCartonInfo>> {
  const result = new Map<number, CoutCartonInfo>();
  const ids = [...new Set(articlePfIds)];
  if (ids.length === 0) return result;

  const { data: articlesData } = await supabaseServer
    .from("articles")
    .select("id, quantite_recette_base, vrac_article_id, vrac_quantite_recette")
    .in("id", ids);
  const articles = (articlesData ?? []) as ArticlePfCoutRow[];
  const articleById = new Map(articles.map((article) => [article.id, article]));

  const vracIds = [
    ...new Set(articles.map((article) => article.vrac_article_id).filter((id): id is number => id !== null)),
  ];

  const [{ data: vracArticlesData }, { data: lignesData }] = await Promise.all([
    vracIds.length > 0
      ? supabaseServer.from("articles").select("id, quantite_recette_base").in("id", vracIds)
      : Promise.resolve({ data: [] as { id: number; quantite_recette_base: number | null }[] }),
    supabaseServer
      .from("recettes_pf")
      .select("article_pf_id, article_mp_id, quantite")
      .in("article_pf_id", [...ids, ...vracIds]),
  ]);

  const quantiteBaseByVrac = new Map(
    ((vracArticlesData ?? []) as { id: number; quantite_recette_base: number | null }[]).map((vrac) => [
      vrac.id,
      vrac.quantite_recette_base,
    ])
  );

  const lignesByPf = new Map<number, { article_mp_id: number; quantite: number }[]>();
  for (const ligne of (lignesData ?? []) as RecetteLigneRow[]) {
    const list = lignesByPf.get(ligne.article_pf_id) ?? [];
    list.push({ article_mp_id: ligne.article_mp_id, quantite: ligne.quantite });
    lignesByPf.set(ligne.article_pf_id, list);
  }

  const allMpIds = [...lignesByPf.values()].flat().map((ligne) => ligne.article_mp_id);
  const couts = await fetchCoutsMoyenMp(allMpIds);

  const coutVracParId = new Map<number, { coutParKg: number | null; lignesSansPrix: number[] }>();
  for (const vracId of vracIds) {
    const lignes = lignesByPf.get(vracId) ?? [];
    const { coutTotal, lignesSansPrix } = computeRecetteCost(lignes, couts);
    const quantiteBase = quantiteBaseByVrac.get(vracId) ?? null;
    coutVracParId.set(vracId, {
      coutParKg: quantiteBase && quantiteBase > 0 ? coutTotal / quantiteBase : null,
      lignesSansPrix,
    });
  }

  for (const id of ids) {
    const article = articleById.get(id);
    if (!article) continue;

    const lignesConditionnement = lignesByPf.get(id) ?? [];
    const { coutTotal: coutConditionnement, lignesSansPrix: lignesSansPrixConditionnement } = computeRecetteCost(
      lignesConditionnement,
      couts
    );

    let coutVracUtilise = 0;
    let lignesSansPrixVrac: number[] = [];
    if (article.vrac_article_id) {
      const coutVrac = coutVracParId.get(article.vrac_article_id);
      if (coutVrac?.coutParKg !== null && coutVrac?.coutParKg !== undefined && article.vrac_quantite_recette) {
        coutVracUtilise = coutVrac.coutParKg * article.vrac_quantite_recette;
      }
      lignesSansPrixVrac = coutVrac?.lignesSansPrix ?? [];
    }

    const coutTotal = coutVracUtilise + coutConditionnement;
    const coutParCarton =
      article.quantite_recette_base && article.quantite_recette_base > 0
        ? coutTotal / article.quantite_recette_base
        : null;

    result.set(id, {
      coutParCarton,
      lignesSansPrix: [...lignesSansPrixConditionnement, ...lignesSansPrixVrac],
    });
  }

  return result;
}
