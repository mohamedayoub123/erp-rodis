import { supabaseServer } from "@/lib/supabase-server";
import { lireSoldesLotsMp } from "@/lib/lot-balances-mp";
import { getBaseProforma } from "@/app/tableau-commandes/family-data";
import { computeStatutBc } from "@/app/stock/matiere-premiere/bc/constants";

// Besoin en articles de conditionnement d'une ou plusieurs proformas (Commandes PF), calcule avec la Recette Conditionnement
// de chaque article commande : la recette (table recettes_pf) donne, pour un lot de "quantite_recette_base" cartons, la quantite
// de chaque article de conditionnement (matiere premiere) ; on la ramene au nombre de cartons commandes puis on la compare au
// stock MP actuel. Les articles commandes qui n'ont pas de recette sont listes a part.
//
// Pour chaque article de conditionnement, on indique aussi ce qui arrive deja : les commandes (BC) en cours, ou il reste a
// recevoir, et les imports en transit (meme regle que Statistique MP : evenement d'import pas encore receptionne dont le
// dossier n'est pas encore "Receptionne Rodis"). Le reste a recevoir d'un BC deduit tout ce qui en a deja ete importe, donc
// commande + import ne se comptent jamais deux fois.

const STATUT_DOSSIER_MP_TERMINE = "Receptionne Rodis";

export const MAX_PROFORMAS = 30;

export type CommandeProforma = {
  id: number;
  client: string;
  statut: string;
  numeroProforma: string;
};

export type ProformaSaisie = {
  saisie: string;
  commandes: CommandeProforma[];
};

export type StatutRecette = "ok" | "sans_recette" | "lot_inconnu";

export type ArticleCommande = {
  articleId: number;
  nom: string;
  cartons: number;
  // proformas (numero de base) ou cet article est commande, avec les cartons de chacune
  parProforma: { proforma: string; cartons: number }[];
  statutRecette: StatutRecette;
  nbLignesRecette: number;
  // vrac necessaire (kg) pour les cartons commandes, quand l'article a un vrac et que la recette permet de le calculer
  vracKg: number | null;
  vracNom: string | null;
};

// Commande (BC) en cours : ce qu'il reste a recevoir sur une ligne de bon de commande
export type CommandeEnCours = {
  code: string;
  nDoss4d: string | null;
  nDossErp: string | null;
  quantite: number;
};

// Import en transit : evenement d'import pas encore receptionne, regroupe par dossier
export type ImportEnCours = {
  nDoss4d: string | null;
  nDossErp: string | null;
  quantite: number;
  statutDossier: string;
  datePrevueReception: string | null;
};

export type BesoinArticleConditionnement = {
  articleMpId: number;
  nom: string;
  unite: string;
  besoin: number;
  stock: number;
  manque: number;
  utilisePar: string[];
  commandes: CommandeEnCours[];
  commandeTotal: number;
  imports: ImportEnCours[];
  importTotal: number;
  // manque moins ce qui arrive (commandes + imports) ; 0 = le manque est couvert
  resteACouvrir: number;
};

export type ResultatBesoin = {
  proformas: ProformaSaisie[];
  articles: ArticleCommande[];
  besoins: BesoinArticleConditionnement[];
  // vrai si les commandes / imports n'ont pas pu etre lus (le reste du calcul reste valable)
  arrivagesIndisponibles: boolean;
};

type CommandeRow = { id: number; client: string | null; statut: string | null; numero_proforma: string | null };
type LigneRow = { commande_id: number; article_id: number | null; quantite_demandee: number | null };
type ArticleRow = {
  id: number;
  nom_article: string | null;
  quantite_recette_base: number | null;
  vrac_article_id: number | null;
  vrac_quantite_recette: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};
