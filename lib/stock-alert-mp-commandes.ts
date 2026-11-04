import { supabaseServer } from "@/lib/supabase-server";
import { getBaseProforma } from "@/app/tableau-commandes/family-data";
import {
  calculerBesoinDepuisProformas,
  type ArticleCommande,
  type CommandeEnCours,
  type CommandeProforma,
  type ImportEnCours,
  type ProformaSaisie,
} from "@/lib/besoin-conditionnement-proforma";
import {
  calculerBesoinFabricationDepuis,
  type ArticleSansVrac,
  type VracAFabriquer,
} from "@/lib/besoin-fabrication-proforma";

// Stock Alert MP par commande : pour TOUTES les commandes ouvertes (Commandes PF non livrees, regroupees par proforma), les matieres
// premieres dont le stock ne suffit pas. C'est le Besoin Conditionnement + le Besoin Fabrication sans avoir a taper les proformas :
//  - articles de conditionnement : Recette Conditionnement de chaque article commande (cartons a produire = commandes moins stock PF) ;
//  - matieres premieres de fabrication : kg de vrac a fabriquer x Recette Fabrication du vrac ;
//  - le besoin de chaque MP (fabrication + conditionnement) est compare au stock du Depot E SEULEMENT, puis aux commandes (BC) et
//    imports en cours (commande et import ne se comptent jamais deux fois).
// Les articles dont la recette n'est pas encore ecrite ne peuvent pas etre calcules : ils sont listes a part (le besoin de leurs MP
// n'est PAS compte), pour que l'alerte ne laisse pas croire que tout va bien.

export type StatutAlerteMp = "non_couvert" | "couvert" | "ok";

export type AlerteMp = {
  articleMpId: number;
  nom: string;
  unite: string;
  categorie: string;
  besoinFabrication: number;
  besoinConditionnement: number;
  besoin: number;
  // stock du Depot E (peut etre negatif : sorties saisies en trop ; le manque compte alors 0 de disponible)
  stock: number;
  manque: number;
  // part du besoin couverte par le stock du Depot E (0 a 1)
  couverture: number;
  commandes: CommandeEnCours[];
  commandeTotal: number;
  imports: ImportEnCours[];
  importTotal: number;
  // manque moins ce qui arrive (commandes + imports) ; 0 = le manque est couvert
  resteACouvrir: number;
  // non_couvert : manque que rien ne couvre ; couvert : manque couvert par un BC / un import ; ok : le stock suffit
  statut: StatutAlerteMp;
  // articles finis / vracs dont la recette utilise cette MP
  utilisePar: string[];
  // proformas dont des cartons restent a produire avec cette MP, avec leur client
  proformas: { proforma: string; client: string }[];
};

export type ResultatAlerteMp = {
  // commandes ouvertes, regroupees par proforma (numero de base, sans le -1 / -2 du camion)
  proformas: ProformaSaisie[];
  nbCommandes: number;
  // articles commandes dont il reste des cartons a produire (les autres sont couverts par le stock PF)
  nbArticlesAProduire: number;
  alertes: AlerteMp[];
  // articles a produire dont la Recette Conditionnement manque ou ne donne pas le lot : leurs articles de conditionnement ne sont pas comptes
  articlesSansRecette: ArticleCommande[];
  // articles a produire dont on ne sait pas calculer le vrac
  sansVrac: ArticleSansVrac[];
  // vracs a fabriquer dont la Recette Fabrication manque, est incomplete ou n'a pas le lot : leurs MP ne sont pas (ou pas toutes) comptees
  vracsSansRecetteComplete: VracAFabriquer[];
  nbVracs: number;
  arrivagesIndisponibles: boolean;
};

type CommandeRow = { id: number; client: string | null; statut: string | null; numero_proforma: string | null };

// Commandes non livrees regroupees par proforma de base (un camion = sa proforma de base, comme dans le Tableau de commande).
// sansStand : comme "Supprimer stand" du Tableau de commande.
async function lireCommandesOuvertes(sansStand: boolean): Promise<ProformaSaisie[]> {
  const parProforma = new Map<string, CommandeProforma[]>();
  for (let debut = 0; ; debut += 1000) {
    let requete = supabaseServer.from("commandes").select("id, client, statut, numero_proforma").neq("statut", "LIVREE");
    if (sansStand) requete = requete.neq("statut", "STAND");
    const { data, error } = await requete.order("id", { ascending: true }).range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as CommandeRow[];
    for (const commande of page) {
      const numero = String(commande.numero_proforma ?? "").trim();
      const base = getBaseProforma(numero) || "-";
      const liste = parProforma.get(base) ?? [];
      liste.push({
        id: commande.id,
        client: String(commande.client ?? "").trim(),
        statut: String(commande.statut ?? "").trim(),
        numeroProforma: numero,
      });
      parProforma.set(base, liste);
    }
    if (page.length < 1000) break;
  }
  return [...parProforma.entries()].map(([saisie, commandes]) => ({ saisie, commandes }));
}

type Cumul = {
  articleMpId: number;
  nom: string;
  unite: string;
  categorie: string;
  besoinFabrication: number;
  besoinConditionnement: number;
  stock: number;
  commandes: CommandeEnCours[];
  imports: ImportEnCours[];
  utilisePar: Set<string>;
  proformas: Set<string>;
};

