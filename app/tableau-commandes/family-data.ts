import { supabaseServer } from "@/lib/supabase-server";
import { fetchRestantConditionnementEmballageByArticle } from "../production/suivi/data";
import {
  FAMILY_ORDER,
  FAMILY_SUBGAMMES,
  getFamilySubGamme,
  matchesFamilyGamme,
  ilikePatternForFamily,
  fetchDynamicFamilies,
} from "./family-lib";
import type { ExportCommandColumn, ExportDataRow } from "./tableau-export-button";

// Donnees du Tableau de commande (une famille = un tableau). Code deplace
// depuis page.tsx pour pouvoir etre reutilise par l'export Excel de toutes
// les familles (une page Next.js ne peut pas exporter autre chose que la page).

export type CommandColumn = {
  key: string;
  // Id de la 1ere commande du groupe (une colonne peut regrouper plusieurs
  // lignes "commandes" - meme camion/proforma partage) - sert d'ancrage pour
  // la note libre, exactement comme client/statut/numero_proforma qui sont
  // deja lus depuis cette 1ere commande du groupe.
  id: number;
  client: string;
  nombre_camion: number | null;
  mode_chargement: string;
  type_tc: string;
  numero_proforma: string;
  statut: string;
  date_ecriture: string | null;
  note: string;
};

export const EMPTY_TABLE_FAMILIES = new Set<string>([]);

// Some families group their table by article TYPE (Lait, Gel, Pommade,
// EDC...) instead of by a brand/scent sub-gamme.
export const TYPE_GROUPED_FAMILIES = new Set(["SOOPURE"]);
export const TYPE_GROUP_BANNER_CLASS = "bg-[#a6a6a6] text-white";

export function getArticleTypeLabel(article: string) {
  switch (getWhiteSecretArticleRank(article)) {
    case 1:
      return "LAIT";
    case 2:
      return "CREME";
    case 3:
      return "DSR";
    case 4:
      return "HUILE";
    case 5:
      return "SERUM";
    case 6:
      return "SAVON";
    case 7:
      return "GEL";
    case 8:
      return "EDC";
    case 9:
      return "POMMADE";
    case 10:
      return "TALC";
    default:
      return null;
  }
}

export function normalizeArticle(value: string) {
  return (value || "").replace(/\u00a0/g, "").trim().toUpperCase();
}

export type StockPageRawRow = {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  date_jour: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
};

export function computeCurrentStockLikeStockPage(rows: StockPageRawRow[]) {
  const displaySourceRows = rows.flatMap((row) => {
    const splitRows: StockPageRawRow[] = [];

    if (Number(row.qte_entree ?? 0) > 0) {
      splitRows.push({
        ...row,
        qte_sortie: 0,
      });
    }

    if (Number(row.qte_sortie ?? 0) > 0) {
      splitRows.push({
        ...row,
        qte_entree: 0,
      });
    }

    if (splitRows.length === 0) {
      splitRows.push(row);
    }

    return splitRows;
  });

  const sortedAscending = [...displaySourceRows].sort((a, b) => {
    const dateA = a.date_jour ? new Date(a.date_jour).getTime() : 0;
    const dateB = b.date_jour ? new Date(b.date_jour).getTime() : 0;

    if (dateA !== dateB) {
      return dateA - dateB;
    }

    return a.id - b.id;
  });

  // Single ascending pass with a running per-article total: the cumulative
  // value after processing the last (most recent) row is the current stock,
  // equivalent to sorting descending and reading the top row but in O(n).
  const runningByArticle = new Map<number, number>();
  let latestStock = 0;

  for (const row of sortedAscending) {
    const previousArticle = row.article_id ? runningByArticle.get(row.article_id) ?? 0 : 0;
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    const stockArticle = previousArticle + mouvement;

    if (row.article_id) {
      runningByArticle.set(row.article_id, stockArticle);
    }

    latestStock = stockArticle;
  }

  return Number(latestStock ?? 0);
}

