import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteLotStockAction, updateLotStockAction } from "./actions";
import { PersistPageFilters } from "@/app/_components/persist-page-filters";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

const PAGE_SIZE = 200;

type SearchParams = Promise<{
  page?: string;
  article_q?: string;
  code_q?: string;
  chambre?: string;
  pays?: string;
  date_from?: string;
  date_to?: string;
  month_from?: string;
  month_to?: string;
  year?: string;
  hide_zero?: string;
}>;

type StockMovementRow = {
  id: number;
  article_id: number | null;
  numero_lot: string;
  date_fabrication: string | null;
  date_jour: string | null;
  qte_entree: number;
  qte_sortie: number;
  chambre: string | null;
  code_pays: string | null;
  note: string | null;
  created_at: string | null;
  source_import: string | null;
  articles: {
    nom_article: string;
    type_article: string | null;
    marque: string | null;
    gamme: string | null;
  } | null;
};

type DisplayStockRow = StockMovementRow & {
  display_key: string;
  mouvement_type: "entree" | "sortie";
  stock_code: number;
  stock_article: number;
  code_sortie: string | null;
  livre_pour: string | null;
  numero_bl: string | null;
  preparateur: string | null;
  numero_proforma: string | null;
};

function parseLatestSortieMeta(note: string | null, sourceImport: string | null) {
  const empty = {
    code_sortie: null,
    livre_pour: null,
    numero_bl: null,
    preparateur: null,
    numero_proforma: null,
  };

  if (!note) {
    return empty;
  }

  const lines = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    if (!line.startsWith("SORTIEWEB|")) {
      if (!line.startsWith("SORTIEIMPORT|")) {
        continue;
      }
    }

    const parts = line.split("|");
    const code = parts[2] || "";
    const livrePour = parts[3] || "";
    let numeroBl = parts[4] || "";
    const preparateur = parts.length >= 7 ? parts[5] || "" : "";
    let numeroProforma = parts.length >= 9 ? parts[8] || "" : "";

    // Anciennes livraisons de commande (avant le 2026-08-11) : le numero de
    // proforma etait glisse par erreur dans le champ BL - meme correctif
    // que app/mouvements/shared.ts (parseSortieMeta), uniquement pour ces
    // lignes historiques de livraison, jamais les sorties manuelles.
    if (!numeroProforma && sourceImport === "web:sortie-commande" && numeroBl && numeroBl !== "-") {
      numeroProforma = numeroBl;
      numeroBl = "";
    }

    return {
      code_sortie: code && code !== "-" ? code : null,
      livre_pour: livrePour && livrePour !== "-" ? livrePour : null,
      numero_bl: numeroBl && numeroBl !== "-" ? numeroBl : null,
      preparateur: preparateur && preparateur !== "-" ? preparateur : null,
      numero_proforma: numeroProforma && numeroProforma !== "-" ? numeroProforma : null,
    };
  }

  return empty;
}

function buildCodeKey(articleId: number | null, numeroLot: string | null | undefined) {
  return `${articleId ?? 0}::${String(numeroLot || "").trim().toUpperCase()}`;
}

function parseMonthValue(value: string) {
  const month = Number(value || "0");
  if (Number.isNaN(month) || month < 1 || month > 12) {
    return 0;
  }
  return month;
}

