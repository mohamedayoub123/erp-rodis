import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

type LotRow = { date_jour: string | null; qte_entree: number; qte_sortie: number };

const MOIS_LABELS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

function formatMois(key: string) {
  const [year, month] = key.split("-");
  const label = MOIS_LABELS[Number(month) - 1] ?? month;
  return `${label} ${year}`;
}

async function fetchAllLots(table: string, articleId: number): Promise<LotRow[]> {
  const rows: LotRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select("date_jour, qte_entree, qte_sortie")
      .eq("article_id", articleId)
      .range(from, from + pageSize - 1);

    if (error) break;

    rows.push(...((data ?? []) as LotRow[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function ProduitStatistiquePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  noStore();
  const { type, id } = await params;
  if (type !== "pf" && type !== "mp") {
    notFound();
  }
  const articleId = Number(id);
  if (!articleId) {
    notFound();
  }

  const table = type === "mp" ? "lots_stock_matiere_premiere" : "lots_stock";
  const lots = await fetchAllLots(table, articleId);

  const byMonth = new Map<string, { entree: number; sortie: number }>();
  for (const lot of lots) {
    if (!lot.date_jour) continue;
    const monthKey = lot.date_jour.slice(0, 7);
    const current = byMonth.get(monthKey) ?? { entree: 0, sortie: 0 };
    current.entree += Number(lot.qte_entree ?? 0);
    current.sortie += Number(lot.qte_sortie ?? 0);
    byMonth.set(monthKey, current);
  }

  const rows = [...byMonth.entries()]
    .map(([monthKey, totals]) => ({
      monthKey,
      entree: totals.entree,
      sortie: totals.sortie,
      mouvementNet: totals.entree - totals.sortie,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      {rows.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-500">Aucun mouvement enregistre pour cet article.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Mois</th>
                <th className="px-6 py-4 font-semibold">Entree</th>
                <th className="px-6 py-4 font-semibold">Sortie</th>
                <th className="px-6 py-4 font-semibold">Mouvement net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.monthKey} className="border-t border-slate-100">
                  <td className="px-6 py-4 font-medium text-slate-900">{formatMois(row.monthKey)}</td>
                  <td className="px-6 py-4 text-emerald-700">{formatNumber(row.entree)}</td>
                  <td className="px-6 py-4 text-red-700">{formatNumber(row.sortie)}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{formatNumber(row.mouvementNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
