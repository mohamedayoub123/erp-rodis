import { supabaseServer } from "@/lib/supabase-server";
import { lireStockMpDepotE } from "@/lib/lot-balances-mp";
import {
  additionnerQtEnCours,
  fetchArticleStocksFromStockPage,
  fetchQtEmballeEnAttenteDetaille,
  fetchQtEnCoursConditionnementDetaille,
  normalizeArticle,
} from "@/app/tableau-commandes/family-data";
import { buildPdLabelByCode } from "@/app/production/suivi/data";
import { repartirEnCoursParPd, type EnCoursParPd } from "@/lib/programme-en-cours-par-pd";
import { lireLignes, lireParIds } from "@/lib/besoin-conditionnement-proforma";
import { calculerDeductionTiProgrammes, type DeductionTiMp } from "@/lib/ti-programmes";
import { TYPES_COMPOSANTS, typeComposant, type ComposantArticle, type TypeComposant } from "@/lib/composants-types";

// Colonnes "articles de conditionnement" du Tableau de commande : pour chaque article fini, les articles de sa Recette
// Conditionnement rangés par type (capsule / pompe, flacon, etiquette, sleeve, etui, dispenseur, carton), avec
//  - le stock du Depot E (le seul depot utilisable pour conditionner) ;
//  - le besoin de cet article de conditionnement pour TOUTES les commandes ouvertes : cartons dont les articles de conditionnement
//    restent a couvrir (commandes moins stock PF moins cartons DEJA EMBALLES) x quantite de la recette. Un programme en cours ne
//    fait PAS disparaitre le besoin : tant que le flacon / la capsule n'a pas ete consomme, il faut l'avoir (sinon un programme de 1000
//    cartons affichait "besoin 0" alors que le flacon n'existe pas). Seuls les cartons deja emballes (produits, pas encore valides
//    dans le stock PF) sont deduits : leurs articles de conditionnement sont deja consommes. L'article de conditionnement peut servir
//    a plusieurs articles finis (meme d'une autre famille) : leurs commandes comptent toutes.
// Le calcul est celui du Besoin Conditionnement / Stock Alert MP par commande, restreint aux articles de conditionnement
// de la famille affichee (le stock PF et les commandes ne sont lus que pour les articles qui les utilisent).

type RecetteRow = { id: number; article_pf_id: number; article_mp_id: number; quantite: number | null };
type MpRow = { id: number; nom_article: string | null; unite: string | null; sous_famille: string | null };
type ArticleRecetteRow = { id: number; nom_article: string | null; quantite_recette_base: number | null };
type ArticleNomRow = { id: number; nom_article: string | null; nature: string | null };

async function lireIdsCommandesOuvertes(): Promise<number[]> {
  const ids: number[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("commandes")
      .select("id")
      .neq("statut", "LIVREE")
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { id: number }[];
    ids.push(...page.map((ligne) => ligne.id));
    if (page.length < 1000) break;
  }
  return ids;
}

// Cartons commandes par article (toutes les commandes ouvertes donnees)
function cartonsCommandesParArticle(lignes: { article_id: number | null; quantite_demandee: number | null }[]): Map<number, number> {
  const cartonsParId = new Map<number, number>();
  for (const ligne of lignes) {
    const cartons = Number(ligne.quantite_demandee ?? 0);
    if (!ligne.article_id || !(cartons > 0)) continue;
    cartonsParId.set(ligne.article_id, (cartonsParId.get(ligne.article_id) ?? 0) + cartons);
  }
  return cartonsParId;
}