// Une commande sur plusieurs camions cree une ligne "commandes" separee par
// camion (proforma suffixe "-2", "-3", ...) mais reste UNE seule commande
// pour l'affichage : on regroupe donc par proforma de base pour ne pas
// l'ecrire plusieurs fois dans le tableau (les quantites de chaque camion
// s'additionnent naturellement puisqu'elles partagent la meme cle).
export function getBaseProforma(numeroProforma: string) {
  return numeroProforma.replace(/-\d+$/, "");
}

export function buildCommandeKey(row: {
  client: string | null;
  mode_chargement: string | null;
  numero_proforma: string | null;
}) {
  const numero = getBaseProforma(String(row.numero_proforma || "").trim());
  if (numero) return `proforma::${numero}`;

  return [
    String(row.client || "").trim(),
    "",
    String(row.mode_chargement || "").trim(),
    numero,
  ].join("||");
}

export function getStatusLabel(statusValue: string | null | undefined) {
  const status = String(statusValue || "").toUpperCase();
  if (status === "STAND") return "STAND";
  if (status === "BL_TRANSFORME") return "BL TRANSFORME";
  return "EN COURS";
}

export function getWhiteSecretArticleRank(article: string) {
  // Strip accents first ("Crème".toUpperCase() is "CRÈME", not "CREME") so
  // accented article names still match their type group instead of falling
  // through to the generic bucket at the end.
  const value = article
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (value.endsWith("S-H")) return 99;
  if (value.startsWith("LAIT ")) return 1;
  if (value.startsWith("CREME ")) return 2;
  if (value.startsWith("DSR ")) return 3;
  if (value.startsWith("HUILE ")) return 4;
  if (value.startsWith("SERUM ")) return 5;
  if (value.startsWith("SAVON ")) return 6;
  if (value.startsWith("GEL DOUCHE ")) return 7;
  if (value.startsWith("EDC ")) return 8;
  if (value.startsWith("POMMADE ")) return 9;
  if (value.startsWith("TALC ")) return 10;

  return 50;
}

export function getWhiteSecretContenance(article: string) {
  const value = article.toUpperCase();
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(KG|GRS|G|ML|L)\b/);

  if (!match) return 0;

  const amount = Number(String(match[1]).replace(",", ".")) || 0;
  const unit = match[2];

  if (unit === "L") return amount * 1000;
  if (unit === "KG") return amount * 1000;
  if (unit === "G" || unit === "GRS") return amount;
  return amount;
}

// "Qt en cours de Conditionnement" par article, cle par nom d'article
// normalise pour matcher les autres maps de cette page (stockByArticle,
// quantitiesByArticle...) - deux morceaux additionnes :
// 1. Deja emballe (Suivi Production) mais pas encore valide dans le stock
//    (meme liste que "Entree Production" - transfere_stock=false).
// 2. Encore a produire au Conditionnement/Emballage (meme calcul que les
//    colonnes "Restant" du Dashboard Production), donc pas encore compte
//    dans la liste "Entree Production" ci-dessus.
export async function fetchQtEnCoursConditionnementByArticle() {
  const map = new Map<string, number>();

  const { data: pendingData, error: pendingError } = await supabaseServer
    .from("production_emballage_entries")
    .select("programme_ligne_id, quantite")
    .eq("transfere_stock", false)
    .limit(10000);

  const pendingRows =
    !pendingError && pendingData
      ? (pendingData as { programme_ligne_id: number | null; quantite: number | null }[])
      : [];

  const ligneIds = [
    ...new Set(pendingRows.map((row) => Number(row.programme_ligne_id ?? 0)).filter((id) => id > 0)),
  ];

  if (ligneIds.length > 0) {
    const { data: lignesData } = await supabaseServer
      .from("programme_lignes")
      .select("id, produit")
      .in("id", ligneIds);

    const lignes = (lignesData as { id: number; produit: string | null }[] | null) ?? [];
    const produitByLigneId = new Map(lignes.map((ligne) => [ligne.id, ligne.produit || ""]));

    for (const row of pendingRows) {
      const articleKey = normalizeArticle(produitByLigneId.get(Number(row.programme_ligne_id ?? 0)) || "");
      if (!articleKey) continue;

      map.set(articleKey, Number(map.get(articleKey) ?? 0) + Number(row.quantite ?? 0));
    }
  }

  const restantConditionnementEmballage = await fetchRestantConditionnementEmballageByArticle();
  for (const [articleKey, restant] of restantConditionnementEmballage) {
    map.set(articleKey, Number(map.get(articleKey) ?? 0) + restant);
  }

  return map;
}


