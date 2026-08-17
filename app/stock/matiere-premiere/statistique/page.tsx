import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { computeStatutBc } from "@/app/stock/matiere-premiere/bc/constants";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { RapportTable, type RapportRowWithLive } from "./rapport-table";
import { saveRapportGammeStatistiqueAction } from "./actions";
import { GAMME_CONFIGS } from "./gamme-config";

// Meme regle que la page Import MP (app/stock/matiere-premiere/commande) :
// un dossier reste "en cours d'achat 4D" tant qu'il n'a pas atteint le
// dernier statut de suivi.
const STATUT_DOSSIER_MP_TERMINE = "Receptionne Rodis";

function dossierKey(nDoss4d: string | null, nDossErp: string | null) {
  return `${nDoss4d ?? ""}|||${nDossErp ?? ""}`;
}

function normalizeArticleNameLoose(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

// Pagine (offset/limit) au lieu d'un simple select().in(...) sans limite -
// Supabase plafonne une reponse a 1000 lignes par defaut, ce qui tronque
// silencieusement le resultat des qu'un article a beaucoup de lignes liees.
// IMPORTANT : .order("id") est obligatoire ici - sans tri stable, Postgres
// ne garantit pas le meme ordre de lignes entre deux requetes .range()
// separees, ce qui peut faire apparaitre la MEME ligne sur 2 pages a la
// fois (doublon silencieux). C'est ce qui causait un stock faux (calcule 2
// a 3x trop grand/negatif) des qu'une gamme depassait 1000 lignes de stock
// cumulees sur tous ses articles (ex: BASE RED GRAPE 338454 sur WHITE
// SECRET, confirme par comparaison avec une requete directe sans .in()).
async function fetchAllRows<T>(
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyFilters: (query: any) => any = (query) => query
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await applyFilters(supabaseServer.from(table).select(columns))
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type ArticleMpRow = {
  id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  gamme: string | null;
  gamme_statistique: string | null;
  min_stock: number | null;
  max_stock: number | null;
};

type RapportRow = {
  id: number;
  ordre: number;
  designation: string;
  categorie: string | null;
  donnees: Record<string, string | number | null>;
};

async function fetchAllArticlesMp() {
  const rows: ArticleMpRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("id, nom_article, categorie, unite, gamme, gamme_statistique, min_stock, max_stock")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      return { rows, error };
    }

    const chunk = (data ?? []) as ArticleMpRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

// Construit les lignes + donnees live d'UNE gamme - reutilise a la fois
// pour l'affichage d'une seule gamme selectionnee et pour "Tous" (qui
// affiche tous les tableaux a la suite, voir plus bas).
async function buildRapportRowsWithLive(
  gammeKey: string,
  allArticles: ArticleMpRow[]
): Promise<RapportRowWithLive[]> {
  const gammeConfig = GAMME_CONFIGS[gammeKey];

  const { data } = await supabaseServer
    .from("rapport_gamme_statistique_mp")
    .select("id, ordre, designation, categorie, donnees")
    .eq("gamme_statistique", gammeKey)
    .order("ordre", { ascending: true });
  const rapportRows = (data ?? []) as RapportRow[];

  // Gamme/stock/BC en cours : recalcules a chaque affichage a partir des
  // vraies tables articles_matiere_premiere/lots_stock_matiere_premiere/
  // bons_commande_matiere_premiere - jamais depuis le fichier Excel fige
  // (donnees[...]), qui devient faux des le lendemain de l'import.
  const liveDataByRapportRowId = new Map<
    number,
    {
      gamme: string | null;
      stock: number;
      enCoursBc: number;
      qteBcEtDate: { quantite: number; detail: string }[];
      enCours4d: number;
      date4d: { quantite: number; detail: string }[];
      aCommander: number;
      conso12Mois: number;
      conso1Mois: number;
      conso4Mois: number;
      conso9Mois: number;
      conso6MoisSysteme: number;
    }
  >();

  if (rapportRows.length > 0) {
    const articleByNormalizedName = new Map<string, ArticleMpRow>();
    for (const article of allArticles) {
      articleByNormalizedName.set(normalizeArticleNameLoose(article.nom_article), article);
    }

    const matchedArticleIds: number[] = [];
    const articleIdByRapportRowId = new Map<number, number>();
    for (const row of rapportRows) {
      const article = articleByNormalizedName.get(normalizeArticleNameLoose(row.designation));
      if (!article) continue;
      matchedArticleIds.push(article.id);
      articleIdByRapportRowId.set(row.id, article.id);
    }

    if (matchedArticleIds.length > 0) {
      // Un seul article peut avoir des centaines de lignes lots_stock -
      // pagine chaque requete (offset/limit) au lieu d'un simple .in(...)
      // sans limite : Supabase plafonne une reponse a 1000 lignes par
      // defaut, un .in(...) sur 193 articles peut a lui seul depasser ca
      // et tronquer silencieusement le stock calcule (meme bug que celui
      // corrige sur le sync des articles MP).
      const [lotsRows, bcLignes] = await Promise.all([
        fetchAllRows<{
          article_id: number | null;
          qte_entree: number;
          qte_sortie: number;
          date_jour: string | null;
        }>(
          "lots_stock_matiere_premiere",
          "article_id, qte_entree, qte_sortie, date_jour",
          (query) => query.in("article_id", matchedArticleIds)
        ),
        fetchAllRows<{
          id: number;
          article_id: number | null;
          code: string;
          quantite: number | null;
          date_jour: string | null;
          statut: string | null;
          n_doss_4d: string | null;
          n_doss_erp: string | null;
        }>(
          "bons_commande_matiere_premiere",
          "id, article_id, code, quantite, date_jour, statut, n_doss_4d, n_doss_erp",
          (query) => query.in("article_id", matchedArticleIds)
        ),
      ]);

      const stockByArticleId = new Map<number, number>();
      // Conso reelle 12mois = somme des vraies sorties de stock (qte_sortie)
      // des 12 derniers mois glissants - plus le snapshot Excel fige, calcule
      // en direct depuis les mouvements reels. conso 1/4/9 mois = fraction
      // proportionnelle de ce total (regle demandee : 12mois/12 = 1 mois).
      const conso12MoisByArticleId = new Map<number, number>();
      const douzeMoisAvant = new Date();
      douzeMoisAvant.setDate(douzeMoisAvant.getDate() - 365);
      const douzeMoisAvantIso = douzeMoisAvant.toISOString().slice(0, 10);
      for (const lot of lotsRows) {
        if (!lot.article_id) continue;
        const mouvement = Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0);
        stockByArticleId.set(lot.article_id, (stockByArticleId.get(lot.article_id) ?? 0) + mouvement);

        if (lot.date_jour && lot.date_jour >= douzeMoisAvantIso) {
          conso12MoisByArticleId.set(
            lot.article_id,
            (conso12MoisByArticleId.get(lot.article_id) ?? 0) + Number(lot.qte_sortie ?? 0)
          );
        }
      }

      const bcLigneIds = bcLignes.map((ligne) => ligne.id);
      const [importData, statutRows] = await Promise.all([
        bcLigneIds.length > 0
          ? fetchAllRows<{
              bc_ligne_id: number;
              quantite_importee: number;
              n_doss_4d_import: string | null;
              n_doss_erp_import: string | null;
              lot_stock_id: number | null;
            }>(
              "bons_commande_mp_imports",
              "bc_ligne_id, quantite_importee, n_doss_4d_import, n_doss_erp_import, lot_stock_id",
              (query) => query.in("bc_ligne_id", bcLigneIds)
            )
          : Promise.resolve([]),
        fetchAllRows<{
          n_doss_4d: string | null;
          n_doss_erp: string | null;
          statut: string;
          date_prevue_reception: string | null;
        }>("dossiers_import_mp_statut", "n_doss_4d, n_doss_erp, statut, date_prevue_reception"),
      ]);

      // "Qte importee" utilisee pour savoir si le BC est termine (voir
      // computeStatutBc) doit compter TOUS les evenements (receptionnes ou
      // pas), sinon un BC entierement receptionne retombe a "Qte
      // importee=0"/statut "Stand" (plus aucun evenement "encore ouvert" a
      // sommer) - meme correctif que sur bc/page.tsx et bc/[code]/page.tsx.
      const importeeByLigneId = new Map<number, number>();
      for (const evenement of importData) {
        importeeByLigneId.set(
          evenement.bc_ligne_id,
          (importeeByLigneId.get(evenement.bc_ligne_id) ?? 0) + Number(evenement.quantite_importee ?? 0)
        );
      }

      // "En cours d'achat 4D" : les evenements d'import PAS ENCORE
      // receptionnes (lot_stock_id null) ET pas encore au statut final
      // "Receptionne Rodis" - suivi independant du statut de la ligne BC
      // elle-meme (meme logique que la page Import MP). Contrairement a
      // importeeByLigneId ci-dessus, ce calcul-la doit rester filtre sur
      // lot_stock_id null : il represente ce qui reste reellement en
      // attente, pas le total jamais importe.
      const statutByDossier = new Map(
        statutRows.map((row) => [
          dossierKey(row.n_doss_4d, row.n_doss_erp),
          { statut: row.statut, datePrevueReception: row.date_prevue_reception },
        ])
      );
      const articleIdByBcLigneId = new Map<number, number>();
      for (const ligne of bcLignes) {
        if (ligne.article_id) articleIdByBcLigneId.set(ligne.id, ligne.article_id);
      }
      const open4dByArticleAndDossier = new Map<
        string,
        { articleId: number; quantite: number; nDoss4d: string | null; datePrevueReception: string | null }
      >();
      for (const evenement of importData) {
        if (evenement.lot_stock_id !== null) continue;
        const articleId = articleIdByBcLigneId.get(evenement.bc_ligne_id);
        if (!articleId) continue;
        const key = dossierKey(evenement.n_doss_4d_import, evenement.n_doss_erp_import);
        const dossierInfo = statutByDossier.get(key);
        if (dossierInfo?.statut === STATUT_DOSSIER_MP_TERMINE) continue;
        const mapKey = `${articleId}::${key}`;
        const existing = open4dByArticleAndDossier.get(mapKey);
        if (existing) {
          existing.quantite += Number(evenement.quantite_importee ?? 0);
        } else {
          open4dByArticleAndDossier.set(mapKey, {
            articleId,
            quantite: Number(evenement.quantite_importee ?? 0),
            nDoss4d: evenement.n_doss_4d_import,
            datePrevueReception: dossierInfo?.datePrevueReception ?? null,
          });
        }
      }
      const open4dByArticleId = new Map<
        number,
        { quantite: number; nDoss4d: string | null; datePrevueReception: string | null }[]
      >();
      for (const entry of open4dByArticleAndDossier.values()) {
        const list = open4dByArticleId.get(entry.articleId) ?? [];
        list.push(entry);
        open4dByArticleId.set(entry.articleId, list);
      }

      const openBcLignesByArticleId = new Map<
        number,
        { quantite: number; nDoss4d: string | null; nDossErp: string | null; date_jour: string | null }[]
      >();
      for (const ligne of bcLignes) {
        if (!ligne.article_id) continue;
        const quantite = Number(ligne.quantite ?? 0);
        const quantiteImportee = importeeByLigneId.get(ligne.id) ?? 0;
        const statut = computeStatutBc(quantite, quantiteImportee, ligne.statut);
        if (statut === "Termine") continue;
        const list = openBcLignesByArticleId.get(ligne.article_id) ?? [];
        list.push({
          quantite,
          nDoss4d: ligne.n_doss_4d,
          nDossErp: ligne.n_doss_erp,
          date_jour: ligne.date_jour,
        });
        openBcLignesByArticleId.set(ligne.article_id, list);
      }

      for (const row of rapportRows) {
        const articleId = articleIdByRapportRowId.get(row.id);
        if (!articleId) continue;
        const article = allArticles.find((candidate) => candidate.id === articleId);
        const openLignes = openBcLignesByArticleId.get(articleId) ?? [];
        const open4dLignes = open4dByArticleId.get(articleId) ?? [];
        const stock = stockByArticleId.get(articleId) ?? 0;
        const enCoursBc = openLignes.reduce((sum, ligne) => sum + ligne.quantite, 0);
        const enCours4d = open4dLignes.reduce((sum, ligne) => sum + ligne.quantite, 0);
        // Meme formule que le fichier Excel source, verifiee identique sur
        // les 193 lignes de MP COSM : (stock + en cours d'achat BC + en
        // cour d'achat 4D) - statistique 4D 6 mois (celle-ci reste saisie a
        // la main, donnees[...], pas une valeur live de cette page). La cle
        // exacte de cette "statistique" varie par gamme (espace ou non).
        const statistique4d6Mois = Number(row.donnees?.[gammeConfig?.statistiqueKey ?? ""] ?? 0);
        const conso12Mois = conso12MoisByArticleId.get(articleId) ?? 0;
        // conso 1/4/9 mois : deux formules possibles selon la gamme (voir
        // gamme-config.ts) - MP COSM se base sur les vraies sorties de
        // stock des 12 derniers mois glissants, ELIXIR sur sa propre
        // formule Excel (statistique 4D 6mois / 6), trouvee telle quelle
        // dans son fichier source.
        const conso1Mois =
          gammeConfig?.consoFormula === "excel6mois" ? statistique4d6Mois / 6 : conso12Mois / 12;
        liveDataByRapportRowId.set(row.id, {
          gamme: article?.gamme ?? null,
          stock,
          enCoursBc,
          qteBcEtDate: openLignes.map((ligne) => {
            const dossier = [ligne.nDoss4d, ligne.nDossErp].filter(Boolean).join(" / ");
            return { quantite: ligne.quantite, detail: `${dossier ? dossier + " " : ""}du ${formatDate(ligne.date_jour)}` };
          }),
          enCours4d,
          date4d: open4dLignes.map((ligne) => ({
            quantite: ligne.quantite,
            detail: `${ligne.nDoss4d || ""} ${
              ligne.datePrevueReception ? formatDate(ligne.datePrevueReception) : "date prevue non saisie"
            }`,
            datePrevueReception: ligne.datePrevueReception,
          })),
          aCommander: stock + enCoursBc + enCours4d - statistique4d6Mois,
          conso12Mois,
          conso1Mois,
          conso4Mois: conso1Mois * 4,
          conso9Mois: conso1Mois * 9,
          // Colonne informative demandee separement de "Statistique 4D 6
          // mois" (qui reste manuelle et seule utilisee dans "A commander")
          // - simple moitie de conso12Mois (deja calcule sur les vraies
          // sorties de stock), pour que l'utilisateur analyse lui-meme.
          conso6MoisSysteme: conso12Mois / 2,
        });
      }
    }
  }

  return rapportRows.map((row) => ({
    id: row.id,
    ordre: row.ordre,
    designation: row.designation,
    categorie: row.categorie,
    donnees: row.donnees,
    live: liveDataByRapportRowId.get(row.id) ?? null,
  }));
}

type SearchParams = Promise<{
  gammeStatistique?: string;
}>;

export default async function StatistiqueMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const gammeStatistique = (params.gammeStatistique || "").trim();

  const { rows: allArticles, error: fetchError } = await fetchAllArticlesMp();

  // Un bouton uniquement pour les gammes qui ont deja un vrai rapport
  // fourni par l'utilisateur (GAMME_CONFIGS) - pas un bouton par valeur
  // Gamme Statistique presente en base (il y en a des dizaines, la plupart
  // sans rien derriere) : "n'ajoute pas de nom, laisse vide tant que je ne
  // l'ai pas donne".
  const gammeStatistiqueCounts = new Map<string, number>();
  for (const article of allArticles) {
    const value = (article.gamme_statistique || "").trim();
    if (!value || !(value in GAMME_CONFIGS)) continue;
    gammeStatistiqueCounts.set(value, (gammeStatistiqueCounts.get(value) || 0) + 1);
  }
  // Secours : certaines gammes (fichiers multi-onglets comme PARFUM/REAL
  // CARE) ont leurs vrais articles tagues avec des valeurs plus precises
  // que le nom plat du fichier source (ex: "PINK FLOWER"/"TARGET" au lieu
  // de "PARFUM") - sans ca, le bouton ne s'afficherait jamais meme si le
  // rapport existe bel et bien. On affiche alors le nombre de lignes du
  // rapport a la place du nombre d'articles tagues (les deux se valent
  // rarement exactement, mais garantit que le rapport reste accessible).
  const gammesSansArticleTague = Object.keys(GAMME_CONFIGS).filter(
    (key) => !gammeStatistiqueCounts.has(key)
  );
  if (gammesSansArticleTague.length > 0) {
    const rapportGammeValues = await fetchAllRows<{ gamme_statistique: string }>(
      "rapport_gamme_statistique_mp",
      "gamme_statistique",
      (query) => query.in("gamme_statistique", gammesSansArticleTague)
    );
    for (const row of rapportGammeValues) {
      gammeStatistiqueCounts.set(
        row.gamme_statistique,
        (gammeStatistiqueCounts.get(row.gamme_statistique) || 0) + 1
      );
    }
  }
  // Ordre des boutons = numero du fichier Excel source d'origine (1 MP
  // COSM, 2 MP PLASTIQUE, 3 COLORANT PLASTIQUE...25 EGYPTIAN BEAUTY), pas
  // l'ordre alphabetique - demande explicite. ANTI-MOSQUITO n'avait pas de
  // numero dans son fichier source, place en dernier.
  const GAMME_ORDER = [
    "MP COSM",
    "MP PLASTIQUE",
    "COLORANT PLASTIQUE",
    "COLORANT COSMETIQUE",
    "WHITE SECRET",
    "ELIXIR",
    "PRECIOUS PERFECT",
    "PERFECT GLOW",
    "BB CLEAR",
    "LUXURY",
    "MY FAMILY CARE",
    "POMMADE ET DIVERS",
    "PARFUM",
    "MATRIX",
    "PARFUM RODIS",
    "PARFUM REALITY",
    "MOROCCO SKIN",
    "PRO-WHITE",
    "REAL CARE",
    "COCO CLEAR",
    "ABSOLUTE CARE",
    "DERMA TONE",
    "BB CLEAR VIT C",
    "TONE THERAPY",
    "EGYPTIAN BEAUTY",
    "ANTI-MOSQUITO",
  ];
  const gammeStatistiqueButtons = [...gammeStatistiqueCounts.entries()].sort((a, b) => {
    const indexA = GAMME_ORDER.indexOf(a[0]);
    const indexB = GAMME_ORDER.indexOf(b[0]);
    if (indexA === -1 && indexB === -1) return a[0].localeCompare(b[0]);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const articlesSansGamme = allArticles.filter((article) => !(article.gamme_statistique || "").trim());

  const articlesForSelected = gammeStatistique
    ? allArticles.filter((article) => (article.gamme_statistique || "").trim() === gammeStatistique)
    : [];

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "statistiqueMp");

  // "Tous" affiche TOUS les tableaux de gamme a la suite (pas juste un
  // resume) - construit chaque gamme en parallele pour rester raisonnable
  // malgre le nombre de gammes.
  const allGammeSections =
    gammeStatistique === "" && !fetchError
      ? await Promise.all(
          gammeStatistiqueButtons.map(async ([value]) => ({
            gammeKey: value,
            rows: await buildRapportRowsWithLive(value, allArticles),
          }))
        )
      : [];

  const rowsWithLive: RapportRowWithLive[] =
    gammeStatistique && !fetchError ? await buildRapportRowsWithLive(gammeStatistique, allArticles) : [];

  // "Mis a jour le" = toujours la date du jour ou la page est ouverte (pas
  // une date sauvegardee) - meme principe que le fichier Excel source.
  const todayLabel = formatDate(new Date().toISOString().slice(0, 10));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#fbfaff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Statistique MP
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Articles matiere premiere regroupes par Gamme Statistique.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {fetchError ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {fetchError.message}
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Gamme Statistique
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/stock/matiere-premiere/statistique"
                  className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90 ${
                    gammeStatistique === ""
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Tous
                </Link>
                {gammeStatistiqueButtons.map(([value, count]) => (
                  <Link
                    key={value}
                    href={`/stock/matiere-premiere/statistique?gammeStatistique=${encodeURIComponent(value)}`}
                    className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90 ${
                      gammeStatistique === value
                        ? "bg-violet-600 text-white ring-2 ring-violet-900/20"
                        : "bg-violet-50 text-violet-900 hover:bg-violet-100"
                    }`}
                  >
                    {value} <span className="opacity-70">({count})</span>
                  </Link>
                ))}
              </div>
            </section>

            {gammeStatistique === "" ? (
              <>
                {articlesSansGamme.length > 0 ? (
                  <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50/60 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                    <p className="text-sm font-semibold text-amber-900">
                      {articlesSansGamme.length} article(s) matiere premiere sans Gamme Statistique
                    </p>
                  </section>
                ) : null}
                {allGammeSections.map(({ gammeKey, rows }) => (
                  <div key={gammeKey} className="space-y-4">
                    <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                      <p className="text-lg font-bold text-red-700">
                        {gammeKey} mis a jour le {todayLabel}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-red-700">
                        Date: {todayLabel} Stock supérieur à 1an de conso noté en rouge
                      </p>
                    </section>
                    <RapportTable
                      gammeStatistique={gammeKey}
                      rows={rows}
                      canEdit={canEdit}
                      saveAction={saveRapportGammeStatistiqueAction}
                    />
                  </div>
                ))}
              </>
            ) : rowsWithLive.length > 0 ? (
              <>
                <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <p className="text-lg font-bold text-red-700">
                    {gammeStatistique} mis a jour le {todayLabel}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-red-700">
                    Date: {todayLabel} Stock supérieur à 1an de conso noté en rouge
                  </p>
                </section>

                <RapportTable
                  gammeStatistique={gammeStatistique}
                  rows={rowsWithLive}
                  canEdit={canEdit}
                  saveAction={saveRapportGammeStatistiqueAction}
                />
              </>
            ) : (
              <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="max-h-[75vh] overflow-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead className="bg-slate-50 text-slate-950">
                      <tr>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Categorie</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Unite</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Gamme</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock min</th>
                        <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Stock max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articlesForSelected.map((article) => (
                        <tr key={article.id} className="border-t border-slate-100">
                          <td className="px-6 py-4 font-medium text-slate-900">{article.nom_article}</td>
                          <td className="px-6 py-4 text-slate-600">{article.categorie || "-"}</td>
                          <td className="px-6 py-4 text-slate-600">{article.unite || "-"}</td>
                          <td className="px-6 py-4 text-slate-600">{article.gamme || "-"}</td>
                          <td className="px-6 py-4 text-slate-600">{article.min_stock ?? "-"}</td>
                          <td className="px-6 py-4 text-slate-600">{article.max_stock ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
