import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchRestantConditionnementEmballageByArticle } from "../production/suivi/data";

type SearchParams = Promise<{
  famille?: string;
  hideStand?: string;
  vue?: string;
}>;

type PlanningRow = {
  famille: string | null;
  articleId: number | null;
  client: string | null;
  nombre_camion: number | null;
  mode_chargement: string | null;
  type_tc: string | null;
  numero_proforma: string | null;
  article: string;
  quantite_prevue: number | null;
};

type CommandColumn = {
  key: string;
  client: string;
  nombre_camion: number | null;
  mode_chargement: string;
  type_tc: string;
  numero_proforma: string;
  statut: string;
};

type WhiteSecretArticleRow = {
  id: number;
  nom_article: string | null;
  gamme: string | null;
};

const FAMILY_ORDER = [
  "White Secret",
  "Precious Perfect",
  "Perfect Glow",
  "BB Clear",
  "BB Clear VIT C",
  "Elixir",
  "Pro White",
  "Luxury Cocoa",
  "Luxury Avocado",
  "Egyptian Beauty",
  "MOROCCO SKIN",
  "ABSOLUTE CARE REALITY",
  "REAL CARE R",
  "TONE THERAPY R",
  "MY FAMILY CARE",
  "DERMATONE",
  "Coco Clear",
  "Cocoa Skin",
  "ECO+OFA+CDV+SKL",
  "SOOPURE",
  "EDT RODIS",
  "EDT REALITY",
  "MENTHOLE ETDIVERS",
];

const EMPTY_TABLE_FAMILIES = new Set<string>([]);

const FAMILY_BUTTON_STYLES: Record<string, string> = {
  "White Secret": "bg-[#ff1f1f] text-white",
  "Precious Perfect": "bg-[#7f57c2] text-white",
  "Perfect Glow": "bg-[#e0a85d] text-white",
  "BB Clear": "bg-[#0dbb62] text-white",
  "BB Clear VIT C": "bg-[#f3c74c] text-white",
  Elixir: "bg-[#bf4fc9] text-white",
  "Pro White": "bg-[#fff137] text-white",
  "Luxury Cocoa": "bg-[#b78b22] text-white",
  "Luxury Avocado": "bg-[#8bc34a] text-white",
  "Egyptian Beauty": "bg-[#4f78a8] text-white",
  "MOROCCO SKIN": "bg-[#ffc31a] text-white",
  "ABSOLUTE CARE REALITY": "bg-[#171717] text-white",
  "REAL CARE R": "bg-[#f0f0f0] text-white",
  "TONE THERAPY R": "bg-[#f7ed65] text-white",
  "MY FAMILY CARE": "bg-[#6654b8] text-white",
  DERMATONE: "bg-[#d94faf] text-white",
  "Coco Clear": "bg-[#c8ecea] text-white",
  "Cocoa Skin": "bg-[#bfd9a6] text-white",
  "ECO+OFA+CDV+SKL": "bg-[#4f4f4f] text-white",
  SOOPURE: "bg-[#5b5b5b] text-white",
  "EDT RODIS": "bg-[#4f6174] text-white",
  "EDT REALITY": "bg-[#72839a] text-white",
  "MENTHOLE ETDIVERS": "bg-[#d9d9d9] text-white",
};

const WHITE_SECRET_TURQUOISE = "bg-[#1f9da5]";