// ---------------------------------------------------------------------------
// Stock actuel par article (meme calcul que la page Stock) - decoupe en deux
// etapes (lire les lots, puis calculer) pour pouvoir lire les lots UNE seule
// fois quand on calcule plusieurs familles d'un coup (export de toutes les
// familles).
// ---------------------------------------------------------------------------

export type LotsByArticleId = Map<number, StockPageRawRow[]>;

function indexArticleIdsByKey(articleRows: { id: number | null; nom_article: string | null }[]) {
  const normalizedTargets = [
    ...new Set(
      articleRows
        .map((row) => normalizeArticle(String(row.nom_article || "")))
        .filter((value) => value.length > 0)
    ),
  ];

  const idsByArticleKey = new Map<string, number[]>();
  for (const row of articleRows) {
    const articleKey = normalizeArticle(String(row.nom_article || ""));
    const articleId = Number(row.id ?? 0);

    if (!articleKey || articleId <= 0) continue;

    const currentIds = idsByArticleKey.get(articleKey) ?? [];
    currentIds.push(articleId);
    idsByArticleKey.set(articleKey, currentIds);
  }

  return { normalizedTargets, idsByArticleKey };
}

export async function fetchLotsByArticleId(unionIds: number[]): Promise<LotsByArticleId> {
  const lotsByArticleId: LotsByArticleId = new Map();
  if (unionIds.length === 0) return lotsByArticleId;

  // Pour un rapport toutes-familles, unionIds couvre quasiment tous les
  // articles PF - le nombre de lignes lots_stock correspondantes peut
  // depasser 15 000-20 000 (confirme en pratique), soit 15-20 pages. Les
  // recuperer une par une (boucle while sequentielle) faisait un
  // aller-retour reseau apres l'autre - mesure : ~5s a lui seul, l'essentiel
  // du temps de chargement de la page "Article manquant". Les pages sont
  // independantes (chaque article est re-trie individuellement plus bas par
  // computeCurrentStockLikeStockPage, donc l'ordre d'arrivee entre pages
  // n'a aucune importance) : on demande d'abord le nombre total de lignes
  // (requete "count" tres legere, sans transfert de donnees), puis on tire
  // toutes les pages en parallele.
  const pageSize = 1000;
  const { count: totalLotsCount, error: countError } = await supabaseServer
    .from("lots_stock")
    .select("id", { count: "exact", head: true })
    .in("article_id", unionIds);

  if (countError) {
    throw new Error(countError.message);
  }

  const pageCount = Math.max(1, Math.ceil((totalLotsCount ?? 0) / pageSize));

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, pageIndex) => {
      const from = pageIndex * pageSize;
      return supabaseServer
        .from("lots_stock")
        .select("id, article_id, numero_lot, date_jour, qte_entree, qte_sortie")
        .in("article_id", unionIds)
        .order("date_jour", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
    })
  );

  // Group once by article_id instead of re-scanning the whole lots list per
  // article (that was O(articles x lots), very slow once there are a few
  // hundred distinct articles across all families).
  for (const { data, error } of pages) {
    if (error) {
      throw new Error(error.message);
    }
    for (const row of (data as StockPageRawRow[] | null) ?? []) {
      const articleId = Number(row.article_id ?? 0);
      if (!articleId) continue;
      const list = lotsByArticleId.get(articleId) ?? [];
      list.push(row);
      lotsByArticleId.set(articleId, list);
    }
  }

  return lotsByArticleId;
}

export function computeStocksForArticles(
  articleRows: { id: number | null; nom_article: string | null }[],
  lotsByArticleId: LotsByArticleId
) {
  const { normalizedTargets, idsByArticleKey } = indexArticleIdsByKey(articleRows);
  const stockByArticle = new Map<string, number>();

  for (const articleKey of normalizedTargets) {
    const ids = idsByArticleKey.get(articleKey) ?? [];
    const relevantRows = ids.flatMap((id) => lotsByArticleId.get(id) ?? []);
    stockByArticle.set(articleKey, computeCurrentStockLikeStockPage(relevantRows));
  }

  return stockByArticle;
}