type RecetteRow = { article_pf_id: number; article_mp_id: number; quantite: number | null };
type MpRow = { id: number; nom_article: string | null; unite: string | null };
type BcLigneRow = {
  id: number;
  article_id: number | null;
  code: string | null;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  quantite: number | null;
  statut: string | null;
};
type ImportEvenementRow = {
  id: number;
  bc_ligne_id: number;
  n_doss_4d_import: string | null;
  n_doss_erp_import: string | null;
  quantite_importee: number | null;
  lot_stock_id: number | null;
};
type DossierStatutRow = {
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  statut: string | null;
  date_prevue_reception: string | null;
};

type Arrivages = {
  commandesParMp: Map<number, CommandeEnCours[]>;
  importsParMp: Map<number, ImportEnCours[]>;
};

function cleDossier(nDoss4d: string | null, nDossErp: string | null) {
  return `${nDoss4d ?? ""}|||${nDossErp ?? ""}`;
}

// "3685, 3928 03983" -> ["3685", "3928", "03983"] (virgule, point-virgule, espace ou retour a la ligne ; sans doublon)
export function lireProformasSaisies(texte: string): string[] {
  const vus = new Set<string>();
  const liste: string[] = [];
  for (const morceau of texte.split(/[\s,;]+/)) {
    const propre = morceau.trim().replace(/[^A-Za-z0-9_./-]/g, "");
    if (!propre) continue;
    const cle = normaliser(propre);
    if (vus.has(cle)) continue;
    vus.add(cle);
    liste.push(propre);
  }
  return liste.slice(0, MAX_PROFORMAS);
}

// Compare sans tenir compte des majuscules ni des zeros de tete ("03983" = "3983")
function normaliser(numero: string) {
  return numero.trim().toUpperCase().replace(/^0+(?=.)/, "");
}

function aSuffixeCamion(numero: string) {
  return /-\d+$/.test(numero.trim());
}

function decouper<T>(liste: T[], taille: number): T[][] {
  const morceaux: T[][] = [];
  for (let debut = 0; debut < liste.length; debut += taille) morceaux.push(liste.slice(debut, debut + taille));
  return morceaux;
}

async function lireCommandesProforma(saisie: string): Promise<CommandeProforma[]> {
  // Le filtre SQL reste large (contient le numero, sans zeros de tete) ; la correspondance exacte est faite en JS
  const coeur = normaliser(saisie);
  const { data, error } = await supabaseServer
    .from("commandes")
    .select("id, client, statut, numero_proforma")
    .ilike("numero_proforma", `%${coeur}%`)
    .order("id", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);

  const camionPrecis = aSuffixeCamion(saisie);
  return ((data ?? []) as CommandeRow[])
    .filter((commande) => {
      const numero = String(commande.numero_proforma ?? "");
      if (!numero.trim()) return false;
      return camionPrecis
        ? normaliser(numero) === normaliser(saisie)
        : normaliser(getBaseProforma(numero.trim())) === normaliser(saisie);
    })
    .map((commande) => ({
      id: commande.id,
      client: String(commande.client ?? "").trim(),
      statut: String(commande.statut ?? "").trim(),
      numeroProforma: String(commande.numero_proforma ?? "").trim(),
    }));
}

async function lireLignes(commandeIds: number[]): Promise<LigneRow[]> {
  const lignes: LigneRow[] = [];
  for (const morceau of decouper(commandeIds, 100)) {
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await supabaseServer
        .from("commande_lignes")
        .select("commande_id, article_id, quantite_demandee")
        .in("commande_id", morceau)
        .order("id", { ascending: true })
        .range(debut, debut + 999);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as LigneRow[];
      lignes.push(...page);
      if (page.length < 1000) break;
    }
  }
  return lignes;
}

async function lireParIds<T>(table: string, colonnes: string, colonneId: string, ids: number[]): Promise<T[]> {
  const lignes: T[] = [];
  for (const morceau of decouper(ids, 150)) {
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await supabaseServer
        .from(table)
        .select(colonnes)
        .in(colonneId, morceau)
        .order("id", { ascending: true })
        .range(debut, debut + 999);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as T[];
      lignes.push(...page);
      if (page.length < 1000) break;
    }
  }
  return lignes;
}

