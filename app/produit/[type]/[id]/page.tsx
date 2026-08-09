import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

type DepotRow = { id: number; nom: string };
type LotRow = { qte_entree: number; qte_sortie: number; depot_id: number | null };

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

async function fetchAllLots(table: string, articleId: number): Promise<LotRow[]> {
  const rows: LotRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select("qte_entree, qte_sortie, depot_id")
      .eq("article_id", articleId)
      .range(from, from + pageSize - 1);

    if (error) break;

    rows.push(...((data ?? []) as LotRow[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function ProduitStockPage({ params }: { params: Promise<{ type: string; id: string }> }) {
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
  const articlesTable = type === "mp" ? "articles_matiere_premiere" : "articles";

  const [{ data: articleData }, { data: depotsData }, lots] = await Promise.all([
    supabaseServer.from(articlesTable).select("depot_id").eq("id", articleId).maybeSingle(),
    supabaseServer.from("depots").select("id, nom").order("nom", { ascending: true }),
    fetchAllLots(table, articleId),
  ]);

  const defaultDepotId = (articleData as { depot_id: number | null } | null)?.depot_id ?? null;
  const depots = (depotsData as DepotRow[] | null) ?? [];
  const depotNomById = new Map(depots.map((d) => [d.id, d.nom]));

  const soldeByDepotId = new Map<number, number>();
  for (const lot of lots) {
    const effectiveDepotId = lot.depot_id ?? defaultDepotId;
    if (effectiveDepotId === null) continue;
    soldeByDepotId.set(
      effectiveDepotId,
      (soldeByDepotId.get(effectiveDepotId) ?? 0) + Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0)
    );
  }

  const rows = [...soldeByDepotId.entries()]
    .map(([depotId, solde]) => ({ depotId, nom: depotNomById.get(depotId) ?? `#${depotId}`, solde }))
    .filter((row) => Math.abs(row.solde) > 1e-6)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  const total = rows.reduce((sum, row) => sum + row.solde, 0);

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      {rows.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-500">Aucun stock pour cet article.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Depot</th>
                <th className="px-6 py-4 font-semibold">Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.depotId} className="border-t border-slate-100">
                  <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                  <td className="px-6 py-4 text-slate-600">{formatNumber(row.solde)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-300 bg-slate-50">
                <td className="px-6 py-4 font-bold text-slate-900">Total</td>
                <td className="px-6 py-4 font-bold text-slate-900">{formatNumber(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