export async function fetchArticleStocksFromStockPage(
  articleRows: { id: number | null; nom_article: string | null }[]
) {
  const { idsByArticleKey } = indexArticleIdsByKey(articleRows);
  const unionIds = [...new Set([...idsByArticleKey.values()].flat().filter((value) => value > 0))];
  const lotsByArticleId = await fetchLotsByArticleId(unionIds);
  return computeStocksForArticles(articleRows, lotsByArticleId);
}

// ---------------------------------------------------------------------------
// Donnees d'UNE famille (ce que le tableau affiche) - utilisees par la page
// d'une famille ET par l'export Excel de toutes les familles, pour que les
// deux restent strictement identiques.
// ---------------------------------------------------------------------------

export type SubGammeInfo = { label: string; bannerClass: string };

export type FamilyTableData = {
  articleRows: string[];
  commandColumns: CommandColumn[];
  quantitiesByArticle: Map<string, Map<string, number>>;
  stockByArticle: Map<string, number>;
  qtEnCoursByArticleKey: Map<string, number>;
  subGammeByArticleKey?: Map<string, SubGammeInfo>;
};

type ArticleRowAll = { id: number; nom_article: string | null; gamme: string | null; nature: string | null };

type CommandeAvecLignes = {
  id: number;
  client: string | null;
  statut: string | null;
  mode_chargement: string | null;
  type_tc: string | null;
  numero_proforma: string | null;
  commande_lignes:
    | {
        quantite_demandee: number | null;
        articles:
          | { nom_article: string | null; gamme: string | null }
          | { nom_article: string | null; gamme: string | null }[]
          | null;
      }[]
    | null;
};

type CommandeColonneRow = {
  id: number;
  client: string | null;
  statut: string | null;
  mode_chargement: string | null;
  type_tc: string | null;
  numero_proforma: string | null;
  note_tableau_commande: string | null;
  created_at: string | null;
};

// Tout ce qui ne depend pas de la famille : lu une seule fois, que l'on
// affiche une famille ou qu'on les exporte toutes.
export type SharedFamilyData = {
  articles: ArticleRowAll[];
  commandesAvecLignes: CommandeAvecLignes[];
  commandesColonnes: CommandeColonneRow[];
  qtEnCoursByArticleKey: Map<string, number>;
  // Lots de stock de tous les articles produit fini, si on calcule plusieurs
  // familles (sinon chaque famille lit ses propres lots).
  lotsByArticleId?: LotsByArticleId;
  // Premiere erreur de lecture rencontree (la page l'ignore comme avant ;
  // l'export Excel la remonte pour ne jamais sortir un fichier incomplet).
  error: string | null;
};

