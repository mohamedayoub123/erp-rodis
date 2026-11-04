import { supabaseServer } from "@/lib/supabase-server";
import { lireStockMpDepotE } from "@/lib/lot-balances-mp";
import { fetchArticleStocksFromStockPage, normalizeArticle } from "@/app/tableau-commandes/family-data";
import { lireLignes, lireParIds } from "@/lib/besoin-conditionnement-proforma";
import { TYPES_COMPOSANTS, typeComposant, type ComposantArticle, type TypeComposant } from "@/lib/composants-types";

// Colonnes "articles de conditionnement" du Tableau de commande : pour chaque article fini, les articles de sa Recette
// Conditionnement rangés par type (capsule / pompe, flacon, etiquette, sleeve, etui, dispenseur, carton), avec
//  - le stock du Depot E (le seul depot utilisable pour conditionner) ;
//  - le besoin de cet article de conditionnement pour TOUTES les commandes ouvertes : cartons qu'il reste a produire (commandes
//    moins stock PF moins programmes en cours, comme le Stock Alert MP par commande) x quantite de la recette. L'article de
//    conditionnement peut servir a plusieurs articles finis (meme d'une autre famille) : leurs commandes comptent toutes.
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

// articleIdsParCle : articles finis de la famille, par nom normalise (normalizeArticle) -> ids
// stockPfParNom : stock PF deja calcule pour ces articles (meme cle) ; les autres sont lus ici
// qtEnCoursParNom : programmes en cours (Qt en cours de Conditionnement du Tableau de commande), meme cle
// articlesGlobaux : tous les articles (id, nom, nature), deja lus par la page : evite de les relire
export async function calculerComposantsFamille(params: {
  articleIdsParCle: Map<string, number[]>;
  stockPfParNom: Map<string, number>;
  qtEnCoursParNom: Map<string, number>;
  articlesGlobaux: ArticleNomRow[];
}): Promise<Map<string, ComposantArticle[]>> {
  const resultat = new Map<string, ComposantArticle[]>();
  const familleIds = [...new Set([...params.articleIdsParCle.values()].flat())];
  if (familleIds.length === 0) return resultat;

  // 1) En parallele : recettes de la famille, stock du Depot E, et toutes les lignes des commandes ouvertes
  const [recettesFamilleBrutes, soldesDepotE, lignes] = await Promise.all([
    lireParIds<RecetteRow>("recettes_pf", "id, article_pf_id, article_mp_id, quantite", "article_pf_id", familleIds),
    lireStockMpDepotE(),
    lireIdsCommandesOuvertes().then((ids) => lireLignes(ids)),
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

  // Cartons commandes par article, puis par nom (un nom partage entre plusieurs articles repartit le manque au prorata)
  const cartonsParId = new Map<number, number>();
  for (const ligne of lignes) {
    const cartons = Number(ligne.quantite_demandee ?? 0);
    if (!ligne.article_id || !(cartons > 0)) continue;
    cartonsParId.set(ligne.article_id, (cartonsParId.get(ligne.article_id) ?? 0) + cartons);
  }
  const commandeParNom = new Map<string, number>();
  for (const article of articlesMemeNom) {
    const cle = cleParId.get(article.id) ?? "";
    commandeParNom.set(cle, (commandeParNom.get(cle) ?? 0) + (cartonsParId.get(article.id) ?? 0));
  }

  // Cartons non couverts par nom = max(0, commande - stock PF - programmes en cours) (la somme des cartons non couverts de chaque
  // commande, dans l'ordre du tableau, vaut toujours ce total)
  const manqueParNom = new Map<string, number>();
  for (const [cle, commande] of commandeParNom) {
    const disponible = Math.max(0, stockPfParNom.get(cle) ?? 0) + Math.max(0, params.qtEnCoursParNom.get(cle) ?? 0);
    manqueParNom.set(cle, Math.max(0, commande - disponible));
  }

  // 5) Besoin de chaque article de conditionnement pour toutes les commandes ouvertes
  const baseParId = new Map(articlesUtil.map((article) => [article.id, Number(article.quantite_recette_base ?? 0)]));
  const besoinParMp = new Map<number, number>();
  for (const ligne of recettesUtil) {
    const base = baseParId.get(ligne.article_pf_id) ?? 0;
    const cartons = cartonsParId.get(ligne.article_pf_id) ?? 0;
    if (!(base > 0) || !(cartons > 0)) continue;
    const cle = cleParId.get(ligne.article_pf_id) ?? "";
    const commande = commandeParNom.get(cle) ?? 0;
    const aProduire = commande > 0 ? ((manqueParNom.get(cle) ?? 0) * cartons) / commande : cartons;
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
      const besoin = besoinParMp.get(ligne.article_mp_id) ?? 0;
      composants.set(ligne.article_mp_id, {
        mpId: mp.id,
        nom: mp.nom_article ?? `Article MP ${mp.id}`,
        unite: mp.unite ?? "",
        type,
        stock: stockParMp.get(mp.id) ?? 0,
        besoin: besoin < 1e-6 ? 0 : besoin,
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
