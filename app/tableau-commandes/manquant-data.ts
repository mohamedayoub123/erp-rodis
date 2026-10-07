import { supabaseServer } from "@/lib/supabase-server";
import { FAMILY_ORDER, fetchDynamicFamilies, resolveFamilyForGamme } from "./family-lib";
import {
  buildCommandeKey,
  fetchArticleStocksFromStockPage,
  fetchQtEnCoursConditionnementByArticle,
  getStatusLabel,
  getWhiteSecretArticleRank,
  getWhiteSecretContenance,
  normalizeArticle,
  type CommandColumn,
} from "./family-data";
import type { ExportCommandColumn, ExportDataRow } from "./tableau-export-button";

// Calcul de la vue "Article manquant" du Tableau de commande (toutes les commandes non livrees, tous les
// articles de chaque famille, avec stock et quantites par commande). Sorti de page.tsx pour etre reutilise
// par l'export Excel "Toutes les familles" (feuille Article manquant) - meme resultat que l'ecran.
export type ManquantFamilySection = {
  family: string;
  rows: {
    article: string;
    quantitiesByCommand: Map<string, number>;
    totalCommande: number;
    stock: number;
    reste: number;
  }[];
};

async function fetchAllArticlesForMissingReport() {
  const rows: { id: number; nom_article: string | null; gamme: string | null; nature: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les articles au-dela du 1000e
  // etaient absents du rapport "Article manquant".
  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme, nature")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk =
      (data as { id: number; nom_article: string | null; gamme: string | null; nature: string | null }[] | null) ??
      [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  // Le vrac (matiere non conditionnee) ne se commande jamais - meme regle
  // que le tableau de dispatch camion (genericFamilyArticles plus bas), sans
  // quoi il apparaissait a tort comme un article "manquant" alors qu'il
  // n'est jamais livre a un client.
  return rows.filter((row) => row.nature !== "vrac");
}

// Feuille Excel "Article manquant" de l'export "Toutes les familles" : meme contenu que la vue "Article
// manquant" de l'ecran (toutes les familles, commandes Stand incluses) = les articles dont le stock ne
// couvre pas les commandes (stock - total des commandes < 0), regroupes par famille. Meme mise en forme
// que les feuilles par famille (voir tableau-export-button.tsx). null si aucun article n'est en manque.
export async function buildManquantSheet(): Promise<{
  title: string;
  commandColumns: ExportCommandColumn[];
  rows: ExportDataRow[];
} | null> {
  const families = [...FAMILY_ORDER, ...(await fetchDynamicFamilies())];
  const { sharedCommandColumns, sections, qtEnCoursConditionnementByArticle } = await loadManquantData(
    families,
    ""
  );

  const commandColumns: ExportCommandColumn[] = sharedCommandColumns.map((column) => ({
    key: column.key,
    client: column.client,
    nombreCamion: column.nombre_camion,
    numeroProforma: column.numero_proforma,
    dateEcriture: column.date_ecriture,
    statut: getStatusLabel(column.statut),
    statutCode: String(column.statut || ""),
    note: column.note,
  }));

  const rows: ExportDataRow[] = [];
  for (const { family, rows: articleRows } of sections) {
    const manquants = articleRows.filter((row) => row.reste < 0);
    if (manquants.length === 0) continue;

    rows.push({ kind: "banner", label: family });
    for (const row of manquants) {
      // Quantites a 0 retirees : l'export ecrit une cellule vide, comme pour les feuilles par famille.
      const quantitiesByColumn: Record<string, number> = {};
      for (const column of sharedCommandColumns) {
        const quantite = Number(row.quantitiesByCommand.get(column.key) ?? 0);
        if (quantite) quantitiesByColumn[column.key] = quantite;
      }
      const qtEnCours = Number(qtEnCoursConditionnementByArticle.get(normalizeArticle(row.article)) ?? 0);
      rows.push({
        kind: "article",
        article: row.article,
        quantitiesByColumn,
        total: row.totalCommande,
        stock: row.stock,
        reste: row.reste,
        qtEnCours,
        resteApresConditionnement: row.reste + qtEnCours,
      });
    }
  }

  return rows.length > 0 ? { title: "Article manquant", commandColumns, rows } : null;
}

export async function loadManquantData(families: string[], selectedFamille: string) {
  const targetFamilies = selectedFamille ? [selectedFamille] : families;


  // Some family names are substrings of another (e.g. "BB Clear" is
  // contained in "BB Clear VIT C"), so a plain substring match would put
  // an article in both. Always resolve to the most specific (longest)
  // matching family name out of the full family list, regardless of
  // which family is currently being viewed.
  // Memoized: this gets called once per commande line, but the same raw
  // gamme string repeats across many lines/commandes, and each lookup
  // scans every family - caching by gamme avoids redoing that scan.
  const resolveFamilyForGammeCache = new Map<string, string | null>();
  function resolveFamilyForGammeCached(gamme: string, nomArticle: string) {
    const cacheKey = `${gamme}|||${nomArticle}`;
    const cached = resolveFamilyForGammeCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const best = resolveFamilyForGamme(gamme, nomArticle, families);
    resolveFamilyForGammeCache.set(cacheKey, best);
    return best;
  }

  // Self-contained: does not need famille_besoins / planning data at all,
  // so this view skips the queries the per-gamme tabs below need. Fetched
  // together with "Qt en cours" (independent of one another, previously
  // awaited sequentially before this block) - saves one full network
  // round trip on this view.
  const [missingArticlesRaw, { data: missingCommandesRaw }, qtEnCoursConditionnementByArticle] =
    await Promise.all([
      fetchAllArticlesForMissingReport(),
      supabaseServer
        .from("commandes")
        .select(
          "id, client, statut, mode_chargement, type_tc, numero_proforma, note_tableau_commande, created_at, commande_lignes(quantite_demandee, articles(nom_article, gamme))"
        )
        .neq("statut", "LIVREE")
        .order("created_at", { ascending: true }),
      fetchQtEnCoursConditionnementByArticle(),
    ]);

  const missingArticlesData =
    (missingArticlesRaw as
      | { id: number; nom_article: string | null; gamme: string | null }[]
      | null) ?? [];
  const missingCommandesData =
    (missingCommandesRaw as
      | {
          id: number;
          client: string | null;
          statut: string | null;
          mode_chargement: string | null;
          type_tc: string | null;
          numero_proforma: string | null;
          note_tableau_commande: string | null;
          created_at: string | null;
          commande_lignes:
            | {
                quantite_demandee: number | null;
                articles:
                  | { nom_article: string | null; gamme: string | null }
                  | { nom_article: string | null; gamme: string | null }[]
                  | null;
              }[]
            | null;
        }[]
      | null) ?? [];

  // Un camion = une ligne "commandes" separee partageant la meme cle
  // (proforma de base). Le nombre de camions affiche est donc le nombre
  // de lignes du groupe ; pour les commandes importees d'Excel en une
  // seule ligne, on retombe sur son propre type_tc (qui stocke le nombre
  // de camions, malgre son nom).
  const commandeCountByKey = new Map<string, number>();
  for (const commande of missingCommandesData) {
    const key = buildCommandeKey(commande);
    commandeCountByKey.set(key, (commandeCountByKey.get(key) ?? 0) + 1);
  }

  const sharedCommandColumnsMap = new Map<string, CommandColumn>();
  for (const commande of missingCommandesData) {
    const key = buildCommandeKey(commande);
    if (sharedCommandColumnsMap.has(key)) continue;
    const groupSize = commandeCountByKey.get(key) ?? 1;
    sharedCommandColumnsMap.set(key, {
      key,
      id: commande.id,
      client: String(commande.client || "").trim(),
      nombre_camion: groupSize > 1 ? groupSize : Number(commande.type_tc) || 1,
      mode_chargement: String(commande.mode_chargement || "").trim(),
      type_tc: String(commande.type_tc || "").trim(),
      numero_proforma: String(commande.numero_proforma || "").trim(),
      statut: String(commande.statut || "EN_COURS").trim(),
      date_ecriture: commande.created_at,
      note: String(commande.note_tableau_commande || ""),
    });
  }
  const sharedCommandColumns = [...sharedCommandColumnsMap.values()];

  const familyArticlesByFamily = new Map<
    string,
    { id: number; nom_article: string | null }[]
  >();
  const unionArticlesById = new Map<number, { id: number; nom_article: string | null }>();

  for (const family of targetFamilies) {
    const familyArticles = missingArticlesData.filter(
      (row) =>
        resolveFamilyForGammeCached(String(row.gamme || ""), String(row.nom_article || "")) === family
    );
    familyArticlesByFamily.set(family, familyArticles);
    for (const article of familyArticles) {
      unionArticlesById.set(article.id, article);
    }
  }

  const stockByArticleName = await fetchArticleStocksFromStockPage([
    ...unionArticlesById.values(),
  ]);

  // Single pass over every commande line, resolving its family once
  // (instead of once per family - that was O(families x commandes x
  // lignes) and was the main reason this view was slow to load).
  const quantitiesByArticlePerFamily = new Map<string, Map<string, number>>();
  const quantitiesByCommandByArticlePerFamily = new Map<string, Map<string, Map<string, number>>>();

  for (const commande of missingCommandesData) {
    const commandKey = buildCommandeKey(commande);

    for (const ligne of commande.commande_lignes ?? []) {
      const relation = ligne.articles;
      const article = Array.isArray(relation) ? relation[0] : relation;
      const family = resolveFamilyForGammeCached(
        String(article?.gamme || ""),
        String(article?.nom_article || "")
      );
      if (!family) continue;

      const articleKey = normalizeArticle(String(article?.nom_article || ""));
      if (!articleKey) continue;

      const quantitiesByArticle =
        quantitiesByArticlePerFamily.get(family) ?? new Map<string, number>();
      quantitiesByArticle.set(
        articleKey,
        Number(quantitiesByArticle.get(articleKey) ?? 0) + Number(ligne.quantite_demandee ?? 0)
      );
      quantitiesByArticlePerFamily.set(family, quantitiesByArticle);

      const quantitiesByCommandByArticle =
        quantitiesByCommandByArticlePerFamily.get(family) ?? new Map<string, Map<string, number>>();
      const rowMap = quantitiesByCommandByArticle.get(articleKey) ?? new Map<string, number>();
      rowMap.set(
        commandKey,
        Number(rowMap.get(commandKey) ?? 0) + Number(ligne.quantite_demandee ?? 0)
      );
      quantitiesByCommandByArticle.set(articleKey, rowMap);
      quantitiesByCommandByArticlePerFamily.set(family, quantitiesByCommandByArticle);
    }
  }

  const sections: ManquantFamilySection[] = [];

  for (const family of targetFamilies) {
    const familyArticles = familyArticlesByFamily.get(family) ?? [];
    if (familyArticles.length === 0) continue;

    const quantitiesByArticle = quantitiesByArticlePerFamily.get(family) ?? new Map<string, number>();
    const quantitiesByCommandByArticle =
      quantitiesByCommandByArticlePerFamily.get(family) ?? new Map<string, Map<string, number>>();

    // Every article of the gamme, same ordering as the per-gamme tables:
    // type rank (Lait/Creme/DSR/Huile/Serum/Savon/Gel douche), then
    // largest to smallest contenance, S-H articles pushed last.
    const articleNames = [
      ...new Set(
        familyArticles
          .map((row) => String(row.nom_article || "").replace(/\u00a0/g, "").trim())
          .filter((value) => value.length > 0 && /[A-Za-z0-9]/.test(value))
      ),
    ].sort((a, b) => {
      const rankDiff = getWhiteSecretArticleRank(a) - getWhiteSecretArticleRank(b);
      if (rankDiff !== 0) return rankDiff;

      const contenanceDiff = getWhiteSecretContenance(b) - getWhiteSecretContenance(a);
      if (contenanceDiff !== 0) return contenanceDiff;

      return a.localeCompare(b, "fr", { sensitivity: "base" });
    });

    const rows = articleNames.map((articleName) => {
      const articleKey = normalizeArticle(articleName);
      const totalCommande = Number(quantitiesByArticle.get(articleKey) ?? 0);
      const stock = Number(stockByArticleName.get(articleKey) ?? 0);
      const reste = stock - totalCommande;

      return {
        article: articleName,
        quantitiesByCommand: quantitiesByCommandByArticle.get(articleKey) ?? new Map<string, number>(),
        totalCommande,
        stock,
        reste,
      };
    });

    // On garde toutes les lignes (pas seulement reste < 0) car le bouton
    // "Supprimer stand" recalcule total/reste cote render en excluant les
    // commandes Stand - une ligne qui n'est en manque qu'a cause du Stand
    // doit pouvoir disparaitre de la liste une fois le Stand exclu.
    if (rows.length > 0) {
      sections.push({ family, rows });
    }
  }

  return { sharedCommandColumns, sections, qtEnCoursConditionnementByArticle };
}
