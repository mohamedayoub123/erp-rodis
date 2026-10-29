import { supabaseServer } from "@/lib/supabase-server";
import { lireSoldesLotsMp } from "@/lib/lot-balances-mp";
import { getBaseProforma } from "@/app/tableau-commandes/family-data";

// Besoin en articles de conditionnement d'une ou plusieurs proformas (Commandes PF), calcule avec la Recette Conditionnement
// de chaque article commande : la recette (table recettes_pf) donne, pour un lot de "quantite_recette_base" cartons, la quantite
// de chaque article de conditionnement (matiere premiere) ; on la ramene au nombre de cartons commandes puis on la compare au
// stock MP actuel. Les articles commandes qui n'ont pas de recette sont listes a part.

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

export type BesoinArticleConditionnement = {
  articleMpId: number;
  nom: string;
  unite: string;
  besoin: number;
  stock: number;
  manque: number;
  utilisePar: string[];
};

export type ResultatBesoin = {
  proformas: ProformaSaisie[];
  articles: ArticleCommande[];
  besoins: BesoinArticleConditionnement[];
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

export async function calculerBesoinProformas(saisies: string[]): Promise<ResultatBesoin> {
  const proformas: ProformaSaisie[] = await Promise.all(
    saisies.map(async (saisie) => ({ saisie, commandes: await lireCommandesProforma(saisie) }))
  );

  // Une commande trouvee par 2 saisies (ex. "3983" et "03983") n'est comptee qu'une fois
  const commandeParId = new Map<number, CommandeProforma>();
  for (const proforma of proformas) for (const commande of proforma.commandes) commandeParId.set(commande.id, commande);
  if (commandeParId.size === 0) return { proformas, articles: [], besoins: [] };

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
  if (articleIds.length === 0) return { proformas, articles: [], besoins: [] };

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
  const [mpRows, vracRows, soldes] = await Promise.all([
    mpIds.length > 0 ? lireParIds<MpRow>("articles_matiere_premiere", "id, nom_article, unite", "id", mpIds) : Promise.resolve([]),
    vracIds.length > 0 ? lireParIds<{ id: number; nom_article: string | null }>("articles", "id, nom_article", "id", vracIds) : Promise.resolve([]),
    lireSoldesLotsMp(),
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
    const manque = Math.max(0, valeur.besoin - Math.max(stock, 0));
    return {
      articleMpId,
      nom: mp?.nom_article ?? `Article MP ${articleMpId}`,
      unite: mp?.unite ?? "",
      besoin: valeur.besoin,
      stock,
      // arrondi pour ne pas afficher un manque de 0,0000001 cause par les virgules flottantes
      manque: manque < 1e-6 ? 0 : manque,
      utilisePar: [...valeur.utilisePar].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    };
  });
  besoins.sort((a, b) => (b.manque > 0 ? 1 : 0) - (a.manque > 0 ? 1 : 0) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  articles.sort((a, b) => {
    const rang = (statut: StatutRecette) => (statut === "sans_recette" ? 0 : statut === "lot_inconnu" ? 1 : 2);
    return rang(a.statutRecette) - rang(b.statutRecette) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" });
  });

  return { proformas, articles, besoins };
}
