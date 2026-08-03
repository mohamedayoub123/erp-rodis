import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { updateLotMpNoteAction } from "./actions";

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
      .order("nom_article", { ascending: true })
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

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type SearchParams = Promise<{ q?: string }>;

export default async function StockPerimeMpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "stockPerimeMp");

  const [{ rows: allLots, error }, categorieByArticle] = await Promise.all([
    fetchAllLots(),
    fetchCategorieByArticle(),
  ]);

  // "Perime" est determine par la date d'expiration reelle (comparee a
  // aujourd'hui), pas par le texte "Etat" fige au moment de l'import Excel -
  // un article "Actif" a l'import peut avoir expire depuis.
  const todayIso = new Date().toISOString().slice(0, 10);
  const perimes = allLots.filter((lot) => {
    if (!lot.date_expiration || lot.date_expiration >= todayIso) return false;
    if (q && !lot.nom_article.toLowerCase().includes(q)) return false;
    return true;
  });

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
              Tous les articles dont la date d&apos;expiration est depassee.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="flex gap-2 border-b border-slate-100 p-6">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Rechercher un article..."
              className="w-full max-w-sm rounded-2xl border border-slate-200 px-4 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
          </form>

          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : perimes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun article perime pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Qte</th>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">Categorie</th>
                    <th className="px-6 py-4 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {perimes.map((lot) => (
                    <tr key={lot.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-medium text-slate-900">{lot.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(lot.stock_actuel)}</td>
                      <td className="px-6 py-4 text-slate-600">{lot.numero_lot || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {categorieByArticle.get(lot.article_normalise) || "-"}
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
                            <button
                              type="submit"
                              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            >
                              Enregistrer
                            </button>
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
