import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { updateLotMpNoteAction } from "./actions";
import { SubmitButton } from "@/app/_components/submit-button";
import { matchesArticleSearch } from "@/lib/article-search";

const FENETRE_JOURS = 90; // ~3 mois avant peremption

type LotRow = {
  id: number;
  nom_article: string;
  article_normalise: string;
  numero_lot: string | null;
  date_expiration: string | null;
  stock_actuel: number | null;
  note: string | null;
};

type ArticleRow = {
  article_normalise: string;
  categorie: string | null;
};

async function fetchAllLots() {
  const rows: LotRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_matiere_premiere")
      .select("id, nom_article, article_normalise, numero_lot, date_expiration, stock_actuel, note")
      .order("date_expiration", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as LotRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchCategorieByArticle() {
  const map = new Map<string, string | null>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("article_normalise, categorie")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ArticleRow[];
    chunk.forEach((row) => map.set(row.article_normalise, row.categorie));

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return map;
}

async function fetchAllArticleNoms() {
  const noms: string[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("nom_article")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as { nom_article: string }[];
    noms.push(...chunk.map((row) => row.nom_article));

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return noms;
}

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function joursRestants(dateExpiration: string) {
  const today = new Date().toISOString().slice(0, 10);
  const msParJour = 1000 * 60 * 60 * 24;
  return Math.round(
    (new Date(`${dateExpiration}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / msParJour
  );
}

function formatJoursRestants(jours: number) {
  if (jours < 0) {
    const retard = Math.abs(jours);
    return retard >= 60
      ? `Perime depuis ${Math.round(retard / 30)} mois`
      : `Perime depuis ${retard} jour${retard > 1 ? "s" : ""}`;
  }
  if (jours === 0) return "Perime aujourd'hui";
  return jours >= 60 ? `Reste ${Math.round(jours / 30)} mois` : `Reste ${jours} jour${jours > 1 ? "s" : ""}`;
}

type Statut = "tous" | "perime" | "proche";

type SearchParams = Promise<{ q?: string; statut?: string }>;

export default async function StockPerimeMpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const statut = (["tous", "perime", "proche"].includes(params.statut || "")
    ? params.statut
    : "tous") as Statut;

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "stockPerimeMp");

  const [{ rows: allLots, error }, categorieByArticle, articleNoms] = await Promise.all([
    fetchAllLots(),
    fetchCategorieByArticle(),
    fetchAllArticleNoms(),
  ]);

  const articleOptions = [...new Set(articleNoms)].map((label, index) => ({ id: index, label }));

  // Fenetre d'alerte : articles deja perimes OU qui vont perimer dans les
  // ~3 mois qui viennent - le filtre "perime" permet ensuite de ne garder
  // que ceux vraiment depasses.
  const withJours = allLots
    .filter((lot) => Boolean(lot.date_expiration))
    .map((lot) => ({ ...lot, jours: joursRestants(lot.date_expiration as string) }))
    .filter((lot) => lot.jours <= FENETRE_JOURS);

  const filtered = withJours.filter((lot) => {
    if (statut === "perime" && lot.jours >= 0) return false;
    if (statut === "proche" && lot.jours < 0) return false;
    if (q && !matchesArticleSearch(lot.nom_article, q)) return false;
    return true;
  });

  const statutTabs: { key: Statut; label: string }[] = [
    { key: "tous", label: "Tous (perime + < 3 mois)" },
    { key: "perime", label: "Vraiment perime" },
    { key: "proche", label: "Bientot perime" },
  ];

  const exportColumns = [
    { label: "Article", key: "article" },
    { label: "Qte", key: "qte" },
    { label: "Code", key: "code" },
    { label: "Categorie", key: "categorie" },
    { label: "Reste", key: "reste" },
    { label: "Note", key: "note" },
  ];

  const exportRows = filtered.map((lot) => ({
    article: lot.nom_article,
    qte: lot.stock_actuel === null || lot.stock_actuel === undefined ? "-" : lot.stock_actuel,
    code: lot.numero_lot || "-",
    categorie: categorieByArticle.get(lot.article_normalise) || "-",
    reste: formatJoursRestants(lot.jours),
    note: lot.note || "-",
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fef2f2_0%,#fffafa_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Stock Perime MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Articles deja perimes ou qui vont perimer dans les 3 prochains mois.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere/rapport" label="Retour rapport" />
            <ExportExcelButton
              rows={exportRows}
              columns={exportColumns}
              filename={`stock-perime-mp-${new Date().toISOString().slice(0, 10)}.xlsx`}
            />
            <RefreshButton />
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {statutTabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={`/stock/matiere-premiere/perime?statut=${tab.key}&q=${encodeURIComponent(q)}`}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    statut === tab.key
                      ? "bg-red-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            <form className="flex gap-2">
              <input type="hidden" name="statut" value={statut} />
              <SearchableFilterInput
                name="q"
                defaultValue={q}
                options={articleOptions}
                placeholder="Rechercher un article..."
              />
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
            </form>
          </div>

          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun article pour le moment.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Qte</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Categorie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Reste</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lot) => (
                    <tr key={lot.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">{lot.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(lot.stock_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">{lot.numero_lot || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {categorieByArticle.get(lot.article_normalise) || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            lot.jours < 0
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {formatJoursRestants(lot.jours)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {canEdit ? (
                          <form action={updateLotMpNoteAction} className="flex gap-2">
                            <input type="hidden" name="lot_id" value={lot.id} />
                            <input
                              type="text"
                              name="note"
                              defaultValue={lot.note || ""}
                              placeholder="Note..."
                              className="w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                            />
                            <SubmitButton
                              pendingLabel="Enregistrement..."
                              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Enregistrer
                            </SubmitButton>
                          </form>
                        ) : (
                          lot.note || "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
