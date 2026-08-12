import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { formatDate } from "@/lib/format-date";

type LotRowPf = {
  id: number;
  date_jour: string | null;
  qte_entree: number;
  qte_sortie: number;
  depot_id: number | null;
  numero_lot: string | null;
  utilisateur: string | null;
  note: string | null;
};

type LotRowMp = LotRowPf & { fournisseur: string | null; source_import: string | null };

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

async function fetchAllLots<T>(table: string, select: string, articleId: number): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(select)
      .eq("article_id", articleId)
      .range(from, from + pageSize - 1);

    if (error) break;

    rows.push(...((data ?? []) as T[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function ProduitMouvementPage({
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
  const select =
    type === "mp"
      ? "id, date_jour, qte_entree, qte_sortie, depot_id, numero_lot, utilisateur, note, fournisseur, source_import"
      : "id, date_jour, qte_entree, qte_sortie, depot_id, numero_lot, utilisateur, note";

  const [{ data: depotsData }, lots] = await Promise.all([
    supabaseServer.from("depots").select("id, nom"),
    fetchAllLots<LotRowMp>(table, select, articleId),
  ]);

  const depotNomById = new Map(((depotsData as { id: number; nom: string }[] | null) ?? []).map((d) => [d.id, d.nom]));

  // Solde apres chaque mouvement (tous depots confondus, meme total que la
  // ligne "Total" de l'onglet Stock) - calcule dans l'ordre CHRONOLOGIQUE
  // (le plus ancien d'abord), puis reaffiche du plus recent au plus ancien.
  const chronological = [...lots].sort((a, b) => {
    const dateA = a.date_jour || "";
    const dateB = b.date_jour || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.id - b.id;
  });

  let runningBalance = 0;
  const soldeApresById = new Map<number, number>();
  for (const lot of chronological) {
    runningBalance += Number(lot.qte_entree ?? 0) - Number(lot.qte_sortie ?? 0);
    soldeApresById.set(lot.id, runningBalance);
  }

  const rows = [...lots].sort((a, b) => {
    const dateA = a.date_jour || "";
    const dateB = b.date_jour || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return b.id - a.id;
  });

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      {rows.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-500">Aucun mouvement enregistre pour cet article.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Type</th>
                <th className="px-6 py-4 font-semibold">Quantite</th>
                <th className="px-6 py-4 font-semibold">Stock a ce jour</th>
                <th className="px-6 py-4 font-semibold">Depot</th>
                <th className="px-6 py-4 font-semibold">Lot</th>
                <th className="px-6 py-4 font-semibold">Fait par</th>
                <th className="px-6 py-4 font-semibold">Origine / Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEntree = Number(row.qte_entree ?? 0) > 0;
                const quantite = isEntree ? row.qte_entree : row.qte_sortie;
                const origine = [row.fournisseur, row.source_import, row.note].filter(Boolean).join(" - ");

                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-6 py-4 text-slate-600">{row.date_jour ? formatDate(row.date_jour) : "-"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isEntree ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {isEntree ? "Entree" : "Sortie"}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">{formatNumber(quantite)}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {formatNumber(soldeApresById.get(row.id) ?? 0)}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {row.depot_id ? depotNomById.get(row.depot_id) ?? "-" : "-"}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{row.numero_lot || "-"}</td>
                    <td className="px-6 py-4 text-slate-600">{row.utilisateur || "-"}</td>
                    <td className="px-6 py-4 text-slate-600">{origine || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
