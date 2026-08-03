import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";

type LotRow = {
  id: number;
  nom_article: string;
  numero_lot: string | null;
  date_reception: string | null;
  date_expiration: string | null;
  mois_en_stock: number | null;
  stock_actuel: number | null;
  etat: string | null;
};

async function fetchAllLots() {
  const rows: LotRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_matiere_premiere")
      .select("id, nom_article, numero_lot, date_reception, date_expiration, mois_en_stock, stock_actuel, etat")
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

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type SearchParams = Promise<{ etat?: string; q?: string }>;

export default async function StockPerimeMpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const etatFilter = (params.etat || "Perime").trim();
  const q = (params.q || "").trim().toLowerCase();

  const { rows: allLots, error } = await fetchAllLots();

  const lots = allLots.filter((lot) => {
    if (etatFilter && etatFilter !== "Tous" && (lot.etat || "") !== etatFilter) return false;
    if (q && !lot.nom_article.toLowerCase().includes(q)) return false;
    return true;
  });

  const etatTabs = ["Perime", "Actif", "Tous"];

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
              Etat des lots matiere premiere (feuille Excel Etat_Lots).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {etatTabs.map((tab) => (
                <Link
                  key={tab}
                  href={`/stock/matiere-premiere/perime?etat=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}`}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    etatFilter === tab
                      ? "bg-red-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {tab === "Perime" ? "Perime" : tab === "Actif" ? "Actif" : "Tous"}
                </Link>
              ))}
            </div>

            <form className="flex gap-2">
              <input type="hidden" name="etat" value={etatFilter} />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Rechercher un article..."
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm outline-none"
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
          ) : lots.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun lot trouve pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Lot</th>
                    <th className="px-6 py-4 font-semibold">Date reception</th>
                    <th className="px-6 py-4 font-semibold">Date expiration</th>
                    <th className="px-6 py-4 font-semibold">Mois en stock</th>
                    <th className="px-6 py-4 font-semibold">Stock actuel</th>
                    <th className="px-6 py-4 font-semibold">Etat</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{lot.nom_article}</td>
                      <td className="px-6 py-4 text-slate-600">{lot.numero_lot || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(lot.date_reception)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(lot.date_expiration)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(lot.mois_en_stock)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(lot.stock_actuel)}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            lot.etat === "Perime"
                              ? "bg-red-100 text-red-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {lot.etat || "-"}
                        </span>
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