// Cartons A PRODUIRE d'un article = ce qui reste de ses commandes ouvertes une fois deduits le stock PF et la quantite "deja couverte"
// (qtEnCoursParNom : selon l'appelant, tout le programme en cours - qui compte comme du stock PF a venir - ou seulement les cartons deja
// emballes). Les articles qui ont le meme nom (normalise) partagent leur stock PF et leurs programmes : le manque de ce nom est reparti au
// prorata de leurs commandes. Cartons non couverts par nom = max(0, commande - stock PF - quantite deja couverte) (la somme des cartons non
// couverts de chaque commande, dans l'ordre du tableau, vaut toujours ce total).
export function cartonsAProduireParArticle(params: {
  cartonsParId: Map<number, number>;
  cleParId: Map<number, string>;
  articlesMemeNom: { id: number }[];
  stockPfParNom: Map<string, number>;
  qtEnCoursParNom: Map<string, number>;
}): (articleId: number) => number {
  const commandeParNom = new Map<string, number>();
  for (const article of params.articlesMemeNom) {
    const cle = params.cleParId.get(article.id) ?? "";
    commandeParNom.set(cle, (commandeParNom.get(cle) ?? 0) + (params.cartonsParId.get(article.id) ?? 0));
  }
  const manqueParNom = new Map<string, number>();
  for (const [cle, commande] of commandeParNom) {
    const disponible = Math.max(0, params.stockPfParNom.get(cle) ?? 0) + Math.max(0, params.qtEnCoursParNom.get(cle) ?? 0);
    manqueParNom.set(cle, Math.max(0, commande - disponible));
  }
  return (articleId: number) => {
    const cartons = params.cartonsParId.get(articleId) ?? 0;
    const cle = params.cleParId.get(articleId) ?? "";
    const commande = commandeParNom.get(cle) ?? 0;
    return commande > 0 ? ((manqueParNom.get(cle) ?? 0) * cartons) / commande : cartons;
  };
}

// Pour TOUS les articles commandes (page Manque Articles) : cartons commandes et cartons a produire de chaque article, avec les memes sources
// que le Tableau de commande (stock PF "comme la page Stock", programmes en cours = Qt en cours de Conditionnement, commandes non livrees).
// articleIds (optionnel) : ne lit le stock que des articles (et de leurs homonymes) de cette liste - exact pour eux (le calcul est par nom),
// beaucoup plus rapide quand on n'affiche qu'un type de produit fini. Renvoie aussi les lignes de commande lues, le nom normalise de chaque
// article, le stock PF et les programmes en cours par nom.
// parPd (optionnel) : renvoie aussi, pour chaque nom d'article, son programme en cours reparti entre les PD (enCoursParPd - vide sans cette option) :
// la somme des PD d'un article est son programme en cours qtEnCoursParNom.
// aProduire : cartons a produire APRES tout le programme en cours (pour la fabrication du vrac et les projections de stock PF).
// aProduireConditionnement : cartons dont les ARTICLES DE CONDITIONNEMENT restent a couvrir = commande - stock PF - cartons deja emballes
// seulement (un programme en cours ne fait pas disparaitre le besoin de flacons / capsules tant qu'ils ne sont pas consommes).
export async function calculerCartonsAProduireGlobal(
  articlesGlobaux: ArticleNomRow[],
  options?: { articleIds?: Set<number>; parPd?: boolean }
): Promise<{
  lignes: { commande_id: number; article_id: number | null; quantite_demandee: number | null }[];
  cartonsParId: Map<number, number>;
  cleParId: Map<number, string>;
  stockPfParNom: Map<string, number>;
  qtEnCoursParNom: Map<string, number>;
  enCoursParPd: Map<string, EnCoursParPd>;
  aProduire: (articleId: number) => number;
  aProduireConditionnement: (articleId: number) => number;
}> {
  const lignes = await lireIdsCommandesOuvertes().then((ids) => lireLignes(ids));
  const cartonsParId = cartonsCommandesParArticle(lignes);
  const cleParId = new Map<number, string>();
  for (const article of articlesGlobaux) cleParId.set(article.id, normalizeArticle(String(article.nom_article ?? "")));
  const idsConcernes = [...cartonsParId.keys()].filter((id) => !options?.articleIds || options.articleIds.has(id));
  const clesCommandees = new Set(idsConcernes.map((id) => cleParId.get(id) ?? "").filter(Boolean));
  const articlesMemeNom = articlesGlobaux.filter((article) => clesCommandees.has(cleParId.get(article.id) ?? ""));
  const [stockPfParNom, enCoursDetail, pdParCode] = await Promise.all([
    fetchArticleStocksFromStockPage(articlesMemeNom.filter((article) => article.nature !== "vrac")),
    fetchQtEnCoursConditionnementDetaille(),
    options?.parPd ? buildPdLabelByCode() : Promise.resolve(new Map<string, string>()),
  ]);
  const qtEnCoursParNom = additionnerQtEnCours(enCoursDetail);
  const qtEmballeParNom = additionnerQtEnCours(enCoursDetail.filter((detail) => detail.source === "emballe"));
  const enCoursParPd = options?.parPd ? repartirEnCoursParPd(enCoursDetail, pdParCode) : new Map<string, EnCoursParPd>();
  return {
    lignes,
    cartonsParId,
    cleParId,
    stockPfParNom,
    qtEnCoursParNom,
    enCoursParPd,
    aProduire: cartonsAProduireParArticle({ cartonsParId, cleParId, articlesMemeNom, stockPfParNom, qtEnCoursParNom }),
    aProduireConditionnement: cartonsAProduireParArticle({
      cartonsParId,
      cleParId,
      articlesMemeNom,
      stockPfParNom,
      qtEnCoursParNom: qtEmballeParNom,
    }),
  };
}

