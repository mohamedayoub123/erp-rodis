import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";
import {
  deleteLotFromEntreeMpDetailAction,
  deleteLotFromSortieMpDetailAction,
  updateLotFromEntreeMpDetailAction,
  updateLotFromSortieMpDetailAction,
} from "@/app/mouvements/matiere-premiere/actions";
import {
  buildEntreeMpRows,
  buildSortieMpRows,
  fetchWebMouvementMpSourceRows,
} from "@/app/mouvements/matiere-premiere/shared";
import { encodeDossierId } from "../commande/dossier-id";

const PAGE_SIZE = 200;

type MouvementRow = {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  code_normalise: string | null;
  date_fabrication: string | null;
  date_expiration: string | null;
  date_jour: string | null;
  qte_entree: number;
  qte_sortie: number;
  unite: string | null;
  fournisseur: string | null;
  client: string | null;
  n_doss_erp: string | null;
  n_doss_4d: string | null;
  utilisateur: string | null;
  note: string | null;
  mouvement_groupe_id: number | null;
  articles_matiere_premiere: {
    nom_article: string;
    gamme: string | null;
    categorie: string | null;
  } | null;
};

type DisplayRow = MouvementRow & {
  display_key: string;
  mouvement_type: "entree" | "sortie";
  stock_code: number;
  stock_article: number;
};

const MOUVEMENTS_MP_COLUMNS =
  "id, article_id, numero_lot, code_normalise, date_fabrication, date_expiration, date_jour, qte_entree, qte_sortie, unite, fournisseur, client, n_doss_erp, n_doss_4d, utilisateur, note, mouvement_groupe_id, articles_matiere_premiere(nom_article, gamme, categorie)";

// La table complete (~40 000 lignes avec l'historique Excel) etait
// rapatriee via une boucle .range() SEQUENTIELLE (une requete attend la
// precedente) - jusqu'a 40 allers-retours reseau l'un apres l'autre avant
// meme de commencer a filtrer, la vraie cause de lenteur de cette page.
// Un premier compte (head:true, pas de donnees) donne le nombre de pages a
// lire, puis toutes les pages sont demandees EN PARALLELE via Promise.all -
// meme volume de donnees, meme resultat, juste sans attendre chaque page
// l'une apres l'autre.
async function fetchAllMouvements() {
  const pageSize = 1000;

  const { count, error: countError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("id", { count: "exact", head: true });

  if (countError) {
    return { rows: [] as MouvementRow[], error: countError };
  }

  const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => {
      const from = index * pageSize;
      return supabaseServer
        .from("lots_stock_matiere_premiere")
        .select(MOUVEMENTS_MP_COLUMNS)
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);
    })
  );

  const rows: MouvementRow[] = [];
  for (const page of pages) {
    if (page.error) {
      return { rows, error: page.error };
    }
    rows.push(...((page.data as unknown as MouvementRow[] | null) ?? []));
  }

  return { rows, error: null };
}

function buildCodeKey(articleId: number | null, numeroLot: string | null | undefined) {
  return `${articleId ?? 0}::${String(numeroLot || "").trim().toUpperCase()}`;
}

function parseMonthValue(value: string) {
  const month = Number(value || "0");
  if (Number.isNaN(month) || month < 1 || month > 12) return 0;
  return month;
}

function parseYearValue(value: string) {
  const year = Number(value || "0");
  if (Number.isNaN(year) || year < 2000 || year > 2100) return 0;
  return year;
}

type SearchParams = Promise<{
  page?: string;
  q?: string;
  code_q?: string;
  date_from?: string;
  date_to?: string;
  month_from?: string;
  month_to?: string;
  year?: string;
  hide_zero?: string;
}>;

