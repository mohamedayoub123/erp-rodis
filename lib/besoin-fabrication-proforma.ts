import { lireStockMpDepotE } from "@/lib/lot-balances-mp";
import {
  calculerBesoinProformas,
  lireArrivagesMp,
  lireParIds,
  type Arrivages,
  type CommandeEnCours,
  type ImportEnCours,
  type ProformaSaisie,
  type ResultatBesoin,
} from "@/lib/besoin-conditionnement-proforma";

// Besoin en matieres premieres (MP) de FABRICATION d'une ou plusieurs proformas (Commandes PF) :
//  1. les cartons a PRODUIRE de chaque article commande sont ceux du Besoin Conditionnement (stock PF deja deduit, comme le
//     RESTE du Tableau de commande), et chaque article fini a son vrac : kg de vrac = cartons a produire x pieces par carton x
//     contenance (ou la quantite de vrac saisie dans sa Recette Conditionnement) ;
//  2. la Recette Fabrication du vrac (table recettes_pf, article_pf_id = le vrac) donne, pour un lot de "quantite_recette_base"
//     kg de vrac, la quantite de chaque MP : besoin MP = kg de vrac a fabriquer x quantite de la recette / kg du lot de la recette ;
//  3. le besoin de chaque MP est compare au stock du Depot E SEULEMENT (decision de l'utilisateur, comme le Besoin Conditionnement :
//     le stock des autres depots, Depot B, Depot F..., ne compte pas), puis aux commandes (BC) et imports en cours (commande et
//     import ne se comptent jamais deux fois).

// incomplete : la recette existe mais la somme de ses matieres premieres n'atteint pas le lot (ex : seulement la BASE, 0,5 kg
// pour un lot de 100 kg) : le vrac n'est pas encore completement ecrit, les autres matieres ne sont pas comptees
export type StatutRecetteFabrication = "ok" | "sans_recette" | "lot_inconnu" | "incomplete";

// Ecart toleree entre la somme des matieres de la recette et le lot (arrondis de saisie) : 1 % du lot
const TOLERANCE_RECETTE = 0.01;

