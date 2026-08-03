import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";

const PAGE_SIZE = 200;

type MouvementRow = {
  article_id: number | null;
  numero_lot: string | null;
  code_normalise: string | null;
  date_fabrication: string | null;
  date_expiration: string | null;
  date_jour: string | null;
  qte_entree: number;
  qte_sortie: number;
  articles_matiere_premiere: {
    nom_article: string;
    gamme: string | null;
    categorie: string | null;
    unite: string | null;
  } | null;
};

type LotRow = {
  key: string;
  article_id: number;
  article_label: string;
  gamme: string | null;
  categorie: string | null;
  unite: string | null;
  numero_lot: string;
  date_fabrication: string | null;
  date_expiration: string | null;
  date_dernier_mouvement: string | null;
  stock_code: number;
  stock_article: number;
};

async function fetchAllMouvements() {
  const rows: MouvementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select(
        "article_id, numero_lot, code_normalise, date_fabrication, date_expiration, date_jour, qte_entree, qte_sortie, articles_matiere_premiere(nom_article, gamme, categorie, unite)"
      )
      .range(from, from + pageSize - 1);

    if (error) {
      return { rows, error };
    }

    const chunk = (data as unknown as MouvementRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

// Meme calcul que /stock (PF) : le stock restant d'un lot ("code") est la
// somme de toutes ses lignes (qte_entree - qte_sortie), et le stock restant
// d'un article est la somme de tous ses lots. lots_stock_matiere_premiere
// est un grand livre append-only (chaque ligne est un mouvement TE/TS), pas
// un instantane - donc jamais de valeur "stock actuel" stockee directement.
function buildLotRows(mouvements: MouvementRow[]): LotRow[] {
  const byCode = new Map<string, MouvementRow[]>();

  for (const row of mouvements) {
    if (!row.article_id) continue;
    const codeKey = String(row.code_normalise || row.numero_lot || "").trim().toUpperCase();
    const key = `${row.article_id}::${codeKey}`;
    const list = byCode.get(key) ?? [];
    list.push(row);
    byCode.set(key, list);
  }

  const stockByArticle = new Map<number, number>();
  for (const row of mouvements) {
    if (!row.article_id) continue;
    const mouvement = Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    stockByArticle.set(row.article_id, (stockByArticle.get(row.article_id) ?? 0) + mouvement);
  }

  const lots: LotRow[] = [];

  for (const [key, rows] of byCode.entries()) {
    const sorted = [...rows].sort((a, b) => {
      const dateA = a.date_jour ? new Date(a.date_jour).getTime() : 0;
      const dateB = b.date_jour ? new Date(b.date_jour).getTime() : 0;
      return dateA - dateB;
    });
    const latest = sorted[sorted.length - 1];
    const entreeRows = sorted.filter((row) => Number(row.qte_entree ?? 0) > 0);
    const latestEntree = entreeRows[entreeRows.length - 1] ?? latest;

    const stockCode = rows.reduce(
      (sum, row) => sum + Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0),
      0
    );

    lots.push({
      key,
      article_id: latest.article_id as number,
      article_label: latest.articles_matiere_premiere?.nom_article || "-",
      gamme: latest.articles_matiere_premiere?.gamme || null,
      categorie: latest.articles_matiere_premiere?.categorie || null,
      unite: latest.articles_matiere_premiere?.unite || null,
      numero_lot: latest.numero_lot || latest.code_normalise || "",
      date_fabrication: latestEntree.date_fabrication,
      date_expiration: latestEntree.date_expiration,
      date_dernier_mouvement: latest.date_jour,
      stock_code: stockCode,
      stock_article: stockByArticle.get(latest.article_id as number) ?? 0,
    });
  }

  return lots.sort((a, b) => a.article_label.localeCompare(b.article_label, "fr", { sensitivity: "base" }));
}

type SearchParams = Promise<{
  page?: string;
  q?: string;
  code_q?: string;
  hide_zero?: string;
}>;

export default async function StockMatierePremiereStockPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const codeQ = (params.code_q || "").trim().toLowerCase();
  const hideZeroStock = (params.hide_zero || "").trim() === "1";
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { rows: mouvements, error } = await fetchAllMouvements();
  const allLots = buildLotRows(mouvements);

  const filteredLots = allLots.filter((lot) => {
    if (hideZeroStock && lot.stock_code <= 0) return false;
    if (q && !lot.article_label.toLowerCase().includes(q)) return false;
    if (codeQ && !lot.numero_lot.toLowerCase().includes(codeQ)) return false;
    return true;
  });

  const totalLots = filteredLots.length;
  const totalPages = Math.max(1, Math.ceil(totalLots / PAGE_SIZE));
  const pagedLots = filteredLots.slice(from, to + 1);

  function buildPageHref(page: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (codeQ) search.set("code_q", codeQ);
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
                Calcule a partir des mouvements TE/TS : un lot par ligne, stock restant par
                code et par article.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Ecrire article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              autoComplete="off"
            />
            <input
              type="text"
              name="code_q"
              defaultValue={codeQ}
              placeholder="Ecrire numero de lot..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              autoComplete="off"
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="hide_zero" value="1" defaultChecked={hideZeroStock} />
                Cacher stock a 0
              </label>
              <button
                type="submit"
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="p-6 text-sm text-red-700">{error.message}</div>
          ) : pagedLots.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucun lot matiere premiere enregistre.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Article</th>
                    <th className="px-4 py-3 font-semibold">Gamme</th>
                    <th className="px-4 py-3 font-semibold">Categorie</th>
                    <th className="px-4 py-3 font-semibold">Numero de lot</th>
                    <th className="px-4 py-3 font-semibold">Unite</th>
                    <th className="px-4 py-3 font-semibold">Date fabrication</th>
                    <th className="px-4 py-3 font-semibold">Date expiration</th>
                    <th className="px-4 py-3 font-semibold">Dernier mouvement</th>
                    <th className="px-4 py-3 font-semibold">Stock restant (code)</th>
                    <th className="px-4 py-3 font-semibold">Stock restant (article)</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLots.map((lot) => (
                    <tr key={lot.key} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{lot.article_label}</td>
                      <td className="px-4 py-3 text-slate-600">{lot.gamme || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{lot.categorie || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{lot.numero_lot || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{lot.unite || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(lot.date_fabrication)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(lot.date_expiration)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(lot.date_dernier_mouvement)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{lot.stock_code}</td>
                      <td className="px-4 py-3 text-slate-700">{lot.stock_article}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {totalPages > 1 ? (
          <section className="flex items-center justify-between rounded-[1.75rem] border border-black/5 bg-white px-5 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm text-slate-600">
              Lots {Math.min(from + 1, totalLots)} a {Math.min(to + 1, totalLots)} sur {totalLots}
            </p>
            <div className="flex gap-2">
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
          </section>
        ) : null}
      </div>
    </main>
  );
}