export default async function StockMatierePremiereStockPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const currentStockUser = await getCurrentStockUser();
  const [canEditEntree, canEditSortie, canDeleteEntree, canDeleteSortie] = await Promise.all([
    canWritePageUser(currentStockUser, "mouvementsMatierePremiereEntreeDetail"),
    canWritePageUser(currentStockUser, "mouvementsMatierePremiereSortieDetail"),
    canDeletePageUser(currentStockUser, "mouvementsMatierePremiereEntreeDetail"),
    canDeletePageUser(currentStockUser, "mouvementsMatierePremiereSortieDetail"),
  ]);
  const q = (params.q || "").trim().toLowerCase();
  const codeQ = (params.code_q || "").trim().toLowerCase();
  const dateFrom = (params.date_from || "").trim();
  const dateTo = (params.date_to || "").trim();
  const monthFrom = parseMonthValue((params.month_from || "").trim());
  const monthTo = parseMonthValue((params.month_to || "").trim());
  const selectedYear = parseYearValue((params.year || "").trim());
  const hideZeroStock = (params.hide_zero || "").trim() === "1";
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [{ rows: rawRows, error }, { data: articleSuggestionsData }, webSourceRows] = await Promise.all([
    fetchAllMouvements(),
    supabaseServer
      .from("articles_matiere_premiere")
      .select("nom_article")
      .order("nom_article", { ascending: true })
      .limit(5000),
    fetchWebMouvementMpSourceRows(),
  ]);

  const articleSuggestions = ((articleSuggestionsData as { nom_article: string }[] | null) ?? []).map(
    (article) => article.nom_article
  );

  // Code TE/TS (meme numerotation que la page Mouvements MP) par
  // mouvement_groupe_id, pour pouvoir renvoyer directement vers le
  // mouvement d'origine depuis Stock MP.
  const mouvementCodeByGroupe = new Map<number, { code: string; type: "entree" | "sortie" }>();
  for (const group of buildEntreeMpRows(webSourceRows)) {
    mouvementCodeByGroupe.set(group.groupe_id, { code: group.code, type: "entree" });
  }
  for (const group of buildSortieMpRows(webSourceRows)) {
    mouvementCodeByGroupe.set(group.groupe_id, { code: group.code, type: "sortie" });
  }

  // Meme calcul que /stock (PF) : chaque ligne du grand livre est affichee
  // separement en entree OU en sortie (jamais les deux sur la meme ligne),
  // "stock code" = somme entree-sortie de tout le lot, "stock article" =
  // solde cumulatif de l'article au fil des mouvements (ordre chronologique).
  const displaySourceRows = rawRows.flatMap((row) => {
    const rows: MouvementRow[] = [];
    if (Number(row.qte_entree ?? 0) > 0) rows.push({ ...row, qte_sortie: 0 });
    if (Number(row.qte_sortie ?? 0) > 0) rows.push({ ...row, qte_entree: 0 });
    if (rows.length === 0) rows.push(row);
    return rows;
  });

  const stockCodeTotals = new Map<string, number>();
  for (const row of displaySourceRows) {
    const key = buildCodeKey(row.article_id, row.numero_lot || row.code_normalise);
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockCodeTotals.set(key, Number(stockCodeTotals.get(key) ?? 0) + mouvement);
  }

  // date_jour est une colonne Postgres "date" (pas "timestamp"), toujours
  // servie par PostgREST au format ISO "AAAA-MM-JJ" sans heure - une simple
  // comparaison de chaines trie exactement comme new Date(...).getTime(),
  // mais sans l'allocation d'un objet Date par comparaison. Sur ~40 000
  // lignes tirees deux fois (les deux .sort() ci-dessous), c'etait devenu le
  // vrai goulot d'etranglement de cette page une fois le reseau parallelise.
  const runningStockByArticle = new Map<number, number>();
  const rowsWithStock = [...displaySourceRows]
    .sort((a, b) => {
      const dateA = a.date_jour || "";
      const dateB = b.date_jour || "";
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      return a.id - b.id;
    })
    .map((row): DisplayRow => {
      const previousArticle = row.article_id ? runningStockByArticle.get(row.article_id) ?? 0 : 0;
      const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
      const stockCode = Number(
        stockCodeTotals.get(buildCodeKey(row.article_id, row.numero_lot || row.code_normalise)) ?? 0
      );
      const stockArticle = previousArticle + mouvement;

      if (row.article_id) runningStockByArticle.set(row.article_id, stockArticle);

      return {
        ...row,
        display_key: `${row.id}-${Number(row.qte_entree ?? 0) > 0 ? "entree" : "sortie"}`,
        mouvement_type: Number(row.qte_entree ?? 0) > 0 ? "entree" : "sortie",
        stock_code: stockCode,
        stock_article: stockArticle,
      };
    })
    .sort((a, b) => {
      const dateA = a.date_jour || "";
      const dateB = b.date_jour || "";
      if (dateB !== dateA) return dateB < dateA ? -1 : 1;
      return b.id - a.id;
    });

  const availableYears = [
    ...new Set(
      rowsWithStock
        .map((row) => (row.date_jour ? Number(row.date_jour.slice(0, 4)) : 0))
        .filter((year) => year > 0)
    ),
  ].sort((a, b) => b - a);

  const filteredRows = rowsWithStock.filter((row) => {
    if (hideZeroStock && row.stock_code <= 0) return false;
    if (q && !matchesArticleSearch(row.articles_matiere_premiere?.nom_article, q)) return false;
    if (codeQ && !String(row.numero_lot || "").toLowerCase().includes(codeQ)) return false;

    if (!row.date_jour) {
      return !dateFrom && !dateTo && !monthFrom && !monthTo && !selectedYear;
    }

    // row.date_jour, dateFrom et dateTo sont tous au format ISO "AAAA-MM-JJ"
    // (colonne Postgres "date" / <input type="date">) - comparaison de
    // chaines directe, meme resultat qu'avec new Date(...).getTime() mais
    // sans creer un objet Date par ligne filtree.
    const rowMonth = Number(row.date_jour.slice(5, 7));
    const rowYear = Number(row.date_jour.slice(0, 4));

    if (dateFrom && row.date_jour < dateFrom) return false;
    if (dateTo && row.date_jour > dateTo) return false;
    if (selectedYear && rowYear !== selectedYear) return false;
    if (monthFrom && rowMonth < monthFrom) return false;
    if (monthTo && rowMonth > monthTo) return false;

    return true;
  });

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pagedRows = filteredRows.slice(from, to + 1);
  const totalEntree = pagedRows.reduce((sum, row) => sum + Number(row.qte_entree ?? 0), 0);
  const totalSortie = pagedRows.reduce((sum, row) => sum + Number(row.qte_sortie ?? 0), 0);

  function buildPageHref(page: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (codeQ) search.set("code_q", codeQ);
    if (dateFrom) search.set("date_from", dateFrom);
    if (dateTo) search.set("date_to", dateTo);
    if (monthFrom) search.set("month_from", String(monthFrom));
    if (monthTo) search.set("month_to", String(monthTo));
    if (selectedYear) search.set("year", String(selectedYear));
    if (hideZeroStock) search.set("hide_zero", "1");
    if (page > 1) search.set("page", String(page));
    const qs = search.toString();
    return qs ? `/stock/matiere-premiere/stock?${qs}` : "/stock/matiere-premiere/stock";
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Stock Matiere Premiere
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Chaque mouvement TE/TS sur sa propre ligne (Entree ou Sortie), comme la
                page Stock PF.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
            <input
              type="text"
              list="stock-mp-articles-list"
              name="q"
              defaultValue={q}
              placeholder="Ecrire article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              autoComplete="off"
            />
            <datalist id="stock-mp-articles-list">
              {articleSuggestions.map((articleName) => (
                <option key={articleName} value={articleName} />
              ))}
            </datalist>
            <input
              type="text"
              name="code_q"
              defaultValue={codeQ}
              placeholder="Ecrire numero de lot..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              autoComplete="off"
            />
            <input
              type="date"
              name="date_from"
              defaultValue={dateFrom}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="date"
              name="date_to"
              defaultValue={dateTo}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <select
              name="month_from"
              defaultValue={monthFrom ? String(monthFrom) : ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Mois debut</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={`month-from-${month}`} value={month}>
                  {month}
                </option>
              ))}
            </select>
            <select
              name="month_to"
              defaultValue={monthTo ? String(monthTo) : ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Mois fin</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={`month-to-${month}`} value={month}>
                  {month}
                </option>
              ))}
            </select>
            <select
              name="year"
              defaultValue={selectedYear ? String(selectedYear) : ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Annee</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="hide_zero"
                value="1"
                defaultChecked={hideZeroStock}
                className="h-4 w-4"
              />
              Cacher stock a 0
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            <Link
              href="/stock/matiere-premiere/stock"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
              Entree visible :
              <span className="ml-2 font-bold text-emerald-900">{totalEntree}</span>
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm">
              Sortie visible :
              <span className="ml-2 font-bold text-sky-900">{totalSortie}</span>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="p-6 text-sm text-red-700">{error.message}</div>
          ) : pagedRows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucun mouvement matiere premiere enregistre.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Article</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">TE/TS</th>
                    <th className="px-4 py-3 font-semibold">Categorie</th>
                    <th className="px-4 py-3 font-semibold">Gamme</th>
                    <th className="px-4 py-3 font-semibold">Lot</th>
                    <th className="px-4 py-3 font-semibold">Unite</th>
                    <th className="px-4 py-3 font-semibold">Date fab.</th>
                    <th className="px-4 py-3 font-semibold">Date exp.</th>
                    <th className="px-4 py-3 font-semibold">Entree</th>
                    <th className="px-4 py-3 font-semibold">Sortie</th>
                    <th className="px-4 py-3 font-semibold">Stock code</th>
                    <th className="px-4 py-3 font-semibold">Stock article</th>
                    <th className="px-4 py-3 font-semibold">Fournisseur / Client</th>
                    <th className="px-4 py-3 font-semibold">Doss. ERP</th>
                    <th className="px-4 py-3 font-semibold">Doss. 4D</th>
                    <th className="px-4 py-3 font-semibold">Import</th>
                    <th className="px-4 py-3 font-semibold">Note</th>
                    <th className="px-4 py-3 font-semibold">Saisi par</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.display_key} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.date_jour)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.articles_matiere_premiere?.nom_article || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.mouvement_type === "entree" ? "Entree" : "Sortie"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {(() => {
                          const mouvement = row.mouvement_groupe_id
                            ? mouvementCodeByGroupe.get(row.mouvement_groupe_id)
                            : null;
                          if (!mouvement) return "-";
                          return (
                            <Link
                              href={
                                mouvement.type === "entree"
                                  ? `/mouvements/matiere-premiere/entrees/${row.mouvement_groupe_id}`
                                  : `/mouvements/matiere-premiere/sorties/${row.mouvement_groupe_id}`
                              }
                              className="font-semibold text-sky-700 underline"
                            >
                              {mouvement.code}
                            </Link>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.articles_matiere_premiere?.categorie || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.articles_matiere_premiere?.gamme || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.numero_lot || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.date_fabrication)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.date_expiration)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {row.mouvement_type === "entree" ? row.qte_entree : 0}
                      </td>
                      <td className="px-4 py-3 font-semibold text-sky-700">
                        {row.mouvement_type === "sortie" ? row.qte_sortie : 0}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.stock_code}</td>
                      <td className="px-4 py-3 font-semibold text-fuchsia-700">{row.stock_article}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.mouvement_type === "entree" ? row.fournisseur || "-" : row.client || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.n_doss_erp || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.n_doss_4d || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.n_doss_4d || row.n_doss_erp ? (
                          <Link
                            href={`/stock/matiere-premiere/commande/${encodeDossierId(
                              row.n_doss_4d,
                              row.n_doss_erp
                            )}`}
                            className="font-semibold text-sky-700 underline"
                          >
                            {row.n_doss_4d || row.n_doss_erp}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.note || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.utilisateur || "-"}</td>
                      <td className="px-4 py-3">
                        {row.mouvement_type === "entree" && (canEditEntree || canDeleteEntree) ? (
                          <div className="flex items-start gap-2">
                            {canEditEntree ? (
                            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                                Modifier
                              </summary>
                              <form
                                action={updateLotFromEntreeMpDetailAction}
                                className="mt-2 grid w-64 gap-2"
                              >
                                <input type="hidden" name="lot_id" value={row.id} />
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Quantite
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    name="quantite"
                                    defaultValue={row.qte_entree}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                    required
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Lot
                                  <input
                                    type="text"
                                    name="numero_lot"
                                    defaultValue={row.numero_lot || ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Fabrication
                                  <input
                                    type="date"
                                    name="date_fabrication"
                                    defaultValue={row.date_fabrication || ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Expiration
                                  <input
                                    type="date"
                                    name="date_expiration"
                                    defaultValue={row.date_expiration || ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Fournisseur
                                  <input
                                    type="text"
                                    name="fournisseur"
                                    defaultValue={row.fournisseur || ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Note
                                  <input
                                    type="text"
                                    name="note"
                                    defaultValue={row.note || ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                  />
                                </label>
                                <button
                                  type="submit"
                                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Enregistrer
                                </button>
                              </form>
                            </details>
                            ) : null}
                            {canDeleteEntree ? (
                            <form action={deleteLotFromEntreeMpDetailAction}>
                              <input type="hidden" name="lot_id" value={row.id} />
                              <DeleteIconButton label="Supprimer ligne" />
                            </form>
                            ) : null}
                          </div>
                        ) : row.mouvement_type === "sortie" && (canEditSortie || canDeleteSortie) ? (
                          <div className="flex items-start gap-2">
                            {canEditSortie ? (
                            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                                Modifier
                              </summary>
                              <form
                                action={updateLotFromSortieMpDetailAction}
                                className="mt-2 grid w-56 gap-2"
                              >
                                <input type="hidden" name="lot_id" value={row.id} />
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Quantite
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    name="quantite"
                                    defaultValue={row.qte_sortie}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                    required
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Client
                                  <input
                                    type="text"
                                    name="client"
                                    defaultValue={row.client || ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Note
                                  <input
                                    type="text"
                                    name="note"
                                    defaultValue={row.note || ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                  />
                                </label>
                                <button
                                  type="submit"
                                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Enregistrer
                                </button>
                              </form>
                            </details>
                            ) : null}
                            {canDeleteSortie ? (
                            <form action={deleteLotFromSortieMpDetailAction}>
                              <input type="hidden" name="lot_id" value={row.id} />
                              <DeleteIconButton label="Supprimer ligne" />
                            </form>
                            ) : null}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!error && totalRows > 0 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 text-sm">
              <p className="text-slate-500">
                Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows}
              </p>

              <div className="flex gap-3">
                {currentPage > 1 ? (
                  <a
                    href={buildPageHref(currentPage - 1)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Precedent
                  </a>
                ) : null}
                {currentPage < totalPages ? (
                  <a
                    href={buildPageHref(currentPage + 1)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Suivant
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