// Un vrac a fabriquer et les articles finis (cartons a produire) qui le demandent
export type VracAFabriquer = {
  vracId: number;
  nom: string;
  // kg de vrac pour TOUS les cartons commandes, ce que le stock PF et les programmes en cours en couvrent, et ce qu'il reste a
  // fabriquer : kg = kgTotal - kgCouvertStock - kgCouvertProgramme. kg = 0 : tout est deja couvert (aucune recette a verifier).
  kgTotal: number;
  kgCouvertStock: number;
  kgCouvertProgramme: number;
  kg: number;
  // kg de vrac pour lesquels la recette est calibree (articles.quantite_recette_base du vrac) ; 0 = non renseigne
  base: number;
  statutRecette: StatutRecetteFabrication;
  nbLignesRecette: number;
  // total des matieres premieres de la recette (meme unite que le lot) : doit valoir le lot pour une recette complete
  sommeRecette: number;
  // proformas : celles dont des cartons de cet article restent a produire
  articles: { articleId: number; nom: string; cartons: number; kg: number; proformas: string[] }[];
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
  // besoin pour TOUS les cartons commandes, puis ce qui en est deja couvert par le stock PF et par les programmes en cours ;
  // besoin = besoinTotal - deduitStock - deduitProgramme (ce qu'il faut encore fabriquer)
  besoinTotal: number;
  deduitStock: number;
  deduitProgramme: number;
  besoin: number;
  // stock du Depot E (peut etre negatif : sorties saisies en trop ; le manque compte alors 0 de disponible)
  stock: number;
  manque: number;
  // vracs dont la recette utilise cette MP
  utilisePar: string[];
  // proformas dont des cartons restent a produire avec un vrac qui utilise cette MP
  proformas: string[];
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

export async function calculerBesoinFabrication(saisies: string[]): Promise<ResultatBesoinFabrication> {
  // Cartons a produire + kg de vrac par article : meme calcul que le Besoin Conditionnement (sans ses articles de conditionnement),
  // programmes en cours deduits comme lui
  return calculerBesoinFabricationDepuis(await calculerBesoinProformas(saisies, { sansBesoinsMp: true, deduireProgrammes: true }));
}

// Meme calcul a partir d'un resultat du Besoin Conditionnement deja obtenu (proformas + articles commandes avec leur vrac) :
// permet de ne lire qu'une fois les commandes et le stock PF quand on veut aussi le besoin en articles de conditionnement.
export async function calculerBesoinFabricationDepuis(
  base: Pick<ResultatBesoin, "proformas" | "articles">
): Promise<ResultatBesoinFabrication> {
  const { proformas, articles } = base;
  const aProduire = articles.filter((article) => article.aProduire > 0);

  const sansVrac: ArticleSansVrac[] = [];
  const vracParId = new Map<number, VracAFabriquer>();
  for (const article of articles) {
    // Articles sans vrac calculable : seulement ceux dont il reste des cartons a produire
    if (article.aProduire > 0) {
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
    }
    // Vrac de l'article : on compte aussi ceux dont tout est couvert (stock PF, programmes en cours) pour le besoin total
    if (!article.vracArticleId || article.vracKgParCarton === null) continue;
    const vrac = vracParId.get(article.vracArticleId) ?? {
      vracId: article.vracArticleId,
      nom: article.vracNom ?? `Vrac ${article.vracArticleId}`,
      kgTotal: 0,
      kgCouvertStock: 0,
      kgCouvertProgramme: 0,
      kg: 0,
      base: 0,
      statutRecette: "ok" as StatutRecetteFabrication,
      nbLignesRecette: 0,
      sommeRecette: 0,
      articles: [],
    };
    vrac.kgTotal += article.cartons * article.vracKgParCarton;
    vrac.kgCouvertStock += article.couvertParStock * article.vracKgParCarton;
    vrac.kgCouvertProgramme += article.couvertParProgramme * article.vracKgParCarton;
    if (article.aProduire > 0 && article.vracKg !== null) {
      vrac.kg += article.vracKg;
      vrac.articles.push({
        articleId: article.articleId,
        nom: article.nom,
        cartons: article.aProduire,
        kg: article.vracKg,
        proformas: article.aProduireParProforma.map((ligne) => ligne.proforma),
      });
    }
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

  const besoinParMp = new Map<
    number,
    {
      besoinTotal: number;
      deduitStock: number;
      deduitProgramme: number;
      besoin: number;
      // vracs a fabriquer qui utilisent cette MP ; tousVracs : tous les vracs commandes qui l'utilisent (meme tout couverts)
      utilisePar: Set<string>;
      tousVracs: Set<string>;
      proformas: Set<string>;
    }
  >();
  for (const vrac of vracs) {
    const lignes = lignesParVrac.get(vrac.vracId) ?? [];
    vrac.base = baseParVrac.get(vrac.vracId) ?? 0;
    vrac.nbLignesRecette = lignes.length;
    vrac.sommeRecette = lignes.reduce((somme, ligne) => somme + Number(ligne.quantite), 0);
    vrac.statutRecette =
      lignes.length === 0
        ? "sans_recette"
        : !(vrac.base > 0)
          ? "lot_inconnu"
          : Math.abs(vrac.sommeRecette - vrac.base) > TOLERANCE_RECETTE * vrac.base
            ? "incomplete"
            : "ok";
    // Sans recette ou sans lot : rien a calculer. Recette incomplete : on compte quand meme les matieres deja saisies (la page
    // signale que les autres manquent).
    if (vrac.statutRecette === "sans_recette" || vrac.statutRecette === "lot_inconnu") continue;
    for (const ligne of lignes) {
      const courant = besoinParMp.get(ligne.article_mp_id) ?? {
        besoinTotal: 0,
        deduitStock: 0,
        deduitProgramme: 0,
        besoin: 0,
        utilisePar: new Set<string>(),
        tousVracs: new Set<string>(),
        proformas: new Set<string>(),
      };
      const pourKg = (kg: number) => (kg * Number(ligne.quantite)) / vrac.base;
      courant.besoinTotal += pourKg(vrac.kgTotal);
      courant.deduitStock += pourKg(vrac.kgCouvertStock);
      courant.deduitProgramme += pourKg(vrac.kgCouvertProgramme);
      courant.besoin += pourKg(vrac.kg);
      courant.tousVracs.add(vrac.nom);
      if (vrac.kg > 0) {
        courant.utilisePar.add(vrac.nom);
        for (const article of vrac.articles) for (const proforma of article.proformas) courant.proformas.add(proforma);
      }
      besoinParMp.set(ligne.article_mp_id, courant);
    }
  }

  // Problemes d'abord (pas de recette, lot inconnu, recette incomplete), puis les recettes completes
  const rangStatut = (statut: StatutRecetteFabrication) =>
    statut === "sans_recette" ? 0 : statut === "lot_inconnu" ? 1 : statut === "incomplete" ? 2 : 3;
  vracs.sort(
    (a, b) => rangStatut(a.statutRecette) - rangStatut(b.statutRecette) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" })
  );
  for (const vrac of vracs) vrac.articles.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  const mpIds = [...besoinParMp.keys()];
  if (mpIds.length === 0) return resultatVide;

  // Un souci de lecture des commandes / imports ne doit pas bloquer le calcul du besoin : on le signale seulement
  let arrivagesIndisponibles = false;
  const [mpRows, soldesDepotE, arrivages] = await Promise.all([
    lireParIds<MpRow>("articles_matiere_premiere", "id, nom_article, unite, categorie", "id", mpIds),
    lireStockMpDepotE(),
    lireArrivagesMp(mpIds).catch((): Arrivages => {
      arrivagesIndisponibles = true;
      return { commandesParMp: new Map(), importsParMp: new Map() };
    }),
  ]);
  const mpParId = new Map(mpRows.map((mp) => [mp.id, mp]));
  const stockParMp = new Map(soldesDepotE.map((solde) => [solde.article_id, solde.stock]));

  const besoins: BesoinMpFabrication[] = [...besoinParMp.entries()].map(([articleMpId, valeur]) => {
    const mp = mpParId.get(articleMpId);
    const stock = stockParMp.get(articleMpId) ?? 0;
    // Un stock negatif (sorties saisies en trop) n'est pas du stock a "rembourser" : on compte au plus 0 de disponible
    const manqueBrut = Math.max(0, valeur.besoin - Math.max(stock, 0));
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
      besoinTotal: valeur.besoinTotal,
      deduitStock: valeur.deduitStock,
      deduitProgramme: valeur.deduitProgramme,
      besoin: valeur.besoin,
      stock,
      manque,
      // les vracs a fabriquer d'abord ; si tout est couvert, tous les vracs commandes qui l'utilisent
      utilisePar: [...(valeur.utilisePar.size > 0 ? valeur.utilisePar : valeur.tousVracs)].sort((a, b) =>
        a.localeCompare(b, "fr", { sensitivity: "base" })
      ),
      proformas: [...valeur.proformas].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
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