// Commandes (BC) et imports en cours des articles de conditionnement demandes (mpIds = articles_matiere_premiere.id)
async function lireArrivagesMp(mpIds: number[]): Promise<Arrivages> {
  const commandesParMp = new Map<number, CommandeEnCours[]>();
  const importsParMp = new Map<number, ImportEnCours[]>();
  if (mpIds.length === 0) return { commandesParMp, importsParMp };

  const bcLignes = await lireParIds<BcLigneRow>(
    "bons_commande_matiere_premiere",
    "id, article_id, code, n_doss_4d, n_doss_erp, quantite, statut",
    "article_id",
    mpIds
  );
  const ligneIds = bcLignes.map((ligne) => ligne.id);
  const [evenements, statutsDossier] = await Promise.all([
    ligneIds.length > 0
      ? lireParIds<ImportEvenementRow>(
          "bons_commande_mp_imports",
          "id, bc_ligne_id, n_doss_4d_import, n_doss_erp_import, quantite_importee, lot_stock_id",
          "bc_ligne_id",
          ligneIds
        )
      : Promise.resolve([] as ImportEvenementRow[]),
    lireTousLesStatutsDossier(),
  ]);

  const statutParDossier = new Map(
    statutsDossier.map((ligne) => [cleDossier(ligne.n_doss_4d, ligne.n_doss_erp), ligne])
  );
  const articleParLigne = new Map<number, number>();
  for (const ligne of bcLignes) if (ligne.article_id) articleParLigne.set(ligne.id, ligne.article_id);

  // Quantite DEJA importee par ligne de BC (tous evenements, receptionnes ou pas) : sert au statut et au reste a recevoir
  const importeeParLigne = new Map<number, number>();
  for (const evenement of evenements) {
    importeeParLigne.set(
      evenement.bc_ligne_id,
      (importeeParLigne.get(evenement.bc_ligne_id) ?? 0) + Number(evenement.quantite_importee ?? 0)
    );
  }

  // Commandes en cours : ligne pas "Termine", reste a recevoir = commande - deja importe
  const commandeParMpEtCode = new Map<string, CommandeEnCours & { mpId: number }>();
  for (const ligne of bcLignes) {
    if (!ligne.article_id) continue;
    const quantite = Number(ligne.quantite ?? 0);
    const importee = importeeParLigne.get(ligne.id) ?? 0;
    if (computeStatutBc(quantite, importee, ligne.statut) === "Termine") continue;
    const reste = Math.max(0, quantite - importee);
    if (!(reste > 0)) continue;
    const code = String(ligne.code ?? "").trim() || `ligne ${ligne.id}`;
    const cle = `${ligne.article_id}::${code}`;
    const existant = commandeParMpEtCode.get(cle);
    if (existant) existant.quantite += reste;
    else commandeParMpEtCode.set(cle, { mpId: ligne.article_id, code, nDoss4d: ligne.n_doss_4d, nDossErp: ligne.n_doss_erp, quantite: reste });
  }
  for (const { mpId, ...commande } of commandeParMpEtCode.values()) {
    const liste = commandesParMp.get(mpId) ?? [];
    liste.push(commande);
    commandesParMp.set(mpId, liste);
  }

  // Imports en transit : evenement pas encore receptionne (pas de lot de stock) dont le dossier n'est pas "Receptionne Rodis"
  const importParMpEtDossier = new Map<string, ImportEnCours & { mpId: number }>();
  for (const evenement of evenements) {
    if (evenement.lot_stock_id !== null) continue;
    const mpId = articleParLigne.get(evenement.bc_ligne_id);
    if (!mpId) continue;
    const cleDoss = cleDossier(evenement.n_doss_4d_import, evenement.n_doss_erp_import);
    const dossier = statutParDossier.get(cleDoss);
    if (dossier?.statut === STATUT_DOSSIER_MP_TERMINE) continue;
    const quantite = Number(evenement.quantite_importee ?? 0);
    if (!(quantite > 0)) continue;
    const cle = `${mpId}::${cleDoss}`;
    const existant = importParMpEtDossier.get(cle);
    if (existant) existant.quantite += quantite;
    else {
      importParMpEtDossier.set(cle, {
        mpId,
        nDoss4d: evenement.n_doss_4d_import,
        nDossErp: evenement.n_doss_erp_import,
        quantite,
        statutDossier: dossier?.statut ?? "",
        datePrevueReception: dossier?.date_prevue_reception ?? null,
      });
    }
  }
  for (const { mpId, ...transit } of importParMpEtDossier.values()) {
    const liste = importsParMp.get(mpId) ?? [];
    liste.push(transit);
    importsParMp.set(mpId, liste);
  }

  return { commandesParMp, importsParMp };
}

