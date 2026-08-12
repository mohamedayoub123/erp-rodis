import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { computeStatutBc } from "@/app/stock/matiere-premiere/bc/constants";

// 4 colonnes calculees en direct depuis les vraies donnees de l'appli
// (stock actuel, BC en cours), pas depuis le fichier Excel fige - sinon
// elles deviennent fausses des le lendemain de l'import.
const LIVE_COLUMNS = new Set(["Gamme", "stock", "en cours d'achat BC", "Qte BC et Date"]);

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

// Meme legende que le fichier Excel source (couleur de la cellule ORDRE).
const CATEGORIE_STYLES: Record<string, { bg: string; text: string }> = {
  "FORTE ROTATION": { bg: "#C55A11", text: "#ffffff" },
  "MOYENNE ROTATION": { bg: "#ffffff", text: "#0f172a" },
  DORMANT: { bg: "#BDD7EE", text: "#0f172a" },
  "NEW PROJECT": { bg: "#E2F0D9", text: "#0f172a" },
};

// Notes/legende complete en bas du fichier Excel source (lignes 200-209 de
// "1 INV MP COSMETIQUE.xlsx") - copie fidele du texte et de la couleur de
// fond de chaque ligne.
const NOTES_LEGEND: { text: string; bg: string; textColor?: string; bold?: boolean }[] = [
  { text: "Stock inférieur à 3 mois de conso", bg: "#FFC7CE", textColor: "#C00000", bold: true },
  { text: "Urgent mettre pression sur rimex  STOCK INFERIEUR A CONSO 4 MOIS", bg: "#FFFF00", bold: true },
  {
    text: "Urgent : verifier la date sur le dossier STOCK INFERIEUR A CONSO 4 MOIS/ CHARBEL",
    bg: "#00B050",
    bold: true,
  },
  { text: "stock dormant", bg: "#BDD7EE", bold: true },
  { text: "article important", bg: "#C55A11", bold: true },
  { text: "Stat 6 mois à mettre (nouveaux produits)", bg: "#FFC000" },
  { text: "BC ayant dépassé 3mois sans retour", bg: "#FF5050" },
  { text: "STAT A METTRE A JOUR", bg: "#FFC000", textColor: "#C00000", bold: true },
  { text: "A FAIRE OBLIGATOIREMENT L'INVENTAIRE TOURNANT CHAQ MOIS", bg: "#00B0F0", bold: true },
  { text: "E.T.D : Estimated Time of Departure (Heure estimée de départ)", bg: "transparent" },
];

type RapportRow = {
  id: number;
  ordre: number;
  designation: string;
  categorie: string | null;
  donnees: Record<string, string | number | null>;
};

function formatCellValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }
  return value;
}

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
    { gamme: string | null; stock: number; enCoursBc: number; qteBcEtDate: string }
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
        }>("bons_commande_matiere_premiere", "id, article_id, code, quantite, date_jour, statut", (query) =>
          query.in("article_id", matchedArticleIds)
        ),
      ]);

      const stockByArticleId = new Map<number, number>();
      for (const lot of lotsRows) {
        if (!lot.article_id) continue;
        const mouvement = Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0);
        stockByArticleId.set(lot.article_id, (stockByArticleId.get(lot.article_id) ?? 0) + mouvement);
      }

      const bcLigneIds = bcLignes.map((ligne) => ligne.id);
      const importData =
        bcLigneIds.length > 0
          ? await fetchAllRows<{ bc_ligne_id: number; quantite_importee: number }>(
              "bons_commande_mp_imports",
              "bc_ligne_id, quantite_importee",
              (query) => query.is("lot_stock_id", null).in("bc_ligne_id", bcLigneIds)
            )
          : [];

      const importeeByLigneId = new Map<number, number>();
      for (const evenement of importData) {
        importeeByLigneId.set(
          evenement.bc_ligne_id,
          (importeeByLigneId.get(evenement.bc_ligne_id) ?? 0) + Number(evenement.quantite_importee ?? 0)
        );
      }

      const openBcLignesByArticleId = new Map<
        number,
        { quantite: number; code: string; date_jour: string | null }[]
      >();
      for (const ligne of bcLignes) {
        if (!ligne.article_id) continue;
        const quantite = Number(ligne.quantite ?? 0);
        const quantiteImportee = importeeByLigneId.get(ligne.id) ?? 0;
        const statut = computeStatutBc(quantite, quantiteImportee, ligne.statut);
        if (statut === "Termine") continue;
        const list = openBcLignesByArticleId.get(ligne.article_id) ?? [];
        list.push({ quantite, code: ligne.code, date_jour: ligne.date_jour });
        openBcLignesByArticleId.set(ligne.article_id, list);
      }

      for (const row of rapportRows) {
        const articleId = articleIdByRapportRowId.get(row.id);
        if (!articleId) continue;
        const article = allArticles.find((candidate) => candidate.id === articleId);
        const openLignes = openBcLignesByArticleId.get(articleId) ?? [];
        liveDataByRapportRowId.set(row.id, {
          gamme: article?.gamme ?? null,
          stock: stockByArticleId.get(articleId) ?? 0,
          enCoursBc: openLignes.reduce((sum, ligne) => sum + ligne.quantite, 0),
          qteBcEtDate: openLignes
            .map((ligne) => `${ligne.quantite} ${ligne.code} du ${formatDate(ligne.date_jour)}`)
            .join(" / "),
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
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Legende (rotation)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(CATEGORIE_STYLES).map(([label, style]) => (
                      <span
                        key={label}
                        className="rounded-full px-4 py-1.5 text-xs font-semibold ring-1 ring-black/10"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-4 font-semibold">ORDRE</th>
                          <th className="px-4 py-4 font-semibold">DESIGNATION</th>
                          {rapportColumns.map((col) =>
                            col === "__SPACER__" ? (
                              <th key={col} className="w-6 bg-white p-0" />
                            ) : (
                              <th key={col} className="whitespace-nowrap px-4 py-4 font-semibold">
                                {col}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rapportRows.map((row) => {
                          const style = row.categorie ? CATEGORIE_STYLES[row.categorie] : null;
                          const live = liveDataByRapportRowId.get(row.id);
                          return (
                            <tr key={row.id} className="border-t border-slate-100">
                              <td
                                className="px-4 py-3 text-center font-semibold"
                                style={style ? { backgroundColor: style.bg, color: style.text } : undefined}
                              >
                                {row.ordre}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                                {row.designation}
                              </td>
                              {rapportColumns.map((col) => {
                                if (col === "__SPACER__") {
                                  return <td key={col} className="w-6 bg-white p-0" />;
                                }
                                if (!LIVE_COLUMNS.has(col)) {
                                  return (
                                    <td key={col} className="whitespace-nowrap px-4 py-3 text-slate-600">
                                      {formatCellValue(row.donnees?.[col])}
                                    </td>
                                  );
                                }
                                if (!live) {
                                  return (
                                    <td key={col} className="whitespace-nowrap px-4 py-3 text-amber-700">
                                      article introuvable
                                    </td>
                                  );
                                }
                                let value: string | number = "-";
                                if (col === "Gamme") value = live.gamme ?? "-";
                                if (col === "stock") value = live.stock;
                                if (col === "en cours d'achat BC") value = live.enCoursBc || "-";
                                if (col === "Qte BC et Date") value = live.qteBcEtDate || "-";
                                return (
                                  <td key={col} className="whitespace-nowrap px-4 py-3 text-slate-600">
                                    {formatCellValue(value)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Notes
                  </p>
                  <div className="overflow-hidden rounded-2xl ring-1 ring-black/5">
                    {NOTES_LEGEND.map((note, index) => (
                      <div
                        key={index}
                        className={`px-4 py-2 text-center text-sm ${note.bold ? "font-bold" : "font-medium"}`}
                        style={{
                          backgroundColor: note.bg,
                          color: note.textColor || "#0f172a",
                        }}
                      >
                        {note.text}
                      </div>
                    ))}
                  </div>
                </section>
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