function parseYearValue(value: string) {
  const year = Number(value || "0");
  if (Number.isNaN(year) || year < 2000 || year > 2100) {
    return 0;
  }
  return year;
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentStockUser = await getCurrentStockUser();
  const canEditStock = await canWritePageUser(currentStockUser, "stock");
  const canDeleteStock = await canDeletePageUser(currentStockUser, "stock");
  const [canWriteMouvementsEntree, canWriteMouvementsSortie] = await Promise.all([
    canWritePageUser(currentStockUser, "mouvementsEntree"),
    canWritePageUser(currentStockUser, "mouvementsSortie"),
  ]);
  const canWriteMouvements = canWriteMouvementsEntree || canWriteMouvementsSortie;
  const articleQ = (params.article_q || "").trim();
  const codeQ = (params.code_q || "").trim();
  const chambre = (params.chambre || "").trim();
  const pays = (params.pays || "").trim();
  const dateFrom = (params.date_from || "").trim();
  const dateTo = (params.date_to || "").trim();
  const monthFrom = parseMonthValue((params.month_from || "").trim());
  const monthTo = parseMonthValue((params.month_to || "").trim());
  const selectedYear = parseYearValue((params.year || "").trim());
  const hideZeroStock = (params.hide_zero || "").trim() === "1";
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: articleSuggestionsData } = await supabaseServer
    .from("articles")
    .select("id, nom_article")
    .order("nom_article", { ascending: true })
    .limit(5000);

  const matchingArticleIds = articleQ
    ? (
        (
          await supabaseServer
            .from("articles")
            .select("id")
            .or(
              `nom_article.ilike.%${articleQ}%,type_article.ilike.%${articleQ}%,marque.ilike.%${articleQ}%,gamme.ilike.%${articleQ}%`
            )
            .limit(1000)
        ).data ?? []
      ).map((row) => row.id)
    : [];

  // PostgREST plafonne chaque requete a son max-rows interne (~1000) peu
  // importe le .range() demande - un seul appel .range(0, 19999) ne
  // retournait en realite qu'une fraction des lignes, faisant disparaitre
  // silencieusement la plupart des mouvements de la liste.
  const rawRows: StockMovementRow[] = [];
  let fetchError: { message: string } | null = null;
  let stockFrom = 0;
  const stockPageSize = 1000;

  while (true) {
    let stockQuery = supabaseServer
      .from("lots_stock")
      .select(
        "id, article_id, numero_lot, date_fabrication, date_jour, qte_entree, qte_sortie, chambre, code_pays, note, created_at, source_import, articles!inner(nom_article, type_article, marque, gamme)"
      )
      .order("id", { ascending: false })
      .range(stockFrom, stockFrom + stockPageSize - 1);

    if (articleQ) {
      if (matchingArticleIds.length === 0) {
        stockQuery = stockQuery.eq("article_id", -1);
      } else {
        stockQuery = stockQuery.in("article_id", matchingArticleIds);
      }
    }

    if (codeQ) {
      stockQuery = stockQuery.ilike("numero_lot", `%${codeQ}%`);
    }

    if (chambre) {
      stockQuery = stockQuery.ilike("chambre", `%${chambre}%`);
    }

    if (pays) {
      stockQuery = stockQuery.ilike("code_pays", `%${pays}%`);
    }

    const { data, error } = await stockQuery;

    if (error) {
      fetchError = error;
      break;
    }

    const chunk = (data as unknown as StockMovementRow[] | null) ?? [];
    rawRows.push(...chunk);

    if (chunk.length < stockPageSize) break;
    stockFrom += stockPageSize;
  }

  const error = fetchError;
  const articleSuggestions =
    ((articleSuggestionsData as { id: number; nom_article: string }[] | null) ?? []).map(
      (article) => article.nom_article
    );
  const articleOptions = [...new Set(articleSuggestions)].map((label, index) => ({ id: index, label }));

  const displaySourceRows = rawRows.flatMap((row) => {
    const rows: StockMovementRow[] = [];

    if (Number(row.qte_entree ?? 0) > 0) {
      rows.push({
        ...row,
        qte_sortie: 0,
      });
    }

    if (Number(row.qte_sortie ?? 0) > 0) {
      rows.push({
        ...row,
        qte_entree: 0,
      });
    }

    if (rows.length === 0) {
      rows.push(row);
    }

    return rows;
  });

  const stockCodeTotals = new Map<string, number>();

  for (const row of displaySourceRows) {
    const key = buildCodeKey(row.article_id, row.numero_lot);
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockCodeTotals.set(key, Number(stockCodeTotals.get(key) ?? 0) + mouvement);
  }

  const runningStockByArticle = new Map<number, number>();
  const rowsWithStock = [...displaySourceRows]
    .sort((a, b) => {
      const dateA = a.date_jour ? new Date(a.date_jour).getTime() : 0;
      const dateB = b.date_jour ? new Date(b.date_jour).getTime() : 0;

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      // A date egale, une entree precede toujours une sortie : sinon le
      // solde cumulatif peut passer par une valeur negative artificielle
      // le temps d'une seule journee, meme quand le stock reel ne l'a
      // jamais ete (l'id ne reflete pas l'ordre reel des mouvements).
      const entreeA = Number(a.qte_entree ?? 0) > 0 ? 0 : 1;
      const entreeB = Number(b.qte_entree ?? 0) > 0 ? 0 : 1;
      if (entreeA !== entreeB) return entreeA - entreeB;

      return a.id - b.id;
    })
    .map((row): DisplayStockRow => {
      const previousArticle = row.article_id
        ? runningStockByArticle.get(row.article_id) ?? 0
        : 0;

      const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
      const stockCode = Number(
        stockCodeTotals.get(buildCodeKey(row.article_id, row.numero_lot)) ?? 0
      );
      const stockArticle = previousArticle + mouvement;

      if (row.article_id) {
        runningStockByArticle.set(row.article_id, stockArticle);
      }

      return {
        ...row,
        display_key: `${row.id}-${Number(row.qte_entree ?? 0) > 0 ? "entree" : "sortie"}`,
        mouvement_type: Number(row.qte_entree ?? 0) > 0 ? "entree" : "sortie",
        stock_code: stockCode,
        stock_article: stockArticle,
        ...parseLatestSortieMeta(row.note, row.source_import),
      };
    })
    .sort((a, b) => {
      const dateA = a.date_jour ? new Date(a.date_jour).getTime() : 0;
      const dateB = b.date_jour ? new Date(b.date_jour).getTime() : 0;

      if (dateB !== dateA) {
        return dateB - dateA;
      }

      return b.id - a.id;
    });

  const filteredRows = rowsWithStock.filter((row) => {
    if (hideZeroStock && row.stock_code <= 0) {
      return false;
    }

    if (!row.date_jour) {
      return !dateFrom && !dateTo && !monthFrom && !monthTo && !selectedYear;
    }

    const rowDate = new Date(row.date_jour);
    const rowDateValue = rowDate.getTime();
    const rowMonth = rowDate.getMonth() + 1;
    const rowYear = rowDate.getFullYear();

    if (dateFrom) {
      const fromDateValue = new Date(dateFrom).getTime();
      if (rowDateValue < fromDateValue) {
        return false;
      }
    }

    if (dateTo) {
      const toDateValue = new Date(dateTo).getTime();
      if (rowDateValue > toDateValue) {
        return false;
      }
    }

    if (selectedYear && rowYear !== selectedYear) {
      return false;
    }

    if (monthFrom && rowMonth < monthFrom) {
      return false;
    }

    if (monthTo && rowMonth > monthTo) {
      return false;
    }

    return true;
  });

  const pagedRows = filteredRows.slice(from, to + 1);
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const totalEntree = pagedRows.reduce((sum, row) => sum + Number(row.qte_entree ?? 0), 0);
  const totalSortie = pagedRows.reduce((sum, row) => sum + Number(row.qte_sortie ?? 0), 0);
  const totalStockArticle = new Map<number, number>();

  for (const row of filteredRows) {
    if (!row.article_id) continue;
    totalStockArticle.set(row.article_id, row.stock_article);
  }

  const totalStockVisible = [...new Set(pagedRows.map((row) => row.article_id).filter(Boolean))]
    .map((articleId) => Number(totalStockArticle.get(Number(articleId)) ?? 0))
    .reduce((sum, value) => sum + value, 0);

  const availableYears = [...new Set(
    rowsWithStock
      .map((row) => (row.date_jour ? new Date(row.date_jour).getFullYear() : 0))
      .filter((year) => year > 0)
  )].sort((a, b) => b - a);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef5f0_0%,#f8fbf8_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <PersistPageFilters />
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Stock depuis la feuille Entrer
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Cette page suit les lignes du fichier Excel entrer avec entree, sortie, stock code et stock article.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/gestion-stock-pf" label="Retour gestion stock PF" />
              <RefreshButton />
              {canWriteMouvements ? (
                <>
                  <Link
                    href="/mouvements/produit-fini#entree-stock"
                    className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Entrer
                  </Link>
                  <Link
                    href="/mouvements/produit-fini#sortie-stock"
                    className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Sortie
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
            <SearchableFilterInput
              name="article_q"
              defaultValue={articleQ}
              options={articleOptions}
              placeholder="Ecrire article..."
            />
            <input
              type="text"
              name="code_q"
              defaultValue={codeQ}
              placeholder="Ecrire code / lot..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              autoComplete="off"
            />
            <input
              type="text"
              name="chambre"
              defaultValue={chambre}
              placeholder="Chambre..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="pays"
              defaultValue={pays}
              placeholder="Code pays..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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
              href="/stock"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Effacer
            </Link>
          </form>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
              Entree visible :
              <span className="ml-2 font-bold text-emerald-900">{totalEntree}</span>
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm">
              Sortie visible :
              <span className="ml-2 font-bold text-sky-900">{totalSortie}</span>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              Stock article visible :
              <span className="ml-2 font-bold text-slate-900">{totalStockVisible}</span>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Modification stock</h2>
              {!canEditStock ? (
                <p className="mt-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                  Lecture seule : modification cachee pour cet utilisateur.
                </p>
              ) : null}
              <p className="mt-1 text-sm text-slate-600">
                Le site est deja ouvert avec connexion. Tu peux modifier les lignes
                directement ici.
              </p>
            </div>

            <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
              Connecte : {currentStockUser ?? "-"}
            </span>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : pagedRows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune ligne stock trouvee.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Type</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Gamme</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Lot</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date fab.</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Entree</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Sortie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Stock code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Stock article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Chambre</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code pays</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code sortie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Client</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Proforma</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Numero BL</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Preparateur</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date de saisie</th>
                    {canEditStock || canDeleteStock ? <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Modifier</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.display_key} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.date_jour)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.articles?.nom_article || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.articles?.type_article || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.articles?.gamme || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.numero_lot}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.date_fabrication)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {row.mouvement_type === "entree" ? row.qte_entree : 0}
                      </td>
                      <td className="px-4 py-3 font-semibold text-sky-700">
                        {row.mouvement_type === "sortie" ? row.qte_sortie : 0}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.stock_code}</td>
                      <td className="px-4 py-3 font-semibold text-fuchsia-700">{row.stock_article}</td>
                      <td className="px-4 py-3 text-slate-600">{row.chambre || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.code_pays || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.code_sortie || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.livre_pour || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.numero_proforma || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.numero_bl || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.preparateur || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(row.created_at)}</td>
                      {canEditStock || canDeleteStock ? (
                        <td className="px-4 py-3">
                          <details className="min-w-[20rem] rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                              Modifier
                            </summary>
                            {canEditStock ? (
                            <form action={updateLotStockAction} className="mt-4 grid gap-3">
                              <input type="hidden" name="lot_id" value={row.id} />
                              <input
                                type="text"
                                name="numero_lot"
                                defaultValue={row.numero_lot}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                required
                              />
                              <DateJmaFormField
                                name="date_fabrication"
                                defaultValue={row.date_fabrication}
                                required
                              />
                              <div className="grid gap-3 md:grid-cols-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  name="qte_entree"
                                  defaultValue={row.qte_entree ?? 0}
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                  required
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  name="qte_sortie"
                                  defaultValue={row.qte_sortie ?? 0}
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                  required
                                />
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <input
                                  type="text"
                                  name="chambre"
                                  defaultValue={row.chambre || ""}
                                  placeholder="Chambre"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />
                                <input
                                  type="text"
                                  name="code_pays"
                                  defaultValue={row.code_pays || ""}
                                  placeholder="Code pays"
                                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                                />
                              </div>
                              <textarea
                                name="note"
                                defaultValue={row.note || ""}
                                rows={3}
                                placeholder="Note"
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                              />
                              <SubmitButton
                                pendingLabel="Enregistrement..."
                                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                              >
                                Enregistrer
                              </SubmitButton>
                            </form>
                            ) : null}
                            {canDeleteStock ? (
                            <form action={deleteLotStockAction} className="mt-3">
                              <input type="hidden" name="lot_id" value={row.id} />
                              <DeleteIconButton label="Supprimer ligne" />
                            </form>
                            ) : null}
                          </details>
                        </td>
                      ) : null}
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
                <Link
                  href={`/stock?page=${Math.max(1, currentPage - 1)}&article_q=${encodeURIComponent(articleQ)}&code_q=${encodeURIComponent(codeQ)}&chambre=${encodeURIComponent(chambre)}&pays=${encodeURIComponent(pays)}`}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    currentPage === 1
                      ? "pointer-events-none bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  Precedent
                </Link>
                <Link
                  href={`/stock?page=${Math.min(totalPages, currentPage + 1)}&article_q=${encodeURIComponent(articleQ)}&code_q=${encodeURIComponent(codeQ)}&chambre=${encodeURIComponent(chambre)}&pays=${encodeURIComponent(pays)}`}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    currentPage >= totalPages
                      ? "pointer-events-none bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  Suivant
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

