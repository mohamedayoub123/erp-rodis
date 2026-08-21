import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { formatDate, formatDateTime } from "@/lib/format-date";
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
import { StockMpExportButton } from "./export-button";

const PAGE_SIZE = 200;

type DisplayRow = {
  display_key: string;
  id: number;
  article_id: number | null;
  nom_article: string | null;
  gamme: string | null;
  categorie: string | null;
  mouvement_type: "entree" | "sortie";
  numero_lot: string | null;
  code_normalise: string | null;
  unite: string | null;
  date_fabrication: string | null;
  date_expiration: string | null;
  date_jour: string | null;
  qte_entree: number;
  qte_sortie: number;
  stock_code: number;
  stock_article: number;
  fournisseur: string | null;
  client: string | null;
  n_doss_erp: string | null;
  n_doss_4d: string | null;
  mouvement_groupe_id: number | null;
  note: string | null;
  utilisateur: string | null;
  created_at: string | null;
  total_rows: number;
  total_entree_visible: number;
  total_sortie_visible: number;
};

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

// La table (~2200 lignes) depasse le plafond serveur PostgREST (~1000
// lignes par requete) - .limit(5000) ne le contourne PAS (le plafond
// s'applique avant), donc la moitie des articles (les derniers par ordre
// alphabetique) etait invisible dans "Ecrire article..." tout en restant
// trouvable via le filtre reel (stock_mp_display_rows cherche cote base,
// sans ce plafond) - bug reel signale, meme motif deja corrige sur
// Articles MP (voir fetchAllArticlesMp, app/articles/matiere-premiere/page.tsx).
async function fetchAllArticleNomsMp(): Promise<string[]> {
  const names: string[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("nom_article")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data as { nom_article: string }[] | null) ?? [];
    names.push(...chunk.map((row) => row.nom_article));
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return names;
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

  const [
    { data: rowsData, error },
    articleSuggestions,
    { data: yearsData },
    { data: codesData },
    webSourceRows,
  ] = await Promise.all([
    supabaseServer.rpc("stock_mp_display_rows", {
      p_article_q: q || null,
      p_code_q: codeQ || null,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_month_from: monthFrom || null,
      p_month_to: monthTo || null,
      p_year: selectedYear || null,
      p_hide_zero: hideZeroStock,
      p_limit: PAGE_SIZE,
      p_offset: from,
    }),
    fetchAllArticleNomsMp(),
    supabaseServer.rpc("stock_mp_available_years"),
    supabaseServer.rpc("stock_mp_available_codes"),
    fetchWebMouvementMpSourceRows(),
  ]);

  const pagedRows = (rowsData as DisplayRow[] | null) ?? [];

  const articleOptions = articleSuggestions.map((label, id) => ({ id, label }));
  const availableYears = ((yearsData as { year: number }[] | null) ?? []).map((row) => row.year);
  const codeOptions = ((codesData as { code: string }[] | null) ?? []).map((row, id) => ({
    id,
    label: row.code,
  }));

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

  const totalRows = pagedRows[0]?.total_rows ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const totalEntree = pagedRows[0]?.total_entree_visible ?? 0;
  const totalSortie = pagedRows[0]?.total_sortie_visible ?? 0;

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
              <StockMpExportButton
                filters={{
                  q,
                  codeQ,
                  dateFrom,
                  dateTo,
                  monthFrom,
                  monthTo,
                  year: selectedYear,
                  hideZero: hideZeroStock,
                }}
              />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
            <SearchableFilterInput
              name="q"
              defaultValue={q}
              options={articleOptions}
              placeholder="Ecrire article..."
            />
            <SearchableFilterInput
              name="code_q"
              defaultValue={codeQ}
              options={codeOptions}
              placeholder="Ecrire numero de lot..."
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
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Type</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">TE/TS</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Categorie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Gamme</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Lot</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Unite</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date fab.</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date exp.</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Entree</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Sortie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Stock code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Stock article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Fournisseur / Client</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Doss. ERP</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Doss. 4D</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Import</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Note</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Saisi par</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date de saisie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.display_key} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.date_jour)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.nom_article || "-"}
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
                        {row.categorie || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.gamme || "-"}
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
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(row.created_at)}</td>
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
                                <SubmitButton
                                  pendingLabel="Enregistrement..."
                                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Enregistrer
                                </SubmitButton>
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
                                <SubmitButton
                                  pendingLabel="Enregistrement..."
                                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Enregistrer
                                </SubmitButton>
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