// Parent family buttons that actually cover several distinct real gamme
// values - each sub-entry gets its own colored banner row inside that
// family's table, in this order.
const FAMILY_SUBGAMMES: Record<string, { label: string; match: string; bannerClass: string }[]> = {
  "ABSOLUTE CARE REALITY": [
    { label: "WATER LILIES", match: "absolute care water lilies", bannerClass: "bg-[#1a56db] text-white" },
    { label: "ALOE VERA", match: "absolute care aloe vera", bannerClass: "bg-[#6aa84f] text-white" },
    { label: "FRESH LIME", match: "fresh lime", bannerClass: "bg-[#ffd400] text-slate-950" },
    { label: "PAPAYE", match: "absolute care papaya", bannerClass: "bg-[#e63946] text-white" },
  ],
  "REAL CARE R": [
    { label: "REAL CARE FAMILY", match: "real care family", bannerClass: "bg-[#1a56db] text-white" },
    { label: "REAL CARE MEN", match: "real care men", bannerClass: "bg-[#f5a623] text-white" },
    { label: "REAL CARE BABY", match: "real care baby", bannerClass: "bg-[#d6f5f5] text-slate-950" },
  ],
  "TONE THERAPY R": [
    { label: "TONE THERAPY INTENSE", match: "tone therapy intense", bannerClass: "bg-[#8c8c8c] text-white" },
    { label: "TONE THERAPY ADVANCED", match: "tone therapy advanced", bannerClass: "bg-[#e6e6e6] text-slate-700" },
  ],
  "MY FAMILY CARE": [
    { label: "FAMILY CARE ALMOND", match: "my family care almond", bannerClass: "bg-[#1a56db] text-white" },
    { label: "FAMILY CARE ALOE VERA", match: "my family care aloe vera", bannerClass: "bg-[#8bc34a] text-white" },
    { label: "FAMILY CARE LEMON", match: "my family care lemon", bannerClass: "bg-[#ffeb3b] text-slate-950" },
    { label: "FAMILY CARE POMEGRANATE", match: "my family care pomegranate", bannerClass: "bg-[#c76b1e] text-white" },
  ],
  "ECO+OFA+CDV+SKL": [
    { label: "SKIN LIGHT", match: "skin light", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "COEUR DE VASELINE", match: "c.d.v", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "ECO FAMILY", match: "eco family", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "ONE FOR ALL", match: "one for all", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "RAPIDE WHITE", match: "rapide white", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "VIT FEE", match: "vit fee", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "COCO BUTTEUR", match: "coco butteur", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "PINK LADIES", match: "pink ladies", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
  "EDT RODIS": [
    { label: "EDT 6SCENT", match: "6th scent", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "EDT PRETTY", match: "pretty", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "SWEET SCENT", match: "sweet scent", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "NUIT D'ORIENT", match: "nuit d", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "JANNA", match: "janna", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
  "EDT REALITY": [
    { label: "1001 NIGHTS", match: "1001 nights", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "ENCHANTED", match: "enchanted", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "GODDESS", match: "goddess", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "BOUQUET", match: "bouquet", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "ORIENTAL SCENT", match: "oriental scent", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "DEEM", match: "deem", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
  "MENTHOLE ETDIVERS": [
    { label: "MATRIX", match: "matrix", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "MENTHOL", match: "menthole", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "PARFUM", match: "parfum", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "MAMASSITA", match: "mamassita", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "AMALIA", match: "amalia", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "EFFICACITE", match: "efficacite", bannerClass: "bg-[#a6a6a6] text-white" },
    { label: "DR JOHNSON", match: "dr johnson", bannerClass: "bg-[#a6a6a6] text-white" },
  ],
};

function getFamilySubGamme(family: string, gamme: string) {
  const subGammes = FAMILY_SUBGAMMES[family];
  if (!subGammes) return null;

  const gammeLower = String(gamme || "").toLowerCase();
  return subGammes.find((entry) => gammeLower.includes(entry.match)) ?? null;
}

function familyHasSubGammeMatch(family: string, gamme: string) {
  const subGammes = FAMILY_SUBGAMMES[family];
  if (!subGammes) return false;

  const gammeLower = String(gamme || "").toLowerCase();
  return subGammes.some((entry) => gammeLower.includes(entry.match));
}

// Some families group their table by article TYPE (Lait, Gel, Pommade,
// EDC...) instead of by a brand/scent sub-gamme.
const TYPE_GROUPED_FAMILIES = new Set(["SOOPURE"]);
const TYPE_GROUP_BANNER_CLASS = "bg-[#a6a6a6] text-white";

function getArticleTypeLabel(article: string) {
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

const WHITE_SECRET_CLIENT_COLUMNS = [
  { client: "RODIS MALI", color: "bg-[#14989d] text-slate-950", stand: false },
  { client: "BAJEN SHEA BUTTER", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "HOME TECHNOLOGIE", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "AZA GLOBAL IMPEX", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "KONE GABON", color: "bg-[#12b44b] text-slate-950", stand: false },
  { client: "CAPTIN CAMEROUN", color: "bg-[#f6c32e] text-slate-950", stand: true },
  { client: "BAJEN SHEA BUTTER", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "NASS MAMEK ABA", color: "bg-[#12b44b] text-slate-950", stand: false },
  { client: "IPP SARL", color: "bg-[#12b44b] text-slate-950", stand: false },
  { client: "TAIF PARFUMERIE", color: "bg-[#12b44b] text-slate-950", stand: false },
  { client: "WABRO S", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "AL RACHID GENERAL BUSINESS", color: "bg-[#f6c32e] text-slate-950", stand: true },
  { client: "STRICKER JUBA", color: "bg-[#f6c32e] text-slate-950", stand: true },
  { client: "HOME TECHNOLOGIE", color: "bg-[#f6c32e] text-slate-950", stand: true },
  { client: "AMA TCHAD", color: "bg-[#f6c32e] text-slate-950", stand: false },
  { client: "SOCIETE PARAPHARM", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "MOHAMED SIMPARA MALI", color: "bg-[#ffe01b] text-slate-950", stand: false },
  { client: "RABS BURKINA", color: "bg-[#12b44b] text-slate-950", stand: false },
];

const WHITE_SECRET_EXTRA_EMPTY_COLUMNS = 12;

const WHITE_SECRET_SUMMARY_COLUMNS = [
  "TOTAL",
  "STOCK",
  "RESTE",
  "Qt en cours de Conditionnement",
  "STOCK ALERTE PROD",
  "PREVISION SERVICE COMERC",
  "stock moin de 4 mois",
  "stock moin de 2 mois",
];

// Index (dans WHITE_SECRET_SUMMARY_COLUMNS) a partir duquel les colonnes
// sont figees a droite (sticky) - seulement les colonnes reservees/pas
// encore utilisees, pas TOTAL/STOCK/RESTE/Qt en cours qui ont deja une
// vraie valeur calculee et doivent rester juste apres RESTE.
const WHITE_SECRET_STICKY_SUMMARY_INDEX = 4;

function normalizeArticle(value: string) {
  return (value || "").replace(/\u00a0/g, "").trim().toUpperCase();
}

function formatDateCell(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

type StockArticleSourceRow = {
  id?: number | null;
  article_id?: number | null;
  date_jour?: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
  articles?:
    | { nom_article: string | null; gamme?: string | null }
    | { nom_article: string | null; gamme?: string | null }[]
    | null;
};

type StockPageRawRow = {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  date_jour: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
};

function buildCurrentStockByArticle(
  rows: StockArticleSourceRow[],
  allowedArticleKeys?: Set<string>,
  articleNameById?: Map<number, string>
) {
  const currentByArticle = new Map<string, number>();

  for (const row of rows) {
    const articleId = Number(row.article_id ?? 0);
    const relation = row.articles;
    const article = Array.isArray(relation) ? relation[0] : relation;
    const articleName =
      (articleId && articleNameById?.get(articleId)) || String(article?.nom_article || "");
    const articleKey = normalizeArticle(articleName);

    if (!articleKey) continue;
    if (allowedArticleKeys && !allowedArticleKeys.has(articleKey)) continue;

    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    currentByArticle.set(
      articleKey,
      Number(currentByArticle.get(articleKey) ?? 0) + mouvement
    );
  }

  return currentByArticle;
}

async function fetchAllLotsStockForArticleIds(articleIds: number[]) {
  const validIds = [...new Set(articleIds.filter((value) => value > 0))];

  if (validIds.length === 0) {
    return [] as {
      article_id: number | null;
      qte_entree: number | null;
      qte_sortie: number | null;
    }[];
  }

  const rows: {
    article_id: number | null;
    qte_entree: number | null;
    qte_sortie: number | null;
  }[] = [];

  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select("article_id, qte_entree, qte_sortie")
      .in("article_id", validIds)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = data ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

function computeCurrentStockLikeStockPage(rows: StockPageRawRow[]) {
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

async function fetchArticleStocksFromStockPage(
  articleRows: { id: number | null; nom_article: string | null }[]
) {
  const normalizedTargets = [
    ...new Set(
      articleRows
        .map((row) => normalizeArticle(String(row.nom_article || "")))
        .filter((value) => value.length > 0)
    ),
  ];

  if (normalizedTargets.length === 0) {
    return new Map<string, number>();
  }

  const idsByArticleKey = new Map<string, number[]>();
  for (const row of articleRows) {
    const articleKey = normalizeArticle(String(row.nom_article || ""));
    const articleId = Number(row.id ?? 0);

    if (!articleKey || articleId <= 0) continue;

    const currentIds = idsByArticleKey.get(articleKey) ?? [];
    currentIds.push(articleId);
    idsByArticleKey.set(articleKey, currentIds);
  }

  const unionIds = [...new Set(
    [...idsByArticleKey.values()].flat().filter((value) => value > 0)
  )];

  if (unionIds.length === 0) {
    return new Map<string, number>(normalizedTargets.map((key) => [key, 0]));
  }

  const allLots: StockPageRawRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select("id, article_id, numero_lot, date_jour, qte_entree, qte_sortie")
      .in("article_id", unionIds)
      .order("date_jour", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = (data as StockPageRawRow[] | null) ?? [];
    allLots.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  // Group once by article_id instead of re-scanning the whole lots list per
  // article (that was O(articles x lots), very slow once there are a few
  // hundred distinct articles across all families).
  const lotsByArticleId = new Map<number, StockPageRawRow[]>();
  for (const row of allLots) {
    const articleId = Number(row.article_id ?? 0);
    if (!articleId) continue;
    const list = lotsByArticleId.get(articleId) ?? [];
    list.push(row);
    lotsByArticleId.set(articleId, list);
  }

  const stockByArticle = new Map<string, number>();

  for (const articleKey of normalizedTargets) {
    const ids = idsByArticleKey.get(articleKey) ?? [];
    const relevantRows = ids.flatMap((id) => lotsByArticleId.get(id) ?? []);
    stockByArticle.set(articleKey, computeCurrentStockLikeStockPage(relevantRows));
  }

  return stockByArticle;
}

function formatTruckCount(value: number | null) {
  if (value === null || Number.isNaN(Number(value))) return "";
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : String(num).replace(".", ",");
}

function buildPlanningCommandKey(row: {
  client: string | null;
  nombre_camion: number | null;
  mode_chargement: string | null;
  numero_proforma: string | null;
}) {
  const numero = String(row.numero_proforma || "").trim();
  if (numero) return `proforma::${numero}`;

  return [
    String(row.client || "").trim(),
    String(row.nombre_camion ?? ""),
    String(row.mode_chargement || "").trim(),
    numero,
  ].join("||");
}

// Une commande sur plusieurs camions cree une ligne "commandes" separee par
// camion (proforma suffixe "-2", "-3", ...) mais reste UNE seule commande
// pour l'affichage : on regroupe donc par proforma de base pour ne pas
// l'ecrire plusieurs fois dans le tableau (les quantites de chaque camion
// s'additionnent naturellement puisqu'elles partagent la meme cle).
function getBaseProforma(numeroProforma: string) {
  return numeroProforma.replace(/-\d+$/, "");
}

function buildCommandeKey(row: {
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

function getStatusLabel(statusValue: string | null | undefined) {
  const status = String(statusValue || "").toUpperCase();
  if (status === "STAND") return "STAND";
  if (status === "BL_TRANSFORME") return "BL TRANSFORME";
  return "EN COURS";
}

function getStatusCellClass(statusValue: string | null | undefined) {
  const status = String(statusValue || "").toUpperCase();
  if (status === "STAND") return "bg-[#f59e0b] text-slate-950";
  if (status === "BL_TRANSFORME") return "bg-[#16a34a] text-slate-950";
  return "bg-[#fff200] text-slate-900";
}

type ManquantFamilySection = {
  family: string;
  rows: {
    article: string;
    quantitiesByCommand: Map<string, number>;
    totalCommande: number;
    stock: number;
    reste: number;
  }[];
};

function renderArticleManquantInsideTableau(
  families: string[],
  availableFamilies: string[],
  selectedFamille: string,
  commandColumns: CommandColumn[],
  sections: ManquantFamilySection[],
  qtEnCoursConditionnementByArticleKey: Map<string, number>,
  hideStand: boolean = false
) {
  const visibleCommandColumns = commandColumns.filter(
    (column) => !hideStand || String(column.statut || "").toUpperCase() !== "STAND"
  );

  // Total/reste recalcule en excluant les commandes Stand quand le bouton
  // "Supprimer stand" est actif - une ligne qui n'est en manque qu'a cause
  // du Stand ne doit plus apparaitre du tout dans la liste.
  const visibleSections = sections
    .map(({ family, rows }) => ({
      family,
      rows: rows
        .map((row) => {
          const totalCommande = visibleCommandColumns.reduce(
            (sum, column) => sum + Number(row.quantitiesByCommand.get(column.key) ?? 0),
            0
          );
          return { ...row, totalCommande, reste: row.stock - totalCommande };
        })
        .filter((row) => row.reste < 0),
    }))
    .filter((section) => section.rows.length > 0);

  const familiesEnManque = visibleSections.length;
  const articlesEnManque = visibleSections.reduce((sum, section) => sum + section.rows.length, 0);
  const totalManque = visibleSections.reduce(
    (sum, section) => sum + section.rows.reduce((rowSum, row) => rowSum + Math.abs(row.reste), 0),
    0
  );

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                ERP Rodis
              </p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight">Tableau de commande</h1>
              <p className="mt-2 text-sm text-slate-600">
                Recap de toutes les gammes avec tous les articles, reste negatif surligne en jaune.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/tableau-commandes"
                className="rounded-full border border-slate-200 px-4 py-2 text-[16px] font-medium text-slate-700"
              >
                Familles
              </Link>
              <Link
                href="/tableau-commandes?vue=manquant"
                className="rounded-full bg-red-700 px-4 py-2 text-[16px] font-medium text-white"
              >
                Article manquant
              </Link>
              <Link
                href="/commandes"
                className="rounded-full bg-slate-950 px-4 py-2 text-[16px] font-medium text-white"
              >
                Commandes
              </Link>
              <form action="/tableau-commandes">
                <input type="hidden" name="vue" value="manquant" />
                {selectedFamille ? <input type="hidden" name="famille" value={selectedFamille} /> : null}
                {hideStand ? null : <input type="hidden" name="hideStand" value="1" />}
                <button
                  type="submit"
                  className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[16px] font-medium text-amber-800"
                >
                  {hideStand ? "Afficher stand" : "Supprimer stand"}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-[16px] font-medium uppercase tracking-[0.24em] text-slate-500">Familles en manque</p>
            <p className="mt-2 text-3xl font-medium text-slate-950">{familiesEnManque}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-[16px] font-medium uppercase tracking-[0.24em] text-slate-500">Articles manquants</p>
            <p className="mt-2 text-3xl font-medium text-slate-950">{articlesEnManque}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <p className="text-[16px] font-medium uppercase tracking-[0.24em] text-slate-500">Total manque</p>
            <p className="mt-2 text-3xl font-medium text-red-700">{formatQuantity(totalManque)}</p>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/tableau-commandes?vue=manquant"
              className={
                selectedFamille
                  ? "rounded-xl bg-slate-100 px-4 py-2 text-[16px] font-medium leading-none text-slate-700 shadow-sm transition hover:scale-[1.02] hover:opacity-90"
                  : "rounded-xl bg-slate-950 px-4 py-2 text-[16px] font-medium leading-none text-white shadow-sm transition hover:scale-[1.02] hover:opacity-90"
              }
            >
              Tous
            </Link>
            {availableFamilies.map((family) => {
              const buttonStyle = FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";
              const active = family === selectedFamille;

              return (
                <Link
                  key={family}
                  href={`/tableau-commandes?vue=manquant&famille=${encodeURIComponent(family)}`}
                  className={`rounded-xl px-4 py-2 text-[16px] font-medium leading-none shadow-sm transition hover:scale-[1.02] hover:opacity-90 ${buttonStyle} ${active ? "ring-2 ring-slate-950/30" : ""}`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          {visibleSections.length === 0 ? (
            <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-6 text-center text-[16px] font-medium text-emerald-900">
              Aucun article manquant pour le filtre actuel.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[1.35rem] border border-slate-300 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="max-h-[75vh] overflow-auto">
                <table className="min-w-[1660px] w-full border-separate border-spacing-0 text-[16px]">
                  <colgroup>
                    <col style={{ width: "280px" }} />
                    {visibleCommandColumns.length > 0 ? (
                      visibleCommandColumns.map((column) => (
                        <col key={`manquant-col-${column.key}`} style={{ width: "52px" }} />
                      ))
                    ) : (
                      <col style={{ width: "120px" }} />
                    )}
                    <col style={{ width: "64px" }} />
                    <col style={{ width: "64px" }} />
                    <col style={{ width: "64px" }} />
                    <col style={{ width: "84px" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th rowSpan={3} className={`sticky top-0 left-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-left font-medium text-slate-950`}>
                        Article
                      </th>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`status-${column.key}`}
                          className={`sticky top-0 z-10 border border-slate-700 px-1 py-2 text-center text-[16px] font-medium uppercase leading-tight whitespace-normal break-words ${getStatusCellClass(column.statut)}`}
                        >
                          {getStatusLabel(column.statut)}
                        </th>
                      ))}
                      <th rowSpan={3} className={`sticky top-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase text-slate-950`}>
                        TOTAL
                      </th>
                      <th rowSpan={3} className={`sticky top-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase text-slate-950`}>
                        STOCK
                      </th>
                      <th rowSpan={3} className={`sticky top-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase text-slate-950`}>
                        RESTE
                      </th>
                      <th rowSpan={3} className={`sticky top-0 z-60 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium uppercase leading-tight text-slate-950`}>
                        Qt en cours de Conditionnement
                      </th>
                    </tr>
                    <tr>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`client-${column.key}`}
                          className={`sticky top-[75px] z-20 border border-slate-700 px-1 py-2 text-center text-[16px] font-medium uppercase leading-tight whitespace-normal break-words ${getStatusCellClass(column.statut)}`}
                        >
                          {column.client || "-"}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {visibleCommandColumns.map((column) => (
                        <th
                          key={`proforma-${column.key}`}
                          className={`sticky top-[150px] z-30 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-center text-[16px] font-medium leading-tight whitespace-normal break-words text-slate-950`}
                        >
                          {column.numero_proforma || "-"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSections.flatMap(({ family, rows }) => [
                      <tr key={`banner-${family}`}>
                        <td
                          colSpan={1 + visibleCommandColumns.length + 4}
                          className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-4 py-2 text-left text-lg font-medium text-slate-950`}
                        >
                          {family}
                        </td>
                      </tr>,
                      ...rows.map((row) => {
                        const { totalCommande, reste } = row;
                        const qtEnCoursConditionnement = Number(
                          qtEnCoursConditionnementByArticleKey.get(normalizeArticle(row.article)) ?? 0
                        );
                        const isGreenRow = row.article.toLowerCase().includes("bl transforme");
                        const articleCellClass =
                          reste < 0
                            ? "bg-[#fff59d] text-slate-950"
                            : row.article.toLowerCase().includes("stand") ||
                                row.article.toLowerCase().includes("production")
                              ? "bg-[#ffe01b] text-slate-950"
                              : isGreenRow
                                ? "bg-[#62ff1b] text-[#0d6b0d]"
                                : `${WHITE_SECRET_TURQUOISE} text-slate-950`;
                        const lineFillClass = reste < 0 ? "bg-[#fff59d] text-slate-950" : "bg-white";
                        const summaryFillClass =
                          reste < 0 ? "bg-[#fff59d] text-red-700" : `${WHITE_SECRET_TURQUOISE} text-slate-950`;

                        return (
                          <tr key={`${family}-${row.article}`}>
                            <td
                              className={`sticky left-0 z-20 border border-slate-300 px-2 py-1 text-left text-[16px] font-medium leading-tight whitespace-nowrap ${articleCellClass}`}
                            >
                              {row.article}
                            </td>
                            {visibleCommandColumns.map((column) => {
                              const qty = Number(row.quantitiesByCommand.get(column.key) ?? 0);
                              return (
                                <td
                                  key={`${family}-${row.article}-${column.key}`}
                                  className={`border border-slate-300 px-1 py-1 font-medium leading-tight whitespace-normal break-words ${lineFillClass}`}
                                >
                                  {qty > 0 ? formatQuantity(qty) : ""}
                                </td>
                              );
                            })}
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${summaryFillClass}`}>
                              {formatQuantity(totalCommande)}
                            </td>
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${summaryFillClass}`}>
                              {formatQuantity(row.stock)}
                            </td>
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${summaryFillClass}`}>
                              {formatQuantity(reste)}
                            </td>
                            <td className={`border border-slate-700 px-2 py-1 text-center font-medium ${summaryFillClass}`}>
                              {qtEnCoursConditionnement > 0 ? formatQuantity(qtEnCoursConditionnement) : ""}
                            </td>
                          </tr>
                        );
                      }),
                    ])}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function getWhiteSecretArticleRank(article: string) {
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

function getWhiteSecretContenance(article: string) {
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

function renderWhiteSecretEmptyTemplate(
  families: string[],
  selectedFamille: string,
  articleRows: string[],
  commandColumns: CommandColumn[],
  quantitiesByArticle: Map<string, Map<string, number>>,
  stockByArticle: Map<string, number>,
  qtEnCoursConditionnementByArticleKey: Map<string, number>,
  hideStand: boolean
) {
  const visibleCommandColumns = commandColumns.filter(
    (column) =>
      String(column.statut || "").toUpperCase() !== "LIVREE" &&
      (!hideStand || String(column.statut || "").toUpperCase() !== "STAND")
  );
  const whiteSecretDataColumns =
    visibleCommandColumns.length > 0
      ? visibleCommandColumns.map(() => ({
          kind: "client" as const,
          stand: false,
        }))
      : [
          {
            kind: "empty" as const,
            stand: false,
          },
        ];

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full space-y-4">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                ERP Rodis
              </p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight">{selectedFamille}</h1>
              <p className="mt-2 text-sm text-slate-600">
                Maquette vide du tableau. On remplira le contenu aprÃ¨s.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BackButton href="/tableau-commandes" label="Retour aux familles" />
              <RefreshButton />
              <form action="/tableau-commandes">
                <input type="hidden" name="famille" value={selectedFamille} />
                {hideStand ? null : <input type="hidden" name="hideStand" value="1" />}
                <button
                  type="submit"
                  className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[16px] font-medium text-amber-800"
                >
                  {hideStand ? "Afficher stand" : "Supprimer stand"}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-2">
            {families.map((family) => {
              const isActive = family === selectedFamille;
              const buttonStyle = FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";

              return (
                <Link
                  key={family}
                  href={`/tableau-commandes?famille=${encodeURIComponent(family)}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold leading-none shadow-sm transition hover:opacity-90 ${buttonStyle} ${
                    isActive ? "ring-2 ring-slate-950/30" : ""
                  }`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-slate-300 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-[2160px] w-full border-separate border-spacing-0 text-center text-[17px]">
              <colgroup>
                <col style={{ width: "280px" }} />
                {whiteSecretDataColumns.map((_, index) => (
                  <col key={`white-secret-col-${index}`} style={{ width: "44px" }} />
                ))}
                <col style={{ width: "64px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "84px" }} />
                <col style={{ width: "76px" }} />
                <col style={{ width: "76px" }} />
                <col style={{ width: "76px" }} />
                <col style={{ width: "76px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-50 border border-slate-700 bg-white px-3 py-2 text-left text-xl font-medium text-slate-900">
                    &nbsp;
                  </th>
                  <th
                    colSpan={whiteSecretDataColumns.length + WHITE_SECRET_SUMMARY_COLUMNS.length}
                    className={`sticky top-0 z-10 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-center text-lg font-medium text-slate-950`}
                  >
                    White Secret
                  </th>
                </tr>
                <tr>
                  <th className="sticky top-[90px] left-0 z-50 border border-slate-700 bg-[#62ff1b] px-2 py-1 text-center text-[16px] font-medium uppercase leading-4 text-[#0d6b0d]">
                    &nbsp;
                  </th>
                  {visibleCommandColumns.map((column, index) => {
                    const status = String(column.statut || "").toUpperCase();
                    const badgeClass =
                      status === "STAND"
                        ? "bg-[#f59e0b] text-slate-950"
                        : status === "BL_TRANSFORME"
                          ? "bg-[#16a34a] text-slate-950"
                          : "bg-[#fff200] text-slate-900";
                    const label =
                      status === "STAND"
                        ? "STAND"
                        : status === "BL_TRANSFORME"
                          ? "BL TRANSFORME"
                          : "EN COURS";

                    return (
                    <th key={`white-secret-empty-top-${index}`} className={`sticky top-[90px] z-11 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 whitespace-normal break-words`}>
                      <span className={`inline-block rounded-sm px-3 py-1 text-[16px] font-medium uppercase ${badgeClass}`}>
                        {label}
                      </span>
                    </th>
                    );
                  })}
                  {WHITE_SECRET_SUMMARY_COLUMNS.map((column) => (
                    <th
                      key={`white-secret-summary-top-${column}`}
                      className={`sticky top-[90px] z-11 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`}
                    />
                  ))}
                </tr>
                {/* Ligne Client : les noms longs passent sur 2 lignes
                    (whitespace-normal), donc plus haute que les autres
                    lignes d'en-tete sticky (~113px mesures vs ~48px pour
                    les lignes courtes) - les offsets top-[Xpx] des lignes
                    suivantes (320/410/500) laissent une marge de securite
                    pour ne pas chevaucher son contenu au scroll. */}
                <tr>
                  <th className={`sticky top-[180px] left-0 z-50 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-3 font-medium text-slate-950`}>
                    Client
                  </th>
                  {visibleCommandColumns.map((column) => {
                    const status = String(column.statut || "").toUpperCase();
                    const clientClass =
                      status === "STAND"
                        ? "bg-[#f59e0b] text-slate-950"
                        : status === "BL_TRANSFORME"
                          ? "bg-[#16a34a] text-slate-950"
                          : "bg-[#fff200] text-slate-900";

                    return (
                      <th
                        key={`white-secret-client-${column.key}`}
                        title={column.client || undefined}
                        // max-h-11 + overflow-hidden (jamais plus d'environ 2
                        // lignes) - sans ca, un nom de client tres long ou
                        // trop de colonnes visibles a la fois pouvait faire
                        // deborder cette ligne au-dela des ~140px prevus par
                        // les offsets sticky top-[Xpx] fixes des lignes
                        // suivantes (voir commentaire au-dessus), les faisant
                        // chevaucher son propre contenu au scroll (bug reel
                        // signale : les chiffres des lignes articles
                        // "rentraient dans" la ligne Client). Volontairement
                        // PAS line-clamp (force display:-webkit-box, casse le
                        // calcul de largeur des colonnes d'un th - deja teste,
                        // faisait exploser toute la ligne a 886px de haut) :
                        // max-height garde display:table-cell intact.
                        className={`sticky top-[180px] z-12 max-h-16 overflow-hidden border border-slate-700 px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words ${clientClass}`}
                      >
                        {column.client || "\u00A0"}
                      </th>
                    );
                  })}
                  {WHITE_SECRET_SUMMARY_COLUMNS.map((column, index) => (
                    <th
                      key={`white-secret-summary-header-${column}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950 ${
                          index >= WHITE_SECRET_STICKY_SUMMARY_INDEX ? "sticky top-[180px] right-0 z-13" : "sticky top-[180px] z-12"
                        }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className={`sticky top-[320px] left-0 z-50 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium uppercase text-slate-950`}>
                    NOMBRE DE CAMION
                  </th>
                  {visibleCommandColumns.map((column) => (
                    <th
                      key={`white-secret-camions-${column.key}`}
                      className={`sticky top-[320px] z-13 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] whitespace-normal break-words`}
                    >
                      {formatTruckCount(column.nombre_camion)}
                    </th>
                  ))}
                  {WHITE_SECRET_SUMMARY_COLUMNS.map((column, index) => (
                    <th
                      key={`white-secret-summary-camions-${column}`}
                      className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 ${index >= WHITE_SECRET_STICKY_SUMMARY_INDEX ? "sticky top-[320px] right-0 z-14" : "sticky top-[320px] z-13"}`}
                    />
                  ))}
                </tr>
                <tr>
                  <th className={`sticky top-[410px] left-0 z-50 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium uppercase text-slate-950`}>
                    tC
                  </th>
                  {visibleCommandColumns.map((column) => (
                    <th
                      key={`white-secret-tc-${column.key}`}
                      className={`sticky top-[410px] z-14 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] whitespace-normal break-words`}
                    >
                      {column.mode_chargement || "\u00A0"}
                    </th>
                  ))}
                  {WHITE_SECRET_SUMMARY_COLUMNS.map((column, index) => (
                    <th
                      key={`white-secret-summary-tc-${column}`}
                      className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 ${index >= WHITE_SECRET_STICKY_SUMMARY_INDEX ? "sticky top-[410px] right-0 z-15" : "sticky top-[410px] z-14"}`}
                    />
                  ))}
                </tr>
                <tr>
                  <th className={`sticky top-[500px] left-0 z-50 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium text-slate-950`}>
                    Proforma #
                  </th>
                  {visibleCommandColumns.map((column) => (
                    <th
                      key={`white-secret-proforma-${column.key}`}
                      className={`sticky top-[500px] z-15 border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium leading-tight whitespace-normal break-words text-slate-950`}
                    >
                      {column.numero_proforma || "\u00A0"}
                    </th>
                  ))}
                  {WHITE_SECRET_SUMMARY_COLUMNS.map((column, index) => (
                    <th
                      key={`white-secret-summary-proforma-${column}`}
                      className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 ${index >= WHITE_SECRET_STICKY_SUMMARY_INDEX ? "sticky top-[500px] right-0 z-16" : "sticky top-[500px] z-15"}`}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {articleRows.map((article, rowIndex) => {
                  const articleKey = normalizeArticle(article);
                  const isGreenRow = article.toLowerCase().includes("bl transforme");

                  const rowTotal = visibleCommandColumns.reduce((sum, column) => {
                    return (
                      sum +
                      Number(quantitiesByArticle.get(articleKey)?.get(column.key) ?? 0)
                    );
                  }, 0);
                  const articleStock = Number(stockByArticle.get(articleKey) ?? 0);
                  const articleReste = articleStock - rowTotal;
                  const qtEnCoursConditionnement = Number(
                    qtEnCoursConditionnementByArticleKey.get(articleKey) ?? 0
                  );
                  const lineFillClass = articleReste < 0 ? "bg-[#fff59d] text-slate-950" : "bg-white";
                  const articleCellClass = articleReste < 0
                    ? "bg-[#fff59d] text-slate-950"
                    : article.toLowerCase().includes("stand") || article.toLowerCase().includes("production")
                      ? "bg-[#ffe01b] text-slate-950"
                      : isGreenRow
                        ? "bg-[#62ff1b] text-[#0d6b0d]"
                        : `${WHITE_SECRET_TURQUOISE} text-slate-950`;
                  const summaryFillClass =
                    articleReste < 0 ? "bg-[#fff59d] text-red-700" : `${WHITE_SECRET_TURQUOISE} text-slate-950`;

                  return (
                    <tr key={`white-secret-empty-row-${article}`}>
                      <td
                        className={`sticky left-0 z-20 border border-slate-300 px-2 py-1 text-left text-[16px] font-medium leading-tight whitespace-nowrap ${articleCellClass}`}
                      >
                        {article || "\u00A0"}
                      </td>
                      {whiteSecretDataColumns.map((_, index) => {
                        const currentColumn = visibleCommandColumns[index];
                        const qty = currentColumn
                          ? Number(
                              quantitiesByArticle.get(articleKey)?.get(currentColumn.key) ?? 0
                            )
                          : 0;
                        return (
                          <td
                            key={`white-secret-empty-cell-${rowIndex}-${index}`}
                            className={`border border-slate-300 px-1 py-1 font-medium leading-tight whitespace-normal break-words ${lineFillClass}`}
                          >
                            {qty > 0 ? formatQuantity(qty) : ""}
                          </td>
                        );
                      })}
                      {WHITE_SECRET_SUMMARY_COLUMNS.map((column, index) => (
                        <td
                          key={`white-secret-empty-summary-${rowIndex}-${column}`}
                          className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass} ${index >= WHITE_SECRET_STICKY_SUMMARY_INDEX ? "sticky right-0 z-10" : ""}`}
                        >
                          {index === 0 && rowTotal > 0
                            ? formatQuantity(rowTotal)
                            : index === 1
                              ? formatQuantity(articleStock)
                              : index === 2
                                ? formatQuantity(articleReste)
                                : index === 3 && qtEnCoursConditionnement > 0
                                  ? formatQuantity(qtEnCoursConditionnement)
                                  : ""}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function renderGenericFamilyTemplate(
  families: string[],
  selectedFamille: string,
  articleRows: string[],
  commandColumns: CommandColumn[],
  quantitiesByArticle: Map<string, Map<string, number>>,
  stockByArticle: Map<string, number>,
  qtEnCoursConditionnementByArticleKey: Map<string, number>,
  subGammeByArticleKey?: Map<string, { label: string; bannerClass: string }>,
  hideStand: boolean = false
) {
  const visibleCommandColumns = commandColumns.filter(
    (column) => !hideStand || String(column.statut || "").toUpperCase() !== "STAND"
  );
  const rowsWithSubGamme = articleRows.map((article, index) => {
    const articleKey = normalizeArticle(article);
    const subGamme = subGammeByArticleKey?.get(articleKey) ?? null;
    const previousArticleKey = index > 0 ? normalizeArticle(articleRows[index - 1]) : null;
    const previousSubGamme =
      previousArticleKey !== null ? subGammeByArticleKey?.get(previousArticleKey) ?? null : null;
    const showSubGammeBanner = subGamme !== null && subGamme.label !== previousSubGamme?.label;

    return { article, subGamme, showSubGammeBanner };
  });

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full space-y-4">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                ERP Rodis
              </p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight">{selectedFamille}</h1>
              <p className="mt-2 text-sm text-slate-600">
                Tableau automatique de la famille.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BackButton href="/tableau-commandes" label="Retour aux familles" />
              <RefreshButton />
              <form action="/tableau-commandes">
                <input type="hidden" name="famille" value={selectedFamille} />
                {hideStand ? null : <input type="hidden" name="hideStand" value="1" />}
                <button
                  type="submit"
                  className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[16px] font-medium text-amber-800"
                >
                  {hideStand ? "Afficher stand" : "Supprimer stand"}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-2">
            {families.map((family) => {
              const isActive = family === selectedFamille;
              const buttonStyle = FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";

              return (
                <Link
                  key={family}
                  href={`/tableau-commandes?famille=${encodeURIComponent(family)}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold leading-none shadow-sm transition hover:opacity-90 ${buttonStyle} ${
                    isActive ? "ring-2 ring-slate-950/30" : ""
                  }`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-slate-300 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-[2260px] w-full border-separate border-spacing-0 text-center text-[17px]">
              <colgroup>
                <col style={{ width: "280px" }} />
                {visibleCommandColumns.length > 0 ? (
                  visibleCommandColumns.map((column) => (
                    <col key={`col-${column.key}`} style={{ width: "44px" }} />
                  ))
                ) : (
                  <col style={{ width: "120px" }} />
                )}
                <col style={{ width: "64px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "84px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-slate-700 bg-white px-3 py-2 text-left text-xl font-medium text-slate-900">
                    {formatDateCell(new Date())}
                  </th>
                  <th
                    colSpan={Math.max(commandColumns.length, 1) + 4}
                    className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 text-center text-lg font-medium text-slate-950`}
                  >
                    {selectedFamille}
                  </th>
                </tr>
                <tr>
                  <th className="border border-slate-700 bg-[#62ff1b] px-2 py-1 text-center text-[16px] font-medium uppercase leading-4 text-[#0d6b0d]">
                    &nbsp;
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => {
                      return (
                        <th
                          key={`status-${column.key}`}
                          className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 whitespace-normal break-words`}
                        >
                          <span
                            className={`inline-block rounded-sm px-3 py-1 text-[16px] font-medium uppercase ${getStatusCellClass(column.statut)}`}
                          >
                            {getStatusLabel(column.statut)}
                          </span>
                        </th>
                      );
                    })
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2 font-medium text-slate-950`} />
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-3 font-medium text-slate-950`}>
                    Client
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`client-${column.key}`}
                        className={`border border-slate-700 px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words ${getStatusCellClass(column.statut)}`}
                      >
                        {column.client || "\u00A0"}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-3`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    TOTAL
                  </th>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    STOCK
                  </th>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    RESTE
                  </th>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-3 text-[16px] font-medium uppercase leading-tight whitespace-normal break-words text-slate-950`}>
                    Qt en cours de Conditionnement
                  </th>
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium uppercase text-slate-950`}>
                    NOMBRE DE CAMION
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`truck-${column.key}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] whitespace-normal break-words`}
                      >
                        {formatTruckCount(column.nombre_camion)}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium uppercase text-slate-950`}>
                    tC
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`tc-${column.key}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] whitespace-normal break-words`}
                      >
                        {column.mode_chargement || "\u00A0"}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                </tr>
                <tr>
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-3 py-2 font-medium text-slate-950`}>
                    Proforma #
                  </th>
                  {commandColumns.length > 0 ? (
                    visibleCommandColumns.map((column) => (
                      <th
                        key={`proforma-${column.key}`}
                        className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-1 py-2 text-[16px] font-medium leading-tight whitespace-normal break-words text-slate-950`}
                      >
                        {column.numero_proforma || "-"}
                      </th>
                    ))
                  ) : (
                    <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  )}
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                  <th className={`border border-slate-700 ${WHITE_SECRET_TURQUOISE} px-2 py-2`} />
                </tr>
              </thead>
              <tbody>
                {rowsWithSubGamme.flatMap(({ article, subGamme, showSubGammeBanner }) => {
                  const articleKey = normalizeArticle(article);
                  const articleQuantities = quantitiesByArticle.get(articleKey);
                  const totalCommande = visibleCommandColumns.reduce(
                    (sum, column) => sum + Number(articleQuantities?.get(column.key) ?? 0),
                    0
                  );
                  const stock = Number(stockByArticle.get(articleKey) ?? 0);
                  const reste = stock - totalCommande;
                  const qtEnCoursConditionnement = Number(
                    qtEnCoursConditionnementByArticleKey.get(articleKey) ?? 0
                  );
                  const isGreenRow = article.toLowerCase().includes("bl transforme");
                  const articleCellClass =
                    reste < 0
                      ? "bg-[#fff59d] text-slate-950"
                      : article.toLowerCase().includes("stand") || article.toLowerCase().includes("production")
                        ? "bg-[#ffe01b] text-slate-950"
                        : isGreenRow
                          ? "bg-[#62ff1b] text-[#0d6b0d]"
                          : `${WHITE_SECRET_TURQUOISE} text-slate-950`;
                  const lineFillClass = reste < 0 ? "bg-[#fff59d] text-slate-950" : "bg-white";
                  const summaryFillClass =
                    reste < 0 ? "bg-[#fff59d] text-red-700" : `${WHITE_SECRET_TURQUOISE} text-slate-950`;

                  const rows: React.ReactNode[] = [];

                  if (showSubGammeBanner && subGamme) {
                    rows.push(
                      <tr key={`subgamme-${subGamme.label}`}>
                        <td
                          colSpan={1 + visibleCommandColumns.length + 4}
                          className={`border border-slate-700 px-4 py-2 text-center text-base font-bold uppercase italic ${subGamme.bannerClass}`}
                        >
                          {subGamme.label}
                        </td>
                      </tr>
                    );
                  }

                  rows.push(
                    <tr key={article}>
                      <td
                        className={`sticky left-0 z-20 border border-slate-300 px-2 py-1 text-left text-[16px] font-medium leading-tight whitespace-nowrap ${articleCellClass}`}
                      >
                        {article}
                      </td>
                      {visibleCommandColumns.length > 0 ? (
                        visibleCommandColumns.map((column) => {
                          const qty = Number(
                            quantitiesByArticle.get(articleKey)?.get(column.key) ?? 0
                          );

                          return (
                            <td
                              key={`${article}-${column.key}`}
                              className={`border border-slate-300 px-1 py-1 font-medium leading-tight whitespace-normal break-words ${lineFillClass}`}
                            >
                              {qty > 0 ? formatQuantity(qty) : ""}
                            </td>
                          );
                        })
                      ) : (
                        <td className={`border border-slate-300 px-1 py-1 ${lineFillClass}`} />
                      )}
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass}`}>
                        {formatQuantity(totalCommande)}
                      </td>
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass}`}>
                        {formatQuantity(stock)}
                      </td>
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass}`}>
                        {formatQuantity(reste)}
                      </td>
                      <td className={`border border-slate-700 px-2 py-1 font-medium ${summaryFillClass}`}>
                        {qtEnCoursConditionnement > 0 ? formatQuantity(qtEnCoursConditionnement) : ""}
                      </td>
                    </tr>
                  );

                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

async function fetchAllArticlesForMissingReport() {
  const rows: { id: number; nom_article: string | null; gamme: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;

  // PostgREST plafonne chaque requete a ~1000 lignes quel que soit le
  // nombre demande - sans cette boucle, les articles au-dela du 1000e
  // etaient absents du rapport "Article manquant".
  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk =
      (data as { id: number; nom_article: string | null; gamme: string | null }[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// "Qt en cours de Conditionnement" par article, cle par nom d'article
// normalise pour matcher les autres maps de cette page (stockByArticle,
// quantitiesByArticle...) - deux morceaux additionnes :
// 1. Deja emballe (Suivi Production) mais pas encore valide dans le stock
//    (meme liste que "Entree Production" - transfere_stock=false).
// 2. Encore a produire au Conditionnement/Emballage (meme calcul que les
//    colonnes "Restant" du Dashboard Production), donc pas encore compte
//    dans la liste "Entree Production" ci-dessus.
async function fetchQtEnCoursConditionnementByArticle() {
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

export default async function TableauCommandesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const familleQuery = String(params.famille || "").trim();
  const hideStand = String(params.hideStand || "").trim() === "1";
  const viewQuery = String(params.vue || "").trim().toLowerCase();
  const showMissingView = viewQuery === "manquant";
  const qtEnCoursConditionnementByArticle = await fetchQtEnCoursConditionnementByArticle();

  if (showMissingView) {
    const selectedFamille = familleQuery || "";
    const families = FAMILY_ORDER;
    const targetFamilies = selectedFamille ? [selectedFamille] : families;

    function matchesFamilyGamme(gamme: string, family: string) {
      const gammeLower = String(gamme || "").toLowerCase();
      if (family === "White Secret") {
        return gammeLower.includes("white secret");
      }
      // Some family buttons (ABSOLUTE CARE REALITY, REAL CARE R, TONE
      // THERAPY R) cover several real gamme values that don't literally
      // contain the family name - group them under that one button.
      if (familyHasSubGammeMatch(family, gamme)) {
        return true;
      }
      // The real gamme value is abbreviated "bb clear v c" (no "it"), not
      // "vit c".
      if (family === "BB Clear VIT C") {
        return gammeLower.includes("bb clear v c") || gammeLower.includes("bb clear vit c");
      }
      return gammeLower.includes(family.toLowerCase());
    }

    // Some family names are substrings of another (e.g. "BB Clear" is
    // contained in "BB Clear VIT C"), so a plain substring match would put
    // an article in both. Always resolve to the most specific (longest)
    // matching family name out of the full family list, regardless of
    // which family is currently being viewed.
    // Memoized: this gets called once per commande line, but the same raw
    // gamme string repeats across many lines/commandes, and each lookup
    // scans every family - caching by gamme avoids redoing that scan.
    const resolveFamilyForGammeCache = new Map<string, string | null>();
    function resolveFamilyForGamme(gamme: string) {
      const cached = resolveFamilyForGammeCache.get(gamme);
      if (cached !== undefined) return cached;

      let best: string | null = null;

      for (const family of families) {
        if (matchesFamilyGamme(gamme, family) && (!best || family.length > best.length)) {
          best = family;
        }
      }

      resolveFamilyForGammeCache.set(gamme, best);
      return best;
    }

    // Self-contained: does not need famille_besoins / planning data at all,
    // so this view skips the queries the per-gamme tabs below need.
    const [missingArticlesRaw, { data: missingCommandesRaw }] = await Promise.all([
      fetchAllArticlesForMissingReport(),
      supabaseServer
        .from("commandes")
        .select(
          "id, client, statut, mode_chargement, type_tc, numero_proforma, commande_lignes(quantite_demandee, articles(nom_article, gamme))"
        )
        .neq("statut", "LIVREE")
        .order("created_at", { ascending: true }),
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
        client: String(commande.client || "").trim(),
        nombre_camion: groupSize > 1 ? groupSize : Number(commande.type_tc) || 1,
        mode_chargement: String(commande.mode_chargement || "").trim(),
        type_tc: String(commande.type_tc || "").trim(),
        numero_proforma: String(commande.numero_proforma || "").trim(),
        statut: String(commande.statut || "EN_COURS").trim(),
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
        (row) => resolveFamilyForGamme(String(row.gamme || "")) === family
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
        const family = resolveFamilyForGamme(String(article?.gamme || ""));
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

    return renderArticleManquantInsideTableau(
      families,
      families,
      selectedFamille,
      sharedCommandColumns,
      sections,
      qtEnCoursConditionnementByArticle,
      hideStand
    );
  }

  // famille_besoins and the active-commandes list don't depend on each
  // other, so fetch them together instead of one after the other.
  const [{ data: familleBesoinsData }, { data: allActiveCommandesDataRaw }] = await Promise.all([
    supabaseServer
      .from("famille_besoins")
      .select(
        "famille_id, article_id, client, nombre_camion, mode_chargement, numero_proforma, quantite_prevue"
      )
      .order("id", { ascending: true }),
    supabaseServer
      .from("commandes")
      .select("id, client, statut, mode_chargement, type_tc, numero_proforma")
      .neq("statut", "LIVREE")
      .order("created_at", { ascending: true }),
  ]);

  const familleRows =
    (familleBesoinsData as
      | {
          famille_id: number | null;
          article_id: number | null;
          client: string | null;
          nombre_camion: number | null;
          mode_chargement: string | null;
          numero_proforma: string | null;
          quantite_prevue: number | null;
        }[]
      | null) ?? [];

  const familleIds = [
    ...new Set(familleRows.map((row) => Number(row.famille_id ?? 0)).filter((value) => value > 0)),
  ];
  const articleIds = [
    ...new Set(familleRows.map((row) => Number(row.article_id ?? 0)).filter((value) => value > 0)),
  ];

  const [{ data: famillesData }, { data: articlesData }] = await Promise.all([
    familleIds.length
      ? supabaseServer.from("familles").select("id, nom_famille").in("id", familleIds)
      : Promise.resolve({ data: [] as { id: number; nom_famille: string | null }[] }),
    articleIds.length
      ? supabaseServer
          .from("articles")
          .select("id, nom_article, article_normalise")
          .in("id", articleIds)
      : Promise.resolve({
          data: [] as { id: number; nom_article: string | null; article_normalise: string | null }[],
        }),
  ]);

  const familleMap = new Map(
    (((famillesData as { id: number; nom_famille: string | null }[] | null) ?? []).map((row) => [
      row.id,
      String(row.nom_famille || "").trim(),
    ]))
  );

  const articleDataMap = new Map(
    (((articlesData as
      | { id: number; nom_article: string | null; article_normalise: string | null }[]
      | null) ?? []).map((row) => [
      row.id,
      {
        nom_article: String(row.nom_article || "").trim(),
        article_normalise: String(row.article_normalise || "").trim(),
      },
    ]))
  );

  const planningRows = familleRows
    .map((row): PlanningRow | null => {
      const articleInfo = articleDataMap.get(Number(row.article_id ?? 0));
      if (!articleInfo?.nom_article) return null;

      return {
        famille: familleMap.get(Number(row.famille_id ?? 0)) || null,
        articleId: Number(row.article_id ?? 0) || null,
        client: row.client,
        nombre_camion:
          row.nombre_camion === null || row.nombre_camion === undefined
            ? null
            : Number(row.nombre_camion),
        mode_chargement: row.mode_chargement,
        type_tc: null,
        numero_proforma: row.numero_proforma,
        article: articleInfo.nom_article,
        quantite_prevue: Number(row.quantite_prevue ?? 0),
      };
    })
    .filter((row): row is PlanningRow => row !== null);

  const selectedFamille = familleQuery || "";
  const shouldStayEmpty = EMPTY_TABLE_FAMILIES.has(selectedFamille);

  const families = FAMILY_ORDER;
  const selectedRows = planningRows.filter(
    (row) => String(row.famille || "").trim() === selectedFamille
  );
  const planningMetaByCommandKey = new Map<
    string,
    { nombre_camion: number | null; type_tc: string; mode_chargement: string }
  >();

  for (const row of planningRows) {
    const key = buildPlanningCommandKey(row);
    if (!planningMetaByCommandKey.has(key)) {
      planningMetaByCommandKey.set(key, {
        nombre_camion:
          row.nombre_camion === null || row.nombre_camion === undefined
            ? null
            : Number(row.nombre_camion),
        type_tc: String(row.type_tc || "").trim(),
        mode_chargement: String(row.mode_chargement || "").trim(),
      });
    }
  }

  const allActiveCommandesData =
    (allActiveCommandesDataRaw as
      | {
          id: number;
          client: string | null;
          statut: string | null;
          mode_chargement: string | null;
          type_tc: string | null;
          numero_proforma: string | null;
        }[]
      | null) ?? [];

  const allActiveCommandColumns: CommandColumn[] = [];
  const allActiveCommandKeySet = new Set<string>();

  for (const commande of allActiveCommandesData) {
    const key = buildCommandeKey(commande);
    if (allActiveCommandKeySet.has(key)) continue;
    allActiveCommandKeySet.add(key);

    const planningMeta = planningMetaByCommandKey.get(key);

    allActiveCommandColumns.push({
      key,
      client: String(commande.client || "").trim(),
      nombre_camion: (planningMeta?.nombre_camion ?? Number(commande.type_tc)) || 1,
      mode_chargement:
        planningMeta?.mode_chargement || String(commande.mode_chargement || "").trim(),
      type_tc: planningMeta?.type_tc || String(commande.type_tc || "").trim(),
      numero_proforma: String(commande.numero_proforma || "").trim(),
      statut: String(commande.statut || "EN_COURS").trim(),
    });
  }

  // Some gamme values don't literally contain the family name they belong
  // to (ABSOLUTE CARE REALITY's real gammes are Water Lilies/Aloe
  // Vera/Fresh Lime/Papaya, and BB Clear VIT C is stored abbreviated as
  // "bb clear v c"), and "BB Clear" alone is a substring of that VIT C
  // variant. This mirrors the same special-casing used for Article
  // manquant so both views agree on which article belongs to which gamme.
  function gammeMatchesSelectedFamily(gamme: string, family: string) {
    const gammeLower = String(gamme || "").toLowerCase();
    if (familyHasSubGammeMatch(family, gamme)) return true;
    if (family === "BB Clear VIT C") return gammeLower.includes("bb clear v");
    if (family === "BB Clear") return gammeLower.includes("bb clear") && !gammeLower.includes("bb clear v");
    return gammeLower.includes(family.toLowerCase());
  }

  function ilikePatternForFamily(family: string) {
    if (FAMILY_SUBGAMMES[family]) {
      // Their sub-gamme real values don't share one common prefix (e.g.
      // ECO+OFA+CDV+SKL covers "Skin Light", "C.D.V", "One For All"...),
      // so fetch broadly and refine afterwards with
      // gammeMatchesSelectedFamily instead of guessing a pattern.
      return "%";
    }
    if (family === "BB Clear" || family === "BB Clear VIT C") return "%bb clear%";
    return `%${family}%`;
  }

  const whiteSecretCommandesData =
    selectedFamille === "White Secret"
      ? (
          (
            await supabaseServer
              .from("commandes")
              .select(
                "id, client, statut, mode_chargement, type_tc, numero_proforma, commande_lignes(quantite_demandee, articles(nom_article, gamme))"
              )
              .neq("statut", "LIVREE")
              .order("created_at", { ascending: true })
          ).data as
            | {
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
              }[]
            | null
        ) ?? []
      : [];

  const whiteSecretArticles =
    selectedFamille === "White Secret"
      ? (
          (
            await supabaseServer
              .from("articles")
              .select("id, nom_article, gamme")
              .ilike("gamme", "%White Secret%")
              .order("nom_article", { ascending: true })
          ).data as WhiteSecretArticleRow[] | null
        ) ?? []
      : [];

  const whiteSecretCommandColumns: CommandColumn[] = [];
  const whiteSecretQuantitiesByArticle = new Map<string, Map<string, number>>();
  const whiteSecretStockByArticle = new Map<string, number>();

  if (selectedFamille === "White Secret") {
    // Le nombre de camion compte TOUTES les lignes "commandes" du meme
    // proforma de base (chaque camion est sa propre ligne), pas seulement
    // celles qui contiennent un article White Secret.
    const whiteSecretCountByKey = new Map<string, number>();
    for (const commande of whiteSecretCommandesData) {
      const countKey = buildCommandeKey(commande);
      whiteSecretCountByKey.set(countKey, (whiteSecretCountByKey.get(countKey) ?? 0) + 1);
    }

    const whiteSecretSeenKeys = new Set<string>();

    for (const commande of whiteSecretCommandesData) {
      const lignes = (commande.commande_lignes ?? []).filter((ligne) => {
        const relation = ligne.articles;
        const article = Array.isArray(relation) ? relation[0] : relation;
        return String(article?.gamme || "")
          .toLowerCase()
          .includes("white secret");
      });

      if (lignes.length === 0) continue;

      const key = buildCommandeKey(commande);

      if (!whiteSecretSeenKeys.has(key)) {
        whiteSecretSeenKeys.add(key);

        const groupSize = whiteSecretCountByKey.get(key) ?? 1;
        whiteSecretCommandColumns.push({
          key,
          client: String(commande.client || "").trim(),
          nombre_camion: groupSize > 1 ? groupSize : Number(commande.type_tc) || 1,
          mode_chargement: String(commande.mode_chargement || "").trim(),
          type_tc: String(commande.type_tc || "").trim(),
          numero_proforma: String(commande.numero_proforma || "").trim(),
          statut: String(commande.statut || "EN_COURS").trim(),
        });
      }

      // Chaque camion du meme proforma est une ligne "commandes" separee -
      // il faut additionner la quantite de TOUS les camions, pas seulement
      // du premier rencontre (celui qui a cree la colonne).
      for (const ligne of lignes) {
        const relation = ligne.articles;
        const article = Array.isArray(relation) ? relation[0] : relation;
        const articleName = String(article?.nom_article || "").trim();
        const articleKey = normalizeArticle(articleName);
        if (!articleName || !articleKey) continue;

        const rowMap =
          whiteSecretQuantitiesByArticle.get(articleKey) ?? new Map<string, number>();
        rowMap.set(
          key,
          Number(rowMap.get(key) ?? 0) + Number(ligne.quantite_demandee ?? 0)
        );
        whiteSecretQuantitiesByArticle.set(articleKey, rowMap);
      }
    }

  }

  const whiteSecretBodyRows =
    selectedFamille === "White Secret"
      ? [
          ...[
            ...new Set(
              whiteSecretArticles
                .map((row) =>
                  String(row.nom_article || "")
                    .replace(/\u00a0/g, "")
                    .trim()
                )
                .filter((value) => value.length > 0 && /[A-Za-z0-9]/.test(value))
            ),
          ].sort((a, b) => {
            const rankDiff =
              getWhiteSecretArticleRank(a) - getWhiteSecretArticleRank(b);
            if (rankDiff !== 0) return rankDiff;

            const contenanceDiff =
              getWhiteSecretContenance(b) - getWhiteSecretContenance(a);
            if (contenanceDiff !== 0) return contenanceDiff;

            return a.localeCompare(b, "fr", { sensitivity: "base" });
          }),
          "BL TRANSFORME",
          "PRODUCTION EN COURS",
          "STAND(faire les articles commun)",
        ]
      : [];

  const genericFamilyArticles =
    selectedFamille &&
    selectedFamille !== "White Secret" &&
    !shouldStayEmpty
      ? (
          (
            (
              await supabaseServer
                .from("articles")
                .select("id, nom_article, gamme, nature")
                .ilike("gamme", ilikePatternForFamily(selectedFamille))
                .order("nom_article", { ascending: true })
            ).data as
              | { id: number; nom_article: string | null; gamme: string | null; nature: string | null }[]
              | null
          ) ?? []
        )
          .filter((row) => gammeMatchesSelectedFamily(String(row.gamme || ""), selectedFamille))
          // Le vrac (matiere non conditionnee) n'a pas sa place dans le
          // tableau de dispatch camion - seuls les articles finis/emballes
          // s'y commandent et s'y chargent.
          .filter((row) => row.nature !== "vrac")
      : [];

  const genericFamilyCommandesData =
    selectedFamille &&
    selectedFamille !== "White Secret" &&
    !shouldStayEmpty
      ? (
          (
            await supabaseServer
              .from("commandes")
              .select(
                "id, client, statut, mode_chargement, type_tc, numero_proforma, commande_lignes(quantite_demandee, articles(nom_article, gamme))"
              )
              .neq("statut", "LIVREE")
              .order("created_at", { ascending: true })
          ).data as
            | {
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
              }[]
            | null
        ) ?? []
      : [];

  const genericFamilyCommandColumns: CommandColumn[] = [];
  const genericFamilyQuantitiesByArticle = new Map<string, Map<string, number>>();
  const genericFamilyStockByArticle = new Map<string, number>();
  const genericFamilyArticleNameById = new Map<number, string>(
    genericFamilyArticles.map((row) => [Number(row.id ?? 0), String(row.nom_article || "").trim()])
  );

  if (selectedFamille && selectedFamille !== "White Secret" && !shouldStayEmpty) {
    genericFamilyCommandColumns.push(...allActiveCommandColumns);

    for (const commande of genericFamilyCommandesData) {
      const key = buildCommandeKey(commande);
      const lignes = (commande.commande_lignes ?? []).filter((ligne) => {
        const relation = ligne.articles;
        const article = Array.isArray(relation) ? relation[0] : relation;

        return gammeMatchesSelectedFamily(String(article?.gamme || ""), selectedFamille);
      });

      if (lignes.length === 0) continue;

      for (const ligne of lignes) {
        const relation = ligne.articles;
        const article = Array.isArray(relation) ? relation[0] : relation;
        const articleName = String(article?.nom_article || "").trim();
        const articleKey = normalizeArticle(articleName);
        if (!articleKey) continue;

        const rowMap =
          genericFamilyQuantitiesByArticle.get(articleKey) ?? new Map<string, number>();
        rowMap.set(
          key,
          Number(rowMap.get(key) ?? 0) + Number(ligne.quantite_demandee ?? 0)
        );
        genericFamilyQuantitiesByArticle.set(articleKey, rowMap);
      }
    }
  }

  // For parent-family buttons that cover several real gammes (see
  // FAMILY_SUBGAMMES), remember which sub-gamme each article belongs to so
  // the table can show a colored banner between groups.
  const genericFamilySubGammeByArticleKey = new Map<
    string,
    { label: string; bannerClass: string }
  >();

  if (selectedFamille && TYPE_GROUPED_FAMILIES.has(selectedFamille)) {
    for (const row of genericFamilyArticles) {
      const articleName = String(row.nom_article || "").replace(/\u00a0/g, "").trim();
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
  } else if (selectedFamille && FAMILY_SUBGAMMES[selectedFamille]) {
    for (const row of genericFamilyArticles) {
      const subGamme = getFamilySubGamme(selectedFamille, String(row.gamme || ""));
      if (!subGamme) continue;

      const articleKey = normalizeArticle(
        String(row.nom_article || "").replace(/\u00a0/g, "").trim()
      );
      if (articleKey) {
        genericFamilySubGammeByArticleKey.set(articleKey, subGamme);
      }
    }
  }

  const genericFamilyArticleRows =
    selectedFamille &&
    selectedFamille !== "White Secret" &&
    !shouldStayEmpty
      ? [
          ...new Set(
            genericFamilyArticles
              .map((row) => String(row.nom_article || "").replace(/\u00a0/g, "").trim())
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

          const rankDiff =
            getWhiteSecretArticleRank(a) - getWhiteSecretArticleRank(b);
          if (rankDiff !== 0) return rankDiff;

          const contenanceDiff =
            getWhiteSecretContenance(b) - getWhiteSecretContenance(a);
          if (contenanceDiff !== 0) return contenanceDiff;

          return a.localeCompare(b, "fr", { sensitivity: "base" });
        })
      : [];

  if (selectedFamille && selectedFamille !== "White Secret" && !shouldStayEmpty) {
    const latestStocks = await fetchArticleStocksFromStockPage(genericFamilyArticles);
    latestStocks.forEach((value, key) => {
      genericFamilyStockByArticle.set(key, value);
    });
  }

  if (selectedFamille === "White Secret") {
    const latestStocks = await fetchArticleStocksFromStockPage(whiteSecretArticles);
    latestStocks.forEach((value, key) => {
      whiteSecretStockByArticle.set(key, value);
    });
  }

  const commandColumns: CommandColumn[] = [];
  const commandSet = new Set<string>();

  for (const row of selectedRows) {
    const key = buildPlanningCommandKey(row);

    if (!commandSet.has(key)) {
      commandSet.add(key);
      commandColumns.push({
        key,
        client: String(row.client || "").trim(),
        nombre_camion:
          row.nombre_camion === null || row.nombre_camion === undefined
            ? null
            : Number(row.nombre_camion),
        mode_chargement: String(row.mode_chargement || "").trim(),
        type_tc: String(row.type_tc || "").trim(),
        numero_proforma: String(row.numero_proforma || "").trim(),
        statut: "EN_COURS",
      });
    }
  }

  const articleNames = [
    ...new Set(
      selectedRows
        .map((row) =>
          String(row.article || "")
            .replace(/\u00a0/g, "")
            .trim()
        )
        .filter((value) => value.length > 0 && /[A-Za-z0-9]/.test(value))
    ),
  ];
  const stockByArticleName =
    selectedFamille === "White Secret"
      ? whiteSecretStockByArticle
      : genericFamilyStockByArticle;
  const displayCommandColumns =
    selectedFamille && selectedFamille !== "White Secret"
      ? allActiveCommandColumns
      : commandColumns;

  const matrixRows = articleNames.map((articleName) => {
    const articleNormal = normalizeArticle(articleName);
    const quantitiesByCommand = new Map<string, number>();

    for (const row of selectedRows.filter(
      (item) => normalizeArticle(String(item.article || "")) === articleNormal
    )) {
      const key = buildPlanningCommandKey(row);

      quantitiesByCommand.set(
        key,
        Number(quantitiesByCommand.get(key) ?? 0) + Number(row.quantite_prevue ?? 0)
      );
    }

    const totalCommande = [...quantitiesByCommand.values()].reduce((sum, value) => sum + value, 0);
    const stock = Number(stockByArticleName.get(articleNormal) ?? 0);
    const reste = stock - totalCommande;

    return {
      article: articleName,
      quantitiesByCommand,
      totalCommande,
      stock,
      reste,
    };
  }).filter((row) => String(row.article || "").trim().length > 0);

  if (!selectedFamille) {
    return (
      <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
        <div className="mx-auto w-full space-y-5">
          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                  ERP Rodis
                </p>
                <h1 className="mt-1 text-3xl font-medium tracking-tight">
                  Tableau de commande
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  Choisis d&apos;abord une famille pour ouvrir son tableau.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <BackButton href="/" />
                <RefreshButton />
                <Link
                  href="/tableau-commandes?vue=manquant"
                  className="rounded-full bg-red-700 px-4 py-2 text-[16px] font-medium text-white"
                >
                  Article manquant
                </Link>
                <Link
                  href="/commandes"
                  className="rounded-full bg-slate-950 px-4 py-2 text-[16px] font-medium text-white"
                >
                  Commandes
                </Link>
              </div>
            </div>
          </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/tableau-commandes?vue=manquant"
              className="rounded-xl bg-red-700 px-4 py-2 text-[16px] font-medium leading-none text-white shadow-sm transition hover:scale-[1.02] hover:opacity-90"
            >
              Article manquant
            </Link>
            {families.map((family) => {
              const buttonStyle =
                FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";

              return (
                <Link
                  key={family}
                  href={`/tableau-commandes?famille=${encodeURIComponent(family)}`}
                  className={`rounded-xl px-4 py-2 text-[16px] font-medium leading-none shadow-sm transition hover:scale-[1.02] hover:opacity-90 ${buttonStyle}`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>
        </div>
      </main>
    );
  }

  if (selectedRows.length === 0 || shouldStayEmpty) {
    if (selectedFamille === "White Secret") {
      return renderWhiteSecretEmptyTemplate(
        families,
        selectedFamille,
        whiteSecretBodyRows,
        allActiveCommandColumns,
        whiteSecretQuantitiesByArticle,
        whiteSecretStockByArticle,
        qtEnCoursConditionnementByArticle,
        hideStand
      );
    }

    if (selectedFamille && !shouldStayEmpty) {
      return renderGenericFamilyTemplate(
        families,
        selectedFamille,
        genericFamilyArticleRows,
        allActiveCommandColumns,
        genericFamilyQuantitiesByArticle,
        genericFamilyStockByArticle,
        qtEnCoursConditionnementByArticle,
        genericFamilySubGammeByArticleKey,
        hideStand
      );
    }

    return (
      <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
        <div className="mx-auto w-full space-y-5">
          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                  ERP Rodis
                </p>
                <h1 className="mt-1 text-3xl font-medium tracking-tight">
                  {selectedFamille}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  Cette famille est ouverte, mais le tableau est encore vide.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <BackButton href="/tableau-commandes" label="Retour aux boutons" />
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="mb-5 flex flex-wrap gap-2">
              {families.map((family) => {
                const isActive = family === selectedFamille;
                const buttonStyle =
                  FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";

                return (
                  <Link
                    key={family}
                    href={`/tableau-commandes?famille=${encodeURIComponent(family)}`}
                    className={`rounded-md px-3 py-1.5 text-sm font-bold leading-none shadow-sm transition hover:opacity-90 ${buttonStyle} ${
                      isActive ? "ring-2 ring-slate-950/30" : ""
                    }`}
                  >
                    {family}
                  </Link>
                );
              })}
            </div>

            <div className="min-h-[360px] rounded-[1.5rem] border border-slate-200 bg-white" />
          </section>
        </div>
      </main>
    );
  }

  if (selectedFamille === "White Secret") {
    return renderWhiteSecretEmptyTemplate(
      families,
      selectedFamille,
      whiteSecretBodyRows,
      allActiveCommandColumns,
      whiteSecretQuantitiesByArticle,
      whiteSecretStockByArticle,
      qtEnCoursConditionnementByArticle,
      hideStand
    );
  }

  if (selectedFamille && selectedFamille !== "White Secret") {
    return renderGenericFamilyTemplate(
      families,
      selectedFamille,
      genericFamilyArticleRows,
      allActiveCommandColumns,
      genericFamilyQuantitiesByArticle,
      genericFamilyStockByArticle,
      qtEnCoursConditionnementByArticle,
      genericFamilySubGammeByArticleKey
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full space-y-4">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">
                ERP Rodis
              </p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight">Tableau de commande</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BackButton href="/" />
              <RefreshButton />
              <Link
                href="/tableau-commandes"
                className="rounded-full border border-slate-200 px-4 py-2 text-[16px] font-medium text-slate-700"
              >
                Familles
              </Link>
              <Link
                href={`/tableau-commandes?vue=manquant${selectedFamille ? `&famille=${encodeURIComponent(selectedFamille)}` : ""}`}
                className="rounded-full bg-red-700 px-4 py-2 text-[16px] font-medium text-white"
              >
                Article manquant
              </Link>
              <Link
                href="/commandes"
                className="rounded-full bg-slate-950 px-4 py-2 text-[16px] font-medium text-white"
              >
                Commandes
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap gap-2">
            {families.map((family) => {
              const isActive = family === selectedFamille;
              const buttonStyle =
                FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";

              return (
                <Link
                  key={family}
                  href={`/tableau-commandes?famille=${encodeURIComponent(family)}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold leading-none shadow-sm transition hover:opacity-90 ${buttonStyle} ${
                    isActive ? "ring-2 ring-slate-950/30" : ""
                  }`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-[2200px] w-full border-separate border-spacing-0 text-center text-[16px]">
              <thead>
                <tr>
                  <th className="border border-slate-700 bg-white px-3 py-2 text-left font-medium text-slate-900">
                    {formatDateCell(new Date())}
                  </th>
                  <th
                    colSpan={displayCommandColumns.length + 3}
                    className="border border-slate-700 bg-[#14989d] px-3 py-2 text-center text-lg font-medium text-slate-950"
                  >
                    {selectedFamille}
                  </th>
                </tr>
                <tr>
                  <th className="border border-slate-700 bg-[#62ff1b] px-3 py-3 text-left text-[16px] font-medium uppercase leading-4 text-[#0d6b0d]">
                    Tableau commandes
                  </th>
                  {displayCommandColumns.map((column) => (
                    <th key={`status-${column.key}`} className="border border-slate-700 bg-[#14989d] px-2 py-2">
                      <span className="text-[16px] font-medium uppercase text-slate-950">
                        {column.mode_chargement.toLowerCase().includes("stand") ? "STAND" : ""}
                      </span>
                    </th>
                  ))}
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2 text-xs font-medium text-slate-950">
                    TOTAL
                  </th>
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2 text-xs font-medium text-slate-950">
                    STOCK
                  </th>
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2 text-xs font-medium text-slate-950">
                    RESTE
                  </th>
                </tr>
                <tr>
                  <th className="border border-slate-700 bg-[#14989d] px-3 py-3 font-medium text-slate-950">
                    Client
                  </th>
                  {displayCommandColumns.map((column) => (
                    <th
                      key={`client-${column.key}`}
                      className="border border-slate-700 bg-[#14989d] px-2 py-3 text-[16px] font-medium uppercase text-slate-950"
                    >
                      {column.client || "-"}
                    </th>
                  ))}
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-3" />
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-3" />
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-3" />
                </tr>
                <tr>
                  <th className="border border-slate-700 bg-[#14989d] px-3 py-2 font-medium uppercase text-slate-950">
                    Nombre de camion / tc
                  </th>
                  {displayCommandColumns.map((column) => (
                    <th
                      key={`truck-${column.key}`}
                      className="border border-slate-700 bg-[#14989d] px-2 py-2 text-[16px] font-medium uppercase text-slate-950"
                    >
                      <div>{formatTruckCount(column.nombre_camion)}</div>
                      <div>{column.mode_chargement || ""}</div>
                    </th>
                  ))}
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2" />
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2" />
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2" />
                </tr>
                <tr>
                  <th className="border border-slate-700 bg-[#14989d] px-3 py-2 font-medium text-slate-950">
                    Proforma #
                  </th>
                  {displayCommandColumns.map((column) => (
                    <th
                      key={`proforma-${column.key}`}
                      className="border border-slate-700 bg-[#14989d] px-2 py-2 text-[16px] font-medium text-slate-950"
                    >
                      {column.numero_proforma || "-"}
                    </th>
                  ))}
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2 text-[16px] font-medium text-slate-950">
                    TOTAL
                  </th>
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2 text-[16px] font-medium text-slate-950">
                    STOCK
                  </th>
                  <th className="border border-slate-700 bg-[#14989d] px-2 py-2 text-[16px] font-medium text-slate-950">
                    RESTE
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <tr key={row.article}>
                    <td className="border border-slate-300 bg-[#ffe91d] px-3 py-1 text-left text-[16px] font-medium text-slate-950">
                      {row.article}
                    </td>
                    {displayCommandColumns.map((column) => {
                      const qty = Number(row.quantitiesByCommand.get(column.key) ?? 0);
                      return (
                        <td
                          key={`${row.article}-${column.key}`}
                          className="border border-slate-300 bg-white px-2 py-1 font-medium text-slate-900"
                        >
                          {qty > 0 ? formatQuantity(qty) : ""}
                        </td>
                      );
                    })}
                    <td className="border border-slate-700 bg-[#0097a7] px-2 py-1 font-medium text-slate-950">
                      {formatQuantity(row.totalCommande)}
                    </td>
                    <td className="border border-slate-700 bg-[#0097a7] px-2 py-1 font-medium text-slate-950">
                      {formatQuantity(row.stock)}
                    </td>
                    <td
                      className={`border border-slate-700 px-2 py-1 font-medium ${
                        row.reste < 0
                          ? "bg-[#ffe01b] text-red-700"
                          : row.reste === 0
                            ? "bg-[#00a8b5] text-slate-950"
                            : "bg-[#00a8b5] text-slate-950"
                      }`}
                    >
                      {formatQuantity(row.reste)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}