// Lecture paginee et ordonnee (PostgREST plafonne une reponse a 1000 lignes ;
// sans ordre fixe une page pouvait sauter ou doubler des articles).
async function fetchAllArticlesRows(): Promise<{ rows: ArticleRowAll[]; error: string | null }> {
  const rows: ArticleRowAll[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme, nature")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error: error.message };

    const chunk = (data as ArticleRowAll[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export async function loadSharedFamilyData(options?: { withLots?: boolean }): Promise<SharedFamilyData> {
  const [articlesResult, commandesAvecLignesResult, commandesColonnesResult, qtEnCoursByArticleKey] =
    await Promise.all([
      fetchAllArticlesRows(),
      supabaseServer
        .from("commandes")
        .select(
          "id, client, statut, mode_chargement, type_tc, numero_proforma, commande_lignes(quantite_demandee, articles(nom_article, gamme))"
        )
        .neq("statut", "LIVREE")
        .order("created_at", { ascending: true }),
      supabaseServer
        .from("commandes")
        .select("id, client, statut, mode_chargement, type_tc, numero_proforma, note_tableau_commande, created_at")
        .neq("statut", "LIVREE")
        .order("created_at", { ascending: true }),
      fetchQtEnCoursConditionnementByArticle(),
    ]);

  const articles = articlesResult.rows;
  let lotsByArticleId: LotsByArticleId | undefined;
  if (options?.withLots) {
    const ids = [...new Set(articles.filter((row) => row.nature !== "vrac").map((row) => Number(row.id)))].filter(
      (id) => id > 0
    );
    lotsByArticleId = await fetchLotsByArticleId(ids);
  }

  return {
    articles,
    commandesAvecLignes: (commandesAvecLignesResult.data as CommandeAvecLignes[] | null) ?? [],
    commandesColonnes: (commandesColonnesResult.data as CommandeColonneRow[] | null) ?? [],
    qtEnCoursByArticleKey,
    lotsByArticleId,
    error: articlesResult.error ?? commandesAvecLignesResult.error?.message ?? commandesColonnesResult.error?.message ?? null,
  };
}

// Equivalent du filtre SQL ILIKE '%motif%' utilise avant pour lire les articles
// d'une famille (une gamme vide/NULL ne correspond jamais).
function gammeMatchesIlikePattern(gamme: string | null, pattern: string) {
  if (gamme === null || gamme === undefined) return false;
  const inner = pattern.replace(/^%+/, "").replace(/%+$/, "").toLowerCase();
  return String(gamme).toLowerCase().includes(inner);
}

function buildAllActiveCommandColumns(rows: CommandeColonneRow[]) {
  const columns: CommandColumn[] = [];
  const keySet = new Set<string>();

  for (const commande of rows) {
    const key = buildCommandeKey(commande);
    if (keySet.has(key)) continue;
    keySet.add(key);

    columns.push({
      key,
      id: commande.id,
      client: String(commande.client || "").trim(),
      nombre_camion: Number(commande.type_tc) || 1,
      mode_chargement: String(commande.mode_chargement || "").trim(),
      type_tc: String(commande.type_tc || "").trim(),
      numero_proforma: String(commande.numero_proforma || "").trim(),
      statut: String(commande.statut || "EN_COURS").trim(),
      date_ecriture: commande.created_at,
      note: String(commande.note_tableau_commande || ""),
    });
  }

  return columns;
}

export async function loadFamilyTableData(
  selectedFamille: string,
  sharedInput?: SharedFamilyData
): Promise<FamilyTableData> {
  const shared = sharedInput ?? (await loadSharedFamilyData());
  const commandColumns = buildAllActiveCommandColumns(shared.commandesColonnes);

  async function stockFor(articles: { id: number | null; nom_article: string | null }[]) {
    return shared.lotsByArticleId
      ? computeStocksForArticles(articles, shared.lotsByArticleId)
      : await fetchArticleStocksFromStockPage(articles);
  }

  if (selectedFamille === "White Secret") {
    const whiteSecretArticles = shared.articles
      .filter((row) => gammeMatchesIlikePattern(row.gamme, "%White Secret%"))
      // Le vrac (matiere non conditionnee) ne se commande jamais - meme
      // regle que le tableau de dispatch camion des autres gammes.
      .filter((row) => row.nature !== "vrac");

    const whiteSecretQuantitiesByArticle = new Map<string, Map<string, number>>();

    for (const commande of shared.commandesAvecLignes) {
      const lignes = (commande.commande_lignes ?? []).filter((ligne) => {
        const relation = ligne.articles;
        const article = Array.isArray(relation) ? relation[0] : relation;
        return String(article?.gamme || "")
          .toLowerCase()
          .includes("white secret");
      });

      if (lignes.length === 0) continue;

      const key = buildCommandeKey(commande);

      // Chaque camion du meme proforma est une ligne "commandes" separee -
      // il faut additionner la quantite de TOUS les camions, pas seulement
      // du premier rencontre.
      for (const ligne of lignes) {
        const relation = ligne.articles;
        const article = Array.isArray(relation) ? relation[0] : relation;
        const articleName = String(article?.nom_article || "").trim();
        const articleKey = normalizeArticle(articleName);
        if (!articleName || !articleKey) continue;

        const rowMap = whiteSecretQuantitiesByArticle.get(articleKey) ?? new Map<string, number>();
        rowMap.set(key, Number(rowMap.get(key) ?? 0) + Number(ligne.quantite_demandee ?? 0));
        whiteSecretQuantitiesByArticle.set(articleKey, rowMap);
      }
    }

    const whiteSecretBodyRows = [
      ...[
        ...new Set(
          whiteSecretArticles
            .map((row) => String(row.nom_article || "").replace(/ /g, "").trim())
            .filter((value) => value.length > 0 && /[A-Za-z0-9]/.test(value))
        ),
      ].sort((a, b) => {
        const rankDiff = getWhiteSecretArticleRank(a) - getWhiteSecretArticleRank(b);
        if (rankDiff !== 0) return rankDiff;

        const contenanceDiff = getWhiteSecretContenance(b) - getWhiteSecretContenance(a);
        if (contenanceDiff !== 0) return contenanceDiff;

        return a.localeCompare(b, "fr", { sensitivity: "base" });
      }),
      "BL TRANSFORME",
      "PRODUCTION EN COURS",
      "STAND(faire les articles commun)",
    ];

    return {
      articleRows: whiteSecretBodyRows,
      commandColumns,
      quantitiesByArticle: whiteSecretQuantitiesByArticle,
      stockByArticle: await stockFor(whiteSecretArticles),
      qtEnCoursByArticleKey: shared.qtEnCoursByArticleKey,
      subGammeByArticleKey: undefined,
    };
  }

  // Famille generique (ni White Secret, ni vide).
  const pattern = ilikePatternForFamily(selectedFamille);
  const genericFamilyArticles = shared.articles
    .filter((row) => gammeMatchesIlikePattern(row.gamme, pattern))
    .filter((row) =>
      matchesFamilyGamme(String(row.gamme || ""), String(row.nom_article || ""), selectedFamille)
    )
    // Le vrac (matiere non conditionnee) n'a pas sa place dans le tableau
    // de dispatch camion - seuls les articles finis/emballes s'y
    // commandent et s'y chargent.
    .filter((row) => row.nature !== "vrac");

  const genericFamilyQuantitiesByArticle = new Map<string, Map<string, number>>();

  for (const commande of shared.commandesAvecLignes) {
    const key = buildCommandeKey(commande);
    const lignes = (commande.commande_lignes ?? []).filter((ligne) => {
      const relation = ligne.articles;
      const article = Array.isArray(relation) ? relation[0] : relation;

      return matchesFamilyGamme(
        String(article?.gamme || ""),
        String(article?.nom_article || ""),
        selectedFamille
      );
    });

    if (lignes.length === 0) continue;

    for (const ligne of lignes) {
      const relation = ligne.articles;
      const article = Array.isArray(relation) ? relation[0] : relation;
      const articleName = String(article?.nom_article || "").trim();
      const articleKey = normalizeArticle(articleName);
      if (!articleKey) continue;

      const rowMap = genericFamilyQuantitiesByArticle.get(articleKey) ?? new Map<string, number>();
      rowMap.set(key, Number(rowMap.get(key) ?? 0) + Number(ligne.quantite_demandee ?? 0));
      genericFamilyQuantitiesByArticle.set(articleKey, rowMap);
    }
  }

  // For parent-family buttons that cover several real gammes (see
  // FAMILY_SUBGAMMES), remember which sub-gamme each article belongs to so
  // the table can show a colored banner between groups.
  const genericFamilySubGammeByArticleKey = new Map<string, SubGammeInfo>();

  if (TYPE_GROUPED_FAMILIES.has(selectedFamille)) {
    for (const row of genericFamilyArticles) {
      const articleName = String(row.nom_article || "").replace(/ /g, "").trim();
      const typeLabel = getArticleTypeLabel(articleName);
      if (!typeLabel) continue;

      const articleKey = normalizeArticle(articleName);
      if (articleKey) {
        genericFamilySubGammeByArticleKey.set(articleKey, {
          label: typeLabel,
          bannerClass: TYPE_GROUP_BANNER_CLASS,
        });
      }
    }
  } else if (FAMILY_SUBGAMMES[selectedFamille]) {
    for (const row of genericFamilyArticles) {
      const subGamme = getFamilySubGamme(selectedFamille, String(row.gamme || ""));
      if (!subGamme) continue;

      const articleKey = normalizeArticle(String(row.nom_article || "").replace(/ /g, "").trim());
      if (articleKey) {
        genericFamilySubGammeByArticleKey.set(articleKey, subGamme);
      }
    }
  }

  const genericFamilyArticleRows = [
    ...new Set(
      genericFamilyArticles
        .map((row) => String(row.nom_article || "").replace(/ /g, "").trim())
        .filter((value) => value.length > 0 && /[A-Za-z0-9]/.test(value))
    ),
  ].sort((a, b) => {
    const subGammeOrder = FAMILY_SUBGAMMES[selectedFamille];
    if (subGammeOrder) {
      const labelA = genericFamilySubGammeByArticleKey.get(normalizeArticle(a))?.label;
      const labelB = genericFamilySubGammeByArticleKey.get(normalizeArticle(b))?.label;
      const indexA = labelA ? subGammeOrder.findIndex((entry) => entry.label === labelA) : 99;
      const indexB = labelB ? subGammeOrder.findIndex((entry) => entry.label === labelB) : 99;
      if (indexA !== indexB) return indexA - indexB;
    }

    const rankDiff = getWhiteSecretArticleRank(a) - getWhiteSecretArticleRank(b);
    if (rankDiff !== 0) return rankDiff;

    const contenanceDiff = getWhiteSecretContenance(b) - getWhiteSecretContenance(a);
    if (contenanceDiff !== 0) return contenanceDiff;

    return a.localeCompare(b, "fr", { sensitivity: "base" });
  });

  return {
    articleRows: genericFamilyArticleRows,
    commandColumns,
    quantitiesByArticle: genericFamilyQuantitiesByArticle,
    stockByArticle: await stockFor(genericFamilyArticles),
    qtEnCoursByArticleKey: shared.qtEnCoursByArticleKey,
    subGammeByArticleKey: genericFamilySubGammeByArticleKey,
  };
}

// ---------------------------------------------------------------------------
// Lignes du tableau + lignes d'export Excel (memes donnees, memes formules que
// l'ecran) - partage entre le rendu d'une famille et l'export de toutes.
// ---------------------------------------------------------------------------

export function buildFamilyView(
  articleRows: string[],
  commandColumns: CommandColumn[],
  quantitiesByArticle: Map<string, Map<string, number>>,
  stockByArticle: Map<string, number>,
  qtEnCoursConditionnementByArticleKey: Map<string, number>,
  subGammeByArticleKey: Map<string, SubGammeInfo> | undefined,
  hideStand: boolean,
  onlyNegatif: boolean
) {
  const visibleCommandColumns = commandColumns.filter(
    (column) => !hideStand || String(column.statut || "").toUpperCase() !== "STAND"
  );

  // RESTE une fois la quantite deja en cours de Conditionnement ajoutee -
  // demande explicite : le manque "brut" (stock - commande) peut deja etre
  // couvert par ce qui est en train d'etre conditionne, donc le vrai manque
  // restant est reste + qtEnCours. Negatif = toujours manquant malgre ce qui
  // arrive, positif = couvert.
  function resteApresConditionnementFor(article: string) {
    const articleKey = normalizeArticle(article);
    const articleQuantities = quantitiesByArticle.get(articleKey);
    const total = visibleCommandColumns.reduce(
      (sum, column) => sum + Number(articleQuantities?.get(column.key) ?? 0),
      0
    );
    const stock = Number(stockByArticle.get(articleKey) ?? 0);
    const reste = stock - total;
    const qtEnCours = Number(qtEnCoursConditionnementByArticleKey.get(articleKey) ?? 0);
    return reste + qtEnCours;
  }

  // Bouton "Voir seulement les manques" filtre AVANT de calculer les
  // bandeaux de sous-gamme, pour que "different du precedent" se base sur la
  // sequence reellement affichee (sinon un bandeau pouvait se repeter ou
  // manquer une fois des articles retires par le filtre).
  const filteredArticleRows = onlyNegatif
    ? articleRows.filter((article) => resteApresConditionnementFor(article) < 0)
    : articleRows;

  const rowsWithSubGamme = filteredArticleRows.map((article, index) => {
    const articleKey = normalizeArticle(article);
    const subGamme = subGammeByArticleKey?.get(articleKey) ?? null;
    const previousArticleKey = index > 0 ? normalizeArticle(filteredArticleRows[index - 1]) : null;
    const previousSubGamme =
      previousArticleKey !== null ? subGammeByArticleKey?.get(previousArticleKey) ?? null : null;
    const showSubGammeBanner = subGamme !== null && subGamme.label !== previousSubGamme?.label;

    return { article, subGamme, showSubGammeBanner };
  });

  // Meme donnees, meme formules que le rendu ecran juste en dessous - juste
  // aplaties en objets simples pour l'export Excel (bouton place dans
  // l'en-tete de la page).
  const exportCommandColumns: ExportCommandColumn[] = visibleCommandColumns.map((column) => ({
    key: column.key,
    client: column.client,
    nombreCamion: column.nombre_camion,
    numeroProforma: column.numero_proforma,
    dateEcriture: column.date_ecriture,
    statut: getStatusLabel(column.statut),
  }));

  const exportRows: ExportDataRow[] = rowsWithSubGamme.flatMap(({ article, subGamme, showSubGammeBanner }) => {
    const articleKey = normalizeArticle(article);
    const articleQuantities = quantitiesByArticle.get(articleKey);
    const total = visibleCommandColumns.reduce(
      (sum, column) => sum + Number(articleQuantities?.get(column.key) ?? 0),
      0
    );
    const stock = Number(stockByArticle.get(articleKey) ?? 0);
    const reste = stock - total;
    const qtEnCours = Number(qtEnCoursConditionnementByArticleKey.get(articleKey) ?? 0);

    const quantitiesByColumn: Record<string, number> = {};
    for (const column of visibleCommandColumns) {
      quantitiesByColumn[column.key] = Number(articleQuantities?.get(column.key) ?? 0);
    }

    const rows: ExportDataRow[] = [];
    if (showSubGammeBanner && subGamme) {
      rows.push({ kind: "banner", label: subGamme.label });
    }
    rows.push({
      kind: "article",
      article,
      quantitiesByColumn,
      total,
      stock,
      reste,
      qtEnCours,
      resteApresConditionnement: reste + qtEnCours,
    });
    return rows;
  });

  return { visibleCommandColumns, rowsWithSubGamme, exportCommandColumns, exportRows };
}

// Une feuille Excel par famille, dans l'ordre des boutons du Tableau de
// commande. Les familles sans aucun article sont ignorees.
export type FamilySheet = {
  title: string;
  commandColumns: ExportCommandColumn[];
  rows: ExportDataRow[];
};

export async function buildAllFamiliesSheets(): Promise<FamilySheet[]> {
  const families = [...FAMILY_ORDER, ...(await fetchDynamicFamilies())];
  const shared = await loadSharedFamilyData({ withLots: true });

  if (shared.error) {
    throw new Error("Lecture impossible : " + shared.error);
  }

  const sheets: FamilySheet[] = [];

  for (const family of families) {
    if (EMPTY_TABLE_FAMILIES.has(family)) continue;

    const data = await loadFamilyTableData(family, shared);
    if (data.articleRows.length === 0) continue;

    const { exportCommandColumns, exportRows } = buildFamilyView(
      data.articleRows,
      data.commandColumns,
      data.quantitiesByArticle,
      data.stockByArticle,
      data.qtEnCoursByArticleKey,
      data.subGammeByArticleKey,
      false,
      false
    );

    // Quantites a 0 retirees : l'export ecrit une cellule vide pour 0 comme
    // pour une quantite absente, et cela allege beaucoup le transfert
    // (34 colonnes de commandes x plusieurs centaines d'articles).
    const rowsLegeres = exportRows.map((row) => {
      if (row.kind !== "article") return row;
      const quantitiesByColumn: Record<string, number> = {};
      for (const [key, value] of Object.entries(row.quantitiesByColumn)) {
        if (value) quantitiesByColumn[key] = value;
      }
      return { ...row, quantitiesByColumn };
    });

    sheets.push({ title: family, commandColumns: exportCommandColumns, rows: rowsLegeres });
  }

  return sheets;
}
