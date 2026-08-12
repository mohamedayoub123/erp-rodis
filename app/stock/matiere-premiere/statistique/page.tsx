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
    const { data, error } = await applyFilters(supabaseServer.from(table).select(columns)).range(
      from,
      from + pageSize - 1
    );
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

// Colonnes du rapport riche (copie fidele des fichiers "INV <gamme>.xlsx"
// fournis par l'utilisateur), dans l'ordre exact du fichier source - pas
// d'ordre garanti cote jsonb, donc l'ordre d'affichage est fixe ici.
const RAPPORT_COLUMNS_BY_GAMME: Record<string, string[]> = {
  "MP COSM": [
    "Gamme",
    "stock",
    "en cours d'achat BC",
    "Qte BC et Date",
    "en cour d'achat 4D",
    "date le livraison prevu ds 4d",
    "avis",
    "statistique 4D 6 mois",
    "Statistique 6mois calculé",
    "A COMMANDER",
    "__SPACER__",
    "tonnage 1 tc",
    "conso 1mois",
    "Conso reelle 12mois",
    "conso 9Mois",
    "conso 4mois",
  ],
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

type SearchParams = Promise<{
  gammeStatistique?: string;
}>;

export default async function StatistiqueMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const gammeStatistique = (params.gammeStatistique || "").trim();

  const { rows: allArticles, error: fetchError } = await fetchAllArticlesMp();

  let rapportRows: RapportRow[] = [];
  if (gammeStatistique) {
    const { data } = await supabaseServer
      .from("rapport_gamme_statistique_mp")
      .select("id, ordre, designation, categorie, donnees")
      .eq("gamme_statistique", gammeStatistique)
      .order("ordre", { ascending: true });
    rapportRows = (data ?? []) as RapportRow[];
  }
  const rapportColumns = RAPPORT_COLUMNS_BY_GAMME[gammeStatistique] || [];

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
      qteBcEtDate: string;
      enCours4d: number;
      date4d: string;
      aCommander: number;
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
        fetchAllRows<{ article_id: number | null; qte_entree: number; qte_sortie: number }>(
          "lots_stock_matiere_premiere",
          "article_id, qte_entree, qte_sortie",
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
      for (const lot of lotsRows) {
        if (!lot.article_id) continue;
        const mouvement = Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0);
        stockByArticleId.set(lot.article_id, (stockByArticleId.get(lot.article_id) ?? 0) + mouvement);
      }

      const bcLigneIds = bcLignes.map((ligne) => ligne.id);
      const [importData, statutRows] = await Promise.all([
        bcLigneIds.length > 0
          ? fetchAllRows<{
              bc_ligne_id: number;
              quantite_importee: number;
              n_doss_4d_import: string | null;
              n_doss_erp_import: string | null;
            }>(
              "bons_commande_mp_imports",
              "bc_ligne_id, quantite_importee, n_doss_4d_import, n_doss_erp_import",
              (query) => query.is("lot_stock_id", null).in("bc_ligne_id", bcLigneIds)
            )
          : Promise.resolve([]),
        fetchAllRows<{
          n_doss_4d: string | null;
          n_doss_erp: string | null;
          statut: string;
          date_prevue_reception: string | null;
        }>("dossiers_import_mp_statut", "n_doss_4d, n_doss_erp, statut, date_prevue_reception"),
      ]);

      const importeeByLigneId = new Map<number, number>();
      for (const evenement of importData) {
        importeeByLigneId.set(
          evenement.bc_ligne_id,
          (importeeByLigneId.get(evenement.bc_ligne_id) ?? 0) + Number(evenement.quantite_importee ?? 0)
        );
      }

      // "En cours d'achat 4D" : les evenements d'import (dossier 4D/ERP) pas
      // encore au statut final "Receptionne Rodis" - suivi independant du
      // statut de la ligne BC elle-meme (meme logique que la page Import MP).
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
        // les 193 lignes : (stock + en cours d'achat BC + en cour d'achat
        // 4D) - statistique 4D 6 mois (celle-ci reste saisie a la main,
        // donnees[...], pas une valeur live de cette page).
        const statistique4d6Mois = Number(row.donnees?.["statistique 4D 6 mois"] ?? 0);
        liveDataByRapportRowId.set(row.id, {
          gamme: article?.gamme ?? null,
          stock,
          enCoursBc,
          qteBcEtDate: openLignes
            .map((ligne) => {
              const dossier = [ligne.nDoss4d, ligne.nDossErp].filter(Boolean).join(" / ");
              return `${ligne.quantite}${dossier ? " " + dossier : ""} du ${formatDate(ligne.date_jour)}`;
            })
            .join(" / "),
          enCours4d,
          date4d: open4dLignes
            .map(
              (ligne) =>
                `${ligne.quantite} ${ligne.nDoss4d || ""} ${
                  ligne.datePrevueReception ? formatDate(ligne.datePrevueReception) : "date prevue non saisie"
                }`
            )
            .join(" / "),
          aCommander: stock + enCoursBc + enCours4d - statistique4d6Mois,
        });
      }
    }
  }

  // Un bouton uniquement pour les gammes qui ont deja un vrai rapport
  // fourni par l'utilisateur (RAPPORT_COLUMNS_BY_GAMME) - pas un bouton
  // par valeur Gamme Statistique presente en base (il y en a des dizaines,
  // la plupart sans rien derriere) : "n'ajoute pas de nom, laisse vide tant
  // que je ne l'ai pas donne".
  const gammeStatistiqueCounts = new Map<string, number>();
  for (const article of allArticles) {
    const value = (article.gamme_statistique || "").trim();
    if (!value || !(value in RAPPORT_COLUMNS_BY_GAMME)) continue;
    gammeStatistiqueCounts.set(value, (gammeStatistiqueCounts.get(value) || 0) + 1);
  }
  const gammeStatistiqueButtons = [...gammeStatistiqueCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const articlesSansGamme = allArticles.filter((article) => !(article.gamme_statistique || "").trim());

  const articlesForSelected = gammeStatistique
    ? allArticles.filter((article) => (article.gamme_statistique || "").trim() === gammeStatistique)
    : [];

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "statistiqueMp");

  const rowsWithLive: RapportRowWithLive[] = rapportRows.map((row) => ({
    id: row.id,
    ordre: row.ordre,
    designation: row.designation,
    categorie: row.categorie,
    donnees: row.donnees,
    live: liveDataByRapportRowId.get(row.id) ?? null,
  }));

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
              <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Gamme Statistique</th>
                        <th className="px-6 py-4 font-semibold">Nombre d&apos;articles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gammeStatistiqueButtons.map(([value, count]) => (
                        <tr key={value} className="border-t border-slate-100">
                          <td className="px-6 py-4 font-medium text-slate-900">
                            <Link
                              href={`/stock/matiere-premiere/statistique?gammeStatistique=${encodeURIComponent(value)}`}
                              className="hover:underline"
                            >
                              {value}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{count}</td>
                        </tr>
                      ))}
                      {articlesSansGamme.length > 0 ? (
                        <tr className="border-t border-slate-100 bg-amber-50/50">
                          <td className="px-6 py-4 font-medium text-amber-900">
                            Sans Gamme Statistique
                          </td>
                          <td className="px-6 py-4 text-amber-900">{articlesSansGamme.length}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : rapportRows.length > 0 ? (
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
                  rapportColumns={rapportColumns}
                  rows={rowsWithLive}
                  canEdit={canEdit}
                  saveAction={saveRapportGammeStatistiqueAction}
                />
              </>
            ) : (
              <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Article</th>
                        <th className="px-6 py-4 font-semibold">Categorie</th>
                        <th className="px-6 py-4 font-semibold">Unite</th>
                        <th className="px-6 py-4 font-semibold">Gamme</th>
                        <th className="px-6 py-4 font-semibold">Stock min</th>
                        <th className="px-6 py-4 font-semibold">Stock max</th>
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
