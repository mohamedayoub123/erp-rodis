import { supabaseServer } from "@/lib/supabase-server";
import {
  calculerBesoinProformas,
  lireArrivagesMp,
  lireParIds,
  type Arrivages,
  type CommandeEnCours,
  type ImportEnCours,
  type ProformaSaisie,
} from "@/lib/besoin-conditionnement-proforma";

// Besoin en matieres premieres (MP) de FABRICATION d'une ou plusieurs proformas (Commandes PF) :
//  1. les cartons a PRODUIRE de chaque article commande sont ceux du Besoin Conditionnement (stock PF deja deduit, comme le
//     RESTE du Tableau de commande), et chaque article fini a son vrac : kg de vrac = cartons a produire x pieces par carton x
//     contenance (ou la quantite de vrac saisie dans sa Recette Conditionnement) ;
//  2. la Recette Fabrication du vrac (table recettes_pf, article_pf_id = le vrac) donne, pour un lot de "quantite_recette_base"
//     kg de vrac, la quantite de chaque MP : besoin MP = kg de vrac a fabriquer x quantite de la recette / kg du lot de la recette ;
//  3. le besoin de chaque MP est compare au stock utilisable en fabrication, puis aux commandes (BC) et imports en cours (memes
//     regles que le Besoin Conditionnement : commande et import ne se comptent jamais deux fois). Stock utilisable = Depot E
//     (reserve generale, depot par defaut des MP) + Depot B (depot de la fabrication, ou les Transfer Orders des programmes
//     envoient les MP) : compter le seul Depot E ferait croire a des manques que le Depot B couvre.

export type StatutRecetteFabrication = "ok" | "sans_recette" | "lot_inconnu";

// Un vrac a fabriquer et les articles finis (cartons a produire) qui le demandent
export type VracAFabriquer = {
  vracId: number;
  nom: string;
  kg: number;
  // kg de vrac pour lesquels la recette est calibree (articles.quantite_recette_base du vrac) ; 0 = non renseigne
  base: number;
  statutRecette: StatutRecetteFabrication;
  nbLignesRecette: number;
  articles: { articleId: number; nom: string; cartons: number; kg: number }[];
};

// Article a produire dont on ne sait pas calculer le vrac : pas de vrac lie, ou ni pieces par carton x contenance ni quantite de vrac
export type ArticleSansVrac = {
  articleId: number;
  nom: string;
  aProduire: number;
  proformas: string[];
  raison: "sans_vrac" | "kg_inconnu";
  vracNom: string | null;
};

export type BesoinMpFabrication = {
  articleMpId: number;
  nom: string;
  unite: string;
  categorie: string;
  besoin: number;
  // stock utilisable = Depot E + Depot B (un solde negatif compte pour 0 : des sorties saisies en trop ne sont pas du stock a rembourser)
  stockDepotE: number;
  stockDepotB: number;
  stock: number;
  manque: number;
  // vracs dont la recette utilise cette MP
  utilisePar: string[];
  commandes: CommandeEnCours[];
  commandeTotal: number;
  imports: ImportEnCours[];
  importTotal: number;
  resteACouvrir: number;
};

export type ResultatBesoinFabrication = {
  proformas: ProformaSaisie[];
  // articles commandes dont il reste des cartons a produire (les autres sont couverts par le stock PF)
  nbArticlesAProduire: number;
  vracs: VracAFabriquer[];
  sansVrac: ArticleSansVrac[];
  besoins: BesoinMpFabrication[];
  arrivagesIndisponibles: boolean;
};

type VracRow = { id: number; nom_article: string | null; quantite_recette_base: number | null };
type RecetteRow = { article_pf_id: number; article_mp_id: number; quantite: number | null };
type MpRow = { id: number; nom_article: string | null; unite: string | null; categorie: string | null };