// articleIdsParCle : articles finis de la famille, par nom normalise (normalizeArticle) -> ids
// stockPfParNom : stock PF deja calcule pour ces articles (meme cle) ; les autres sont lus ici
// articlesGlobaux : tous les articles (id, nom, nature), deja lus par la page : evite de les relire
// Les cartons deja emballes (pas encore en stock PF) sont lus ici (lecture legere) : ce sont les seuls du programme en cours que le besoin deduit.
export async function calculerComposantsFamille(params: {
  articleIdsParCle: Map<string, number[]>;
  stockPfParNom: Map<string, number>;
  articlesGlobaux: ArticleNomRow[];
}): Promise<Map<string, ComposantArticle[]>> {
  const resultat = new Map<string, ComposantArticle[]>();
  const familleIds = [...new Set([...params.articleIdsParCle.values()].flat())];
  if (familleIds.length === 0) return resultat;

  // 1) En parallele : recettes de la famille, stock du Depot E, toutes les lignes des commandes ouvertes, et les cartons deja emballes
  // + les TI deja faits (Depot E vers Depot B) pour les programmes en cours, a deduire du besoin (voir lib/ti-programmes.ts) : un souci de lecture
  // ne bloque pas le tableau, le besoin est alors montre sans cette deduction (le manque ne peut qu'etre surestime, jamais cache)
  const [recettesFamilleBrutes, soldesDepotE, lignes, qtEmballeParNom, tiParMp] = await Promise.all([
    lireParIds<RecetteRow>("recettes_pf", "id, article_pf_id, article_mp_id, quantite", "article_pf_id", familleIds),
    lireStockMpDepotE(),
    lireIdsCommandesOuvertes().then((ids) => lireLignes(ids)),
    fetchQtEmballeEnAttenteDetaille().then((details) => additionnerQtEnCours(details)),
    calculerDeductionTiProgrammes().catch(() => new Map<number, DeductionTiMp>()),
  ]);
  const recettesFamille = recettesFamilleBrutes.filter((ligne) => Number(ligne.quantite ?? 0) > 0);
  const mpIdsFamille = [...new Set(recettesFamille.map((ligne) => ligne.article_mp_id))];
  if (mpIdsFamille.length === 0) return resultat;

  // 2) Type de chaque article de conditionnement + tous les articles finis qui les utilisent (meme d'une autre famille)
  const [mpRows, recettesUtilisatrices] = await Promise.all([
    lireParIds<MpRow>("articles_matiere_premiere", "id, nom_article, unite, sous_famille", "id", mpIdsFamille),
    lireParIds<RecetteRow>("recettes_pf", "id, article_pf_id, article_mp_id, quantite", "article_mp_id", mpIdsFamille),
  ]);
  const mpParId = new Map(mpRows.map((mp) => [mp.id, mp]));
  const typeParMp = new Map<number, TypeComposant>();
  for (const mp of mpRows) {
    const type = typeComposant(mp.sous_famille, mp.nom_article);
    if (type) typeParMp.set(mp.id, type);
  }
  if (typeParMp.size === 0) return resultat;
  const recettesUtil = recettesUtilisatrices.filter(
    (ligne) => Number(ligne.quantite ?? 0) > 0 && typeParMp.has(ligne.article_mp_id)
  );
  const utilisateursIds = [...new Set(recettesUtil.map((ligne) => ligne.article_pf_id))];

  // 3) Cle (nom normalise) de chaque article, articles de meme nom, et stock PF des noms pas encore connus
  const cleParId = new Map<number, string>();
  for (const article of params.articlesGlobaux) cleParId.set(article.id, normalizeArticle(String(article.nom_article ?? "")));
  const clesUtilisateurs = new Set(utilisateursIds.map((id) => cleParId.get(id) ?? "").filter(Boolean));
  const articlesMemeNom = params.articlesGlobaux.filter((article) => clesUtilisateurs.has(cleParId.get(article.id) ?? ""));
  const stockPfParNom = new Map(params.stockPfParNom);
  const aLire = articlesMemeNom.filter(
    (article) => article.nature !== "vrac" && !stockPfParNom.has(cleParId.get(article.id) ?? "")
  );
  const [articlesUtil, stocksLus] = await Promise.all([
    lireParIds<ArticleRecetteRow>("articles", "id, nom_article, quantite_recette_base", "id", utilisateursIds),
    aLire.length > 0 ? fetchArticleStocksFromStockPage(aLire) : Promise.resolve(new Map<string, number>()),
  ]);
  for (const [cle, stock] of stocksLus) stockPfParNom.set(cle, stock);

  // Cartons commandes par article, puis cartons dont les articles de conditionnement restent a couvrir (le meme calcul sert a la page Manque
  // Articles : aProduireConditionnement, voir calculerCartonsAProduireGlobal) - seuls les cartons deja emballes sont deduits du programme en cours
  const cartonsParId = cartonsCommandesParArticle(lignes);
  const aProduireArticle = cartonsAProduireParArticle({
    cartonsParId,
    cleParId,
    articlesMemeNom,
    stockPfParNom,
    qtEnCoursParNom: qtEmballeParNom,
  });

  // 5) Besoin de chaque article de conditionnement pour toutes les commandes ouvertes
  const baseParId = new Map(articlesUtil.map((article) => [article.id, Number(article.quantite_recette_base ?? 0)]));
  const besoinParMp = new Map<number, number>();
  for (const ligne of recettesUtil) {
    const base = baseParId.get(ligne.article_pf_id) ?? 0;
    const cartons = cartonsParId.get(ligne.article_pf_id) ?? 0;
    if (!(base > 0) || !(cartons > 0)) continue;
    const aProduire = aProduireArticle(ligne.article_pf_id);
    besoinParMp.set(ligne.article_mp_id, (besoinParMp.get(ligne.article_mp_id) ?? 0) + (aProduire * Number(ligne.quantite)) / base);
  }

  // 6) Composants de chaque article de la famille
  const stockParMp = new Map(soldesDepotE.map((solde) => [solde.article_id, solde.stock]));
  const ordreType = new Map(TYPES_COMPOSANTS.map((type, index) => [type.cle, index]));
  for (const [cle, ids] of params.articleIdsParCle) {
    const composants = new Map<number, ComposantArticle>();
    for (const ligne of recettesFamille) {
      if (!ids.includes(ligne.article_pf_id) || composants.has(ligne.article_mp_id)) continue;
      const type = typeParMp.get(ligne.article_mp_id);
      const mp = mpParId.get(ligne.article_mp_id);
      if (!type || !mp) continue;
      // besoin = ce qu'il reste a couvrir - ce qui est deja sorti vers le Depot B pour les programmes en cours (TI deja faits, jamais plus que le besoin)
      const besoinBrut = besoinParMp.get(ligne.article_mp_id) ?? 0;
      const tiDeduit = Math.min(tiParMp.get(ligne.article_mp_id)?.deduction ?? 0, besoinBrut);
      const besoin = besoinBrut - tiDeduit;
      composants.set(ligne.article_mp_id, {
        mpId: mp.id,
        nom: mp.nom_article ?? `Article MP ${mp.id}`,
        unite: mp.unite ?? "",
        type,
        stock: stockParMp.get(mp.id) ?? 0,
        besoin: besoin < 1e-6 ? 0 : besoin,
        tiDeduit: tiDeduit < 1e-6 ? 0 : tiDeduit,
      });
    }
    if (composants.size > 0) {
      resultat.set(
        cle,
        [...composants.values()].sort(
          (a, b) =>
            (ordreType.get(a.type) ?? 99) - (ordreType.get(b.type) ?? 99) ||
            a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" })
        )
      );
    }
  }
  return resultat;
}
