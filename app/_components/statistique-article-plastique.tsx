import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { SubmitButton } from "@/app/_components/submit-button";
import { SaveCommandeButton } from "@/app/_components/save-commande-plastique-button";
import { matchesArticleSearch } from "@/lib/article-search";
import { familyRank } from "@/lib/gamme-families";
import { CATEGORIES_PLASTIQUE } from "@/app/production-plastique/shared";
import { updateAvisFabricationAction, saveCommandeArticlePlastiqueAction } from "@/app/_components/statistique-article-plastique-actions";

// Module partage - meme rendu utilise depuis Rapport MP
// (stock/matiere-premiere/rapport/plastique) et Production Plastique
// (production-plastique/statistique), demande explicite : "la meme
// module" aux 2 endroits plutot que 2 versions dupliquees a maintenir
// separement.

type StockActuelMpRpcRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  stock_actuel: number;
};

type ArticleDetailRow = {
  id: number;
  min_stock: number | null;
  max_stock: number | null;
  gamme: string | null;
  avis_fabrication: string | null;
};

export type PlastiqueRow = {
  article_id: number;
  nom_article: string;
  categorie: string | null;
  unite: string | null;
  gamme: string | null;
  stock_actuel: number;
  min_stock: number | null;
  max_stock: number | null;
  avis_fabrication: string | null;
};

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Regroupe CAPSULES/CAPSULES-IMP sous "CAPSULE" (variantes de la meme
// famille physique) mais garde FLACON et FLACONS PET DISTINCTS - contraire
// a normalizeCategoriePlastique (production-plastique/shared.ts) qui les
// fusionne tous les 2 sous "FLACON" - demande explicite ici : l'ordre de
// tri doit justement pouvoir les distinguer (Flacon avant Flacon PET).
function displayCategorie(categorie: string | null): string {
  if (categorie === "CAPSULES" || categorie === "CAPSULES-IMP") return "CAPSULE";
  return categorie || "-";
}

// Ordre d'affichage demande explicitement : Flacon, Pot, Capsule, Flacon
// PET - tout le reste (Topette...) vient apres, triees entre elles par nom.
// POTS PET place juste apres FLACONS PET (meme logique : variante PET
// distincte de sa famille de base, voir displayCategorie).
const CATEGORIE_SORT_ORDER = ["FLACON", "POTS", "CAPSULE", "FLACONS PET", "POTS PET"];
function categorieSortIndex(categorie: string | null): number {
  const index = CATEGORIE_SORT_ORDER.indexOf(displayCategorie(categorie));
  return index === -1 ? CATEGORIE_SORT_ORDER.length : index;
}

// stock_actuel_mp_rows() renvoie une ligne par article MP (2700+) - un
// simple .rpc() sans .range() plafonne silencieusement a 1000 lignes
// (limite par defaut Supabase/PostgREST), qui coupait la table AVANT
// d'atteindre la plupart des articles plastique (aucun ordre garanti sur
// une fonction SQL sans ORDER BY) - cette page revenait vide. Meme
// pagination que fetchAllRows ailleurs dans l'appli.
async function fetchAllStockActuelMpRows(): Promise<{ rows: StockActuelMpRpcRow[]; error: string | null }> {
  const pageSize = 1000;
  const rows: StockActuelMpRpcRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer.rpc("stock_actuel_mp_rows").range(from, from + pageSize - 1);
    if (error) return { rows: [], error: error.message };
    const chunk = (data ?? []) as StockActuelMpRpcRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export async function fetchPlastiqueRows(): Promise<{ rows: PlastiqueRow[]; error: string | null }> {
  const [stockResult, detailResult] = await Promise.all([
    fetchAllStockActuelMpRows(),
    supabaseServer
      .from("articles_matiere_premiere")
      .select("id, min_stock, max_stock, gamme, avis_fabrication")
      .in("categorie", CATEGORIES_PLASTIQUE),
  ]);

  if (stockResult.error) return { rows: [], error: stockResult.error };
  if (detailResult.error) return { rows: [], error: detailResult.error.message };

  const detailById = new Map((detailResult.data as ArticleDetailRow[]).map((row) => [row.id, row]));

  const rows = stockResult.rows
    .filter((row) => (CATEGORIES_PLASTIQUE as readonly string[]).includes(row.categorie || ""))
    .map((row) => {
      const detail = detailById.get(row.article_id);
      return {
        article_id: row.article_id,
        nom_article: row.nom_article,
        categorie: row.categorie,
        unite: row.unite,
        gamme: detail?.gamme ?? null,
        stock_actuel: Number(row.stock_actuel ?? 0),
        min_stock: detail?.min_stock ?? null,
        max_stock: detail?.max_stock ?? null,
        avis_fabrication: detail?.avis_fabrication ?? null,
      };
    })
    .sort((a, b) => {
      return (
        familyRank(a.gamme) - familyRank(b.gamme) ||
        (a.gamme || "").localeCompare(b.gamme || "", "fr", { sensitivity: "base" }) ||
        categorieSortIndex(a.categorie) - categorieSortIndex(b.categorie) ||
        a.nom_article.localeCompare(b.nom_article, "fr", { sensitivity: "base" })
      );
    });

  return { rows, error: null };
}

// Quantite a fabriquer pour ramener le stock au maximum - seulement quand
// le stock est sous le minimum (sinon rien a produire dans l'urgence) et
// que min/max sont tous les 2 renseignes pour cet article (sinon aucune
// cible fiable a viser).
export function computeAFabriquer(row: PlastiqueRow): number | null {
  if (row.min_stock === null || row.max_stock === null) return null;
  if (row.stock_actuel >= row.min_stock) return 0;
  return Math.max(0, row.max_stock - row.stock_actuel);
}

export async function StatistiqueArticlePlastique({
  pageHref,
  canEdit,
  searchParams,
}: {
  pageHref: string;
  canEdit: boolean;
  searchParams: Promise<{ q?: string; categorie?: string; gamme?: string }>;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim();
  const categorieFilter = (params.categorie || "").trim();
  const gammeFilter = (params.gamme || "").trim();
  const hasFilters = Boolean(q || categorieFilter || gammeFilter);

  const { rows: allRows, error } = await fetchPlastiqueRows();

  const rows = allRows
    .filter((row) => !q || matchesArticleSearch(row.nom_article, q))
    .filter((row) => !categorieFilter || displayCategorie(row.categorie) === categorieFilter)
    .filter((row) => !gammeFilter || (row.gamme || "").toLowerCase() === gammeFilter.toLowerCase());

  const articleOptions = allRows.map((row, index) => ({ id: index, label: row.nom_article }));
  const categorieOptions = [...new Set(allRows.map((row) => displayCategorie(row.categorie)))].map(
    (label, index) => ({ id: index, label })
  );
  const gammeOptions = [...new Set(allRows.map((row) => row.gamme).filter((g): g is string => Boolean(g)))].map(
    (label, index) => ({ id: index, label })
  );

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Gamme", key: "gamme" },
    { label: "Categorie", key: "categorie" },
    { label: "Unite", key: "unite" },
    { label: "Stock actuel", key: "stock" },
    { label: "Stock min", key: "min" },
    { label: "Stock max", key: "max" },
    { label: "A fabriquer", key: "aFabriquer" },
    { label: "Avis de fabrication", key: "avis" },
  ];
  const exportRows = rows.map((row) => ({
    article: row.nom_article,
    gamme: row.gamme || "-",
    categorie: displayCategorie(row.categorie),
    unite: row.unite || "-",
    stock: row.stock_actuel,
    min: row.min_stock ?? "-",
    max: row.max_stock ?? "-",
    aFabriquer: computeAFabriquer(row) ?? "-",
    avis: row.avis_fabrication || "-",
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <form className="grid gap-3 sm:grid-cols-3">
          <SearchableFilterInput name="q" defaultValue={q} options={articleOptions} placeholder="Article..." />
          <SearchableFilterInput
            name="categorie"
            defaultValue={categorieFilter}
            options={categorieOptions}
            placeholder="Categorie..."
          />
          <SearchableFilterInput name="gamme" defaultValue={gammeFilter} options={gammeOptions} placeholder="Gamme..." />
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href={pageHref}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {canEdit ? <SaveCommandeButton saveAction={saveCommandeArticlePlastiqueAction} /> : null}
              <ExportExcelButton
                rows={exportRows}
                columns={exportColumns}
                filename={`statistique-article-plastique-${new Date().toISOString().slice(0, 10)}.xlsx`}
              />
            </div>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {error ? (
          <p className="px-6 py-8 text-sm font-medium text-red-700">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun article plastique trouve."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Article</th>
                  <th className="px-6 py-4 font-semibold">Gamme</th>
                  <th className="px-6 py-4 font-semibold">Categorie</th>
                  <th className="px-6 py-4 font-semibold">Unite</th>
                  <th className="px-6 py-4 font-semibold">Stock actuel</th>
                  <th className="px-6 py-4 font-semibold">Stock min</th>
                  <th className="px-6 py-4 font-semibold">Stock max</th>
                  <th className="px-6 py-4 font-semibold">A fabriquer</th>
                  <th className="px-6 py-4 font-semibold">Avis de fabrication</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  // Rouge = sous le minimum (a commander/produire), ambre =
                  // au-dessus du maximum (surstock), vert = dans la
                  // fourchette - memes couleurs que Stock Alert MP, seuils
                  // ignores quand min/max ne sont pas renseignes pour cet
                  // article.
                  const belowMin = row.min_stock !== null && row.stock_actuel < row.min_stock;
                  const aboveMax = row.max_stock !== null && row.stock_actuel > row.max_stock;
                  const badgeClass = belowMin
                    ? "bg-rose-100 text-rose-800"
                    : aboveMax
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800";
                  const aFabriquer = computeAFabriquer(row);
                  return (
                    <tr key={row.article_id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.gamme || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{displayCategorie(row.categorie)}</td>
                      <td className="px-6 py-4 text-slate-600">{row.unite || "-"}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                          {formatNumber(row.stock_actuel)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.min_stock !== null ? formatNumber(row.min_stock) : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.max_stock !== null ? formatNumber(row.max_stock) : "-"}
                      </td>
                      <td className="px-6 py-4 font-bold text-red-600">
                        {aFabriquer ? formatNumber(aFabriquer) : "-"}
                      </td>
                      <td className="px-6 py-4">
                        {canEdit ? (
                          <form action={updateAvisFabricationAction} className="flex items-center gap-2">
                            <input type="hidden" name="article_id" value={row.article_id} />
                            <input
                              type="text"
                              name="avis_fabrication"
                              defaultValue={row.avis_fabrication ?? ""}
                              placeholder="Avis..."
                              className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                            />
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              OK
                            </SubmitButton>
                          </form>
                        ) : (
                          <span className="text-slate-600">{row.avis_fabrication || "-"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