export async function calculerAlerteMpCommandes(options?: { sansStand?: boolean }): Promise<ResultatAlerteMp> {
  const sansStand = options?.sansStand ?? false;
  const proformas = await lireCommandesOuvertes(sansStand);
  const nbCommandes = proformas.reduce((somme, proforma) => somme + proforma.commandes.length, 0);
  const resultatVide: ResultatAlerteMp = {
    proformas,
    nbCommandes,
    nbArticlesAProduire: 0,
    alertes: [],
    articlesSansRecette: [],
    sansVrac: [],
    vracsSansRecetteComplete: [],
    nbVracs: 0,
    arrivagesIndisponibles: false,
  };
  if (proformas.length === 0) return resultatVide;

  // Un seul calcul des cartons a produire (commandes + stock PF) pour les deux besoins
  const conditionnement = await calculerBesoinDepuisProformas(proformas, { sansStand });
  const fabrication = await calculerBesoinFabricationDepuis(conditionnement);

  const clientParProforma = new Map(
    proformas.map((proforma) => [
      proforma.saisie,
      [...new Set(proforma.commandes.map((commande) => commande.client).filter(Boolean))].join(", "),
    ])
  );

  const parMp = new Map<number, Cumul>();
  for (const besoin of conditionnement.besoins) {
    parMp.set(besoin.articleMpId, {
      articleMpId: besoin.articleMpId,
      nom: besoin.nom,
      unite: besoin.unite,
      categorie: besoin.categorie,
      besoinFabrication: 0,
      besoinConditionnement: besoin.besoin,
      stock: besoin.stock,
      commandes: besoin.commandes,
      imports: besoin.imports,
      utilisePar: new Set(besoin.utilisePar),
      proformas: new Set(besoin.proformas),
    });
  }
  for (const besoin of fabrication.besoins) {
    const existant = parMp.get(besoin.articleMpId);
    if (existant) {
      // Une MP utilisee par une recette de fabrication ET de conditionnement : un seul stock, un seul besoin (la somme)
      existant.besoinFabrication += besoin.besoin;
      for (const nom of besoin.utilisePar) existant.utilisePar.add(nom);
      for (const proforma of besoin.proformas) existant.proformas.add(proforma);
      continue;
    }
    parMp.set(besoin.articleMpId, {
      articleMpId: besoin.articleMpId,
      nom: besoin.nom,
      unite: besoin.unite,
      categorie: besoin.categorie,
      besoinFabrication: besoin.besoin,
      besoinConditionnement: 0,
      stock: besoin.stock,
      commandes: besoin.commandes,
      imports: besoin.imports,
      utilisePar: new Set(besoin.utilisePar),
      proformas: new Set(besoin.proformas),
    });
  }

  const alertes: AlerteMp[] = [...parMp.values()].map((cumul) => {
    const besoin = cumul.besoinFabrication + cumul.besoinConditionnement;
    const disponible = Math.max(cumul.stock, 0);
    // arrondis pour ne pas afficher un manque de 0,0000001 cause par les virgules flottantes
    const manqueBrut = Math.max(0, besoin - disponible);
    const manque = manqueBrut < 1e-6 ? 0 : manqueBrut;
    const commandeTotal = cumul.commandes.reduce((somme, commande) => somme + commande.quantite, 0);
    const importTotal = cumul.imports.reduce((somme, transit) => somme + transit.quantite, 0);
    const resteBrut = Math.max(0, manque - commandeTotal - importTotal);
    const resteACouvrir = resteBrut < 1e-6 ? 0 : resteBrut;
    return {
      articleMpId: cumul.articleMpId,
      nom: cumul.nom,
      unite: cumul.unite,
      categorie: cumul.categorie,
      besoinFabrication: cumul.besoinFabrication,
      besoinConditionnement: cumul.besoinConditionnement,
      besoin,
      stock: cumul.stock,
      manque,
      couverture: besoin > 0 ? Math.min(1, disponible / besoin) : 1,
      commandes: cumul.commandes,
      commandeTotal,
      imports: cumul.imports,
      importTotal,
      resteACouvrir,
      statut: resteACouvrir > 0 ? "non_couvert" : manque > 0 ? "couvert" : "ok",
      utilisePar: [...cumul.utilisePar].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
      proformas: [...cumul.proformas]
        .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
        .map((proforma) => ({ proforma, client: clientParProforma.get(proforma) ?? "" })),
    };
  });
  // Non couvertes d'abord, puis en manque couvertes par un BC / un import, puis le reste ; dans chaque groupe la moins couverte
  // par le stock d'abord (en %, les unites ne se comparent pas), puis par nom
  const rang = (alerte: AlerteMp) => (alerte.statut === "non_couvert" ? 0 : alerte.statut === "couvert" ? 1 : 2);
  alertes.sort(
    (a, b) =>
      rang(a) - rang(b) ||
      a.couverture - b.couverture ||
      a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" })
  );

  return {
    proformas,
    nbCommandes,
    nbArticlesAProduire: fabrication.nbArticlesAProduire,
    alertes,
    articlesSansRecette: conditionnement.articles.filter(
      (article) => article.aProduire > 0 && (article.statutRecette === "sans_recette" || article.statutRecette === "lot_inconnu")
    ),
    sansVrac: fabrication.sansVrac,
    vracsSansRecetteComplete: fabrication.vracs.filter((vrac) => vrac.statutRecette !== "ok"),
    nbVracs: fabrication.vracs.length,
    arrivagesIndisponibles: conditionnement.arrivagesIndisponibles || fabrication.arrivagesIndisponibles,
  };
}