async function lireTousLesStatutsDossier(): Promise<DossierStatutRow[]> {
  const lignes: DossierStatutRow[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("dossiers_import_mp_statut")
      .select("n_doss_4d, n_doss_erp, statut, date_prevue_reception")
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as DossierStatutRow[];
    lignes.push(...page);
    if (page.length < 1000) break;
  }
  return lignes;
}

export async function calculerBesoinProformas(saisies: string[]): Promise<ResultatBesoin> {
  const proformas: ProformaSaisie[] = await Promise.all(
    saisies.map(async (saisie) => ({ saisie, commandes: await lireCommandesProforma(saisie) }))
  );

  // Une commande trouvee par 2 saisies (ex. "3983" et "03983") n'est comptee qu'une fois
  const commandeParId = new Map<number, CommandeProforma>();
  for (const proforma of proformas) for (const commande of proforma.commandes) commandeParId.set(commande.id, commande);
  if (commandeParId.size === 0) return { proformas, articles: [], besoins: [], arrivagesIndisponibles: false };

  const lignes = await lireLignes([...commandeParId.keys()]);

  const cartonsParArticle = new Map<number, number>();
  const parProformaParArticle = new Map<number, Map<string, number>>();
  for (const ligne of lignes) {
    if (!ligne.article_id) continue;
    const cartons = Number(ligne.quantite_demandee ?? 0);
    if (!(cartons > 0)) continue;
    const commande = commandeParId.get(ligne.commande_id);
    const proforma = getBaseProforma(String(commande?.numeroProforma ?? "").trim()) || "-";
    cartonsParArticle.set(ligne.article_id, (cartonsParArticle.get(ligne.article_id) ?? 0) + cartons);
    const parProforma = parProformaParArticle.get(ligne.article_id) ?? new Map<string, number>();
    parProforma.set(proforma, (parProforma.get(proforma) ?? 0) + cartons);
    parProformaParArticle.set(ligne.article_id, parProforma);
  }

  const articleIds = [...cartonsParArticle.keys()];
  if (articleIds.length === 0) return { proformas, articles: [], besoins: [], arrivagesIndisponibles: false };

  const [articlesRows, recettes] = await Promise.all([
    lireParIds<ArticleRow>(
      "articles",
      "id, nom_article, quantite_recette_base, vrac_article_id, vrac_quantite_recette, contenance, piece_par_carton",
      "id",
      articleIds
    ),
    lireParIds<RecetteRow>("recettes_pf", "id, article_pf_id, article_mp_id, quantite", "article_pf_id", articleIds),
  ]);
  const articleParId = new Map(articlesRows.map((article) => [article.id, article]));

  const recettesParArticle = new Map<number, RecetteRow[]>();
  for (const ligne of recettes) {
    if (!(Number(ligne.quantite ?? 0) > 0)) continue;
    const liste = recettesParArticle.get(ligne.article_pf_id) ?? [];
    liste.push(ligne);
    recettesParArticle.set(ligne.article_pf_id, liste);
  }

  const mpIds = [...new Set(recettes.map((ligne) => ligne.article_mp_id))];
  const vracIds = [...new Set(articlesRows.map((article) => article.vrac_article_id).filter((id): id is number => !!id))];
  // Un souci de lecture des commandes / imports ne doit pas bloquer le calcul du besoin : on le signale seulement
  let arrivagesIndisponibles = false;
  const [mpRows, vracRows, soldes, arrivages] = await Promise.all([
    mpIds.length > 0 ? lireParIds<MpRow>("articles_matiere_premiere", "id, nom_article, unite", "id", mpIds) : Promise.resolve([]),
    vracIds.length > 0 ? lireParIds<{ id: number; nom_article: string | null }>("articles", "id, nom_article", "id", vracIds) : Promise.resolve([]),
    lireSoldesLotsMp(),
    lireArrivagesMp(mpIds).catch((): Arrivages => {
      arrivagesIndisponibles = true;
      return { commandesParMp: new Map(), importsParMp: new Map() };
    }),
  ]);
  const mpParId = new Map(mpRows.map((mp) => [mp.id, mp]));
  const vracParId = new Map(vracRows.map((vrac) => [vrac.id, vrac.nom_article ?? `Article ${vrac.id}`]));
  const stockParMp = new Map<number, number>();
  for (const solde of soldes) stockParMp.set(solde.article_id, (stockParMp.get(solde.article_id) ?? 0) + Number(solde.stock ?? 0));

  const articles: ArticleCommande[] = [];
  const besoinParMp = new Map<number, { besoin: number; utilisePar: Set<string> }>();

  for (const articleId of articleIds) {
    const article = articleParId.get(articleId);
    const nom = article?.nom_article ?? `Article ${articleId}`;
    const cartons = cartonsParArticle.get(articleId) ?? 0;
    const lignesRecette = recettesParArticle.get(articleId) ?? [];
    const base = Number(article?.quantite_recette_base ?? 0);

    let statutRecette: StatutRecette = "ok";
    if (lignesRecette.length === 0) statutRecette = "sans_recette";
    else if (!(base > 0)) statutRecette = "lot_inconnu";

    if (statutRecette === "ok") {
      for (const ligne of lignesRecette) {
        const besoin = (cartons * Number(ligne.quantite)) / base;
        const courant = besoinParMp.get(ligne.article_mp_id) ?? { besoin: 0, utilisePar: new Set<string>() };
        courant.besoin += besoin;
        courant.utilisePar.add(nom);
        besoinParMp.set(ligne.article_mp_id, courant);
      }
    }

    // Vrac : meme regle que la page de la recette (quantite saisie pour le lot, sinon pieces par carton x contenance)
    let vracKg: number | null = null;
    if (article?.vrac_article_id) {
      if (article.vrac_quantite_recette !== null && article.vrac_quantite_recette !== undefined) {
        vracKg = (cartons * Number(article.vrac_quantite_recette)) / (base > 0 ? base : 1);
      } else if (article.piece_par_carton && article.contenance) {
        vracKg = cartons * Number(article.piece_par_carton) * Number(article.contenance);
      }
    }

    articles.push({
      articleId,
      nom,
      cartons,
      parProforma: [...(parProformaParArticle.get(articleId) ?? new Map<string, number>()).entries()].map(
        ([proforma, cartonsProforma]) => ({ proforma, cartons: cartonsProforma })
      ),
      statutRecette,
      nbLignesRecette: lignesRecette.length,
      vracKg,
      vracNom: article?.vrac_article_id ? (vracParId.get(article.vrac_article_id) ?? null) : null,
    });
  }

  const besoins: BesoinArticleConditionnement[] = [...besoinParMp.entries()].map(([articleMpId, valeur]) => {
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
      besoin: valeur.besoin,
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
  // Non couverts d'abord, puis en manque couverts par une commande / un import, puis le reste
  const rangBesoin = (besoin: BesoinArticleConditionnement) => (besoin.resteACouvrir > 0 ? 0 : besoin.manque > 0 ? 1 : 2);
  besoins.sort((a, b) => rangBesoin(a) - rangBesoin(b) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  articles.sort((a, b) => {
    const rang = (statut: StatutRecette) => (statut === "sans_recette" ? 0 : statut === "lot_inconnu" ? 1 : 2);
    return rang(a.statutRecette) - rang(b.statutRecette) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" });
  });

  return { proformas, articles, besoins, arrivagesIndisponibles };
}