// Stock d'un depot par article (fonction SQL stock_by_article_depot_mp : le depot d'un mouvement est son depot_id, sinon le depot
// par defaut de l'article - meme regle que la page du depot). Une erreur de lecture est levee (jamais un stock a 0 qui ferait
// croire a un manque).
async function lireStockMpDuDepot(nomDepot: string): Promise<Map<number, number>> {
  const { data: depot, error: erreurDepot } = await supabaseServer.from("depots").select("id").eq("nom", nomDepot).maybeSingle();
  if (erreurDepot) throw new Error(erreurDepot.message);
  const depotId = (depot as { id: number } | null)?.id;
  if (!depotId) throw new Error(`Depot "${nomDepot}" introuvable`);

  const stock = new Map<number, number>();
  const taillePage = 1000;
  for (let debut = 0; ; debut += taillePage) {
    // un seul article par ligne une fois filtre sur le depot : le tri par article rend la pagination stable
    const { data, error } = await supabaseServer
      .rpc("stock_by_article_depot_mp")
      .eq("depot_id", depotId)
      .order("article_id", { ascending: true })
      .range(debut, debut + taillePage - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { article_id: number; stock: number | string | null }[];
    for (const ligne of page) stock.set(Number(ligne.article_id), Number(ligne.stock ?? 0));
    if (page.length < taillePage) break;
  }
  return stock;
}

export async function calculerBesoinFabrication(saisies: string[]): Promise<ResultatBesoinFabrication> {
  // Cartons a produire + kg de vrac par article : meme calcul que le Besoin Conditionnement (sans ses articles de conditionnement)
  const { proformas, articles } = await calculerBesoinProformas(saisies, { sansBesoinsMp: true });
  const aProduire = articles.filter((article) => article.aProduire > 0);

  const sansVrac: ArticleSansVrac[] = [];
  const vracParId = new Map<number, VracAFabriquer>();
  for (const article of aProduire) {
    const proformasArticle = article.parProforma.map((p) => p.proforma);
    if (!article.vracArticleId) {
      sansVrac.push({
        articleId: article.articleId,
        nom: article.nom,
        aProduire: article.aProduire,
        proformas: proformasArticle,
        raison: "sans_vrac",
        vracNom: null,
      });
      continue;
    }
    if (article.vracKg === null) {
      sansVrac.push({
        articleId: article.articleId,
        nom: article.nom,
        aProduire: article.aProduire,
        proformas: proformasArticle,
        raison: "kg_inconnu",
        vracNom: article.vracNom,
      });
      continue;
    }
    const vrac = vracParId.get(article.vracArticleId) ?? {
      vracId: article.vracArticleId,
      nom: article.vracNom ?? `Vrac ${article.vracArticleId}`,
      kg: 0,
      base: 0,
      statutRecette: "ok" as StatutRecetteFabrication,
      nbLignesRecette: 0,
      articles: [],
    };
    vrac.kg += article.vracKg;
    vrac.articles.push({ articleId: article.articleId, nom: article.nom, cartons: article.aProduire, kg: article.vracKg });
    vracParId.set(article.vracArticleId, vrac);
  }

  const vracs = [...vracParId.values()];
  const resultatVide: ResultatBesoinFabrication = {
    proformas,
    nbArticlesAProduire: aProduire.length,
    vracs,
    sansVrac,
    besoins: [],
    arrivagesIndisponibles: false,
  };
  if (vracs.length === 0) return resultatVide;

  // Recette Fabrication de chaque vrac : lignes (MP, quantite pour un lot de "base" kg)
  const vracIds = vracs.map((vrac) => vrac.vracId);
  const [vracRows, recettes] = await Promise.all([
    lireParIds<VracRow>("articles", "id, nom_article, quantite_recette_base", "id", vracIds),
    lireParIds<RecetteRow>("recettes_pf", "id, article_pf_id, article_mp_id, quantite", "article_pf_id", vracIds),
  ]);
  const baseParVrac = new Map(vracRows.map((vrac) => [vrac.id, Number(vrac.quantite_recette_base ?? 0)]));
  const lignesParVrac = new Map<number, RecetteRow[]>();
  for (const ligne of recettes) {
    if (!(Number(ligne.quantite ?? 0) > 0)) continue;
    const liste = lignesParVrac.get(ligne.article_pf_id) ?? [];
    liste.push(ligne);
    lignesParVrac.set(ligne.article_pf_id, liste);
  }

  const besoinParMp = new Map<number, { besoin: number; utilisePar: Set<string> }>();
  for (const vrac of vracs) {
    const lignes = lignesParVrac.get(vrac.vracId) ?? [];
    vrac.base = baseParVrac.get(vrac.vracId) ?? 0;
    vrac.nbLignesRecette = lignes.length;
    vrac.statutRecette = lignes.length === 0 ? "sans_recette" : !(vrac.base > 0) ? "lot_inconnu" : "ok";
    if (vrac.statutRecette !== "ok") continue;
    for (const ligne of lignes) {
      const courant = besoinParMp.get(ligne.article_mp_id) ?? { besoin: 0, utilisePar: new Set<string>() };
      courant.besoin += (vrac.kg * Number(ligne.quantite)) / vrac.base;
      courant.utilisePar.add(vrac.nom);
      besoinParMp.set(ligne.article_mp_id, courant);
    }
  }

  // Problemes d'abord (pas de recette, lot inconnu), puis le plus gros vrac
  const rangStatut = (statut: StatutRecetteFabrication) => (statut === "sans_recette" ? 0 : statut === "lot_inconnu" ? 1 : 2);
  vracs.sort(
    (a, b) => rangStatut(a.statutRecette) - rangStatut(b.statutRecette) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" })
  );
  for (const vrac of vracs) vrac.articles.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  const mpIds = [...besoinParMp.keys()];
  if (mpIds.length === 0) return resultatVide;

  // Un souci de lecture des commandes / imports ne doit pas bloquer le calcul du besoin : on le signale seulement
  let arrivagesIndisponibles = false;
  const [mpRows, stockDepotE, stockDepotB, arrivages] = await Promise.all([
    lireParIds<MpRow>("articles_matiere_premiere", "id, nom_article, unite, categorie", "id", mpIds),
    lireStockMpDuDepot("Depot E"),
    lireStockMpDuDepot("Depot B"),
    lireArrivagesMp(mpIds).catch((): Arrivages => {
      arrivagesIndisponibles = true;
      return { commandesParMp: new Map(), importsParMp: new Map() };
    }),
  ]);
  const mpParId = new Map(mpRows.map((mp) => [mp.id, mp]));

  const besoins: BesoinMpFabrication[] = [...besoinParMp.entries()].map(([articleMpId, valeur]) => {
    const mp = mpParId.get(articleMpId);
    const enE = stockDepotE.get(articleMpId) ?? 0;
    const enB = stockDepotB.get(articleMpId) ?? 0;
    // Un stock negatif (sorties saisies en trop) n'est pas du stock a "rembourser" : chaque depot compte au plus 0 de disponible
    const stock = Math.max(enE, 0) + Math.max(enB, 0);
    const manqueBrut = Math.max(0, valeur.besoin - stock);
    // arrondi pour ne pas afficher un manque de 0,0000001 cause par les virgules flottantes
    const manque = manqueBrut < 1e-6 ? 0 : manqueBrut;
    const commandes = (arrivages.commandesParMp.get(articleMpId) ?? []).sort((a, b) => b.quantite - a.quantite);
    const imports = (arrivages.importsParMp.get(articleMpId) ?? []).sort((a, b) => b.quantite - a.quantite);
    const commandeTotal = commandes.reduce((somme, commande) => somme + commande.quantite, 0);
    const importTotal = imports.reduce((somme, transit) => somme + transit.quantite, 0);
    const resteBrut = Math.max(0, manque - commandeTotal - importTotal);
    return {
      articleMpId,
      nom: mp?.nom_article ?? `Article MP ${articleMpId}`,
      unite: mp?.unite ?? "",
      categorie: mp?.categorie ?? "",
      besoin: valeur.besoin,
      stockDepotE: enE,
      stockDepotB: enB,
      stock,
      manque,
      utilisePar: [...valeur.utilisePar].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
      commandes,
      commandeTotal,
      imports,
      importTotal,
      resteACouvrir: resteBrut < 1e-6 ? 0 : resteBrut,
    };
  });
  // Non couverts d'abord, puis en manque couverts par une commande / un import, puis le reste ; par nom ensuite
  const rangBesoin = (besoin: BesoinMpFabrication) => (besoin.resteACouvrir > 0 ? 0 : besoin.manque > 0 ? 1 : 2);
  besoins.sort((a, b) => rangBesoin(a) - rangBesoin(b) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  return { ...resultatVide, besoins, arrivagesIndisponibles };
}
