import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteProgrammeDispatcherHistoryGroupAction } from "../../ravitailleur-par-ligne/dispatcher-actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";

type HistoryRow = {
  id: number;
  groupe_id: number | null;
  zone: string;
  chaine: string | null;
  produit: string | null;
  code: string | null;
  qt_carton: number | null;
  qt_vrac: number | null;
  date_jour: string;
  created_at: string;
  cree_par: string | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export default async function HistoriqueProgrammeDispatcherDetailPage({
  params,
}: {
  params: Promise<{ groupeId: string }>;
}) {
  const { groupeId } = await params;
  const groupeIdNumber = Number(groupeId);
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "historiqueProgrammeDispatcher");

  if (!groupeIdNumber) {
    notFound();
  }

  const { data } = await supabaseServer
    .from("programme_dispatcher_history")
    .select("id, groupe_id, zone, chaine, produit, code, qt_carton, qt_vrac, date_jour, created_at, cree_par")
    .eq("groupe_id", groupeIdNumber)
    .order("id", { ascending: true });

  const rows = (data ?? []) as HistoryRow[];

  if (rows.length === 0) {
    notFound();
  }

  // PD1/PD2/PD3... n'est pas stocke - recalcule selon le rang du groupe
  // (le plus ancien = PD1), meme principe que MB1/MB2 et TE1/TS1.
  const allGroupRows: { groupe_id: number; created_at: string }[] = [];
  let fromIndex = 0;
  const pageSize = 1000;

  while (true) {
    const { data: groupRows } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("groupe_id, created_at")
      .range(fromIndex, fromIndex + pageSize - 1);

    const chunk = (groupRows as { groupe_id: number; created_at: string }[] | null) ?? [];
    allGroupRows.push(...chunk);

    if (chunk.length < pageSize) break;
    fromIndex += pageSize;
  }

  const earliestByGroup = new Map<number, string>();
  for (const row of allGroupRows) {
    const current = earliestByGroup.get(row.groupe_id);
    if (!current || new Date(row.created_at).getTime() < new Date(current).getTime()) {
      earliestByGroup.set(row.groupe_id, row.created_at);
    }
  }

  const orderedGroupIds = [...earliestByGroup.entries()]
    .sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime())
    .map(([id]) => id);

  const rank = orderedGroupIds.indexOf(groupeIdNumber);
  const code = rank >= 0 ? `PD${rank + 1}` : `PD-${groupeIdNumber}`;
  const dateJour = rows[0]?.date_jour;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(dateJour)} - {rows.length} ligne{rows.length > 1 ? "s" : ""}
                {rows[0]?.cree_par ? ` - Cree par ${rows[0].cree_par}` : ""}
              </p>
            </div>

            <div className="no-print flex flex-wrap items-center gap-3">
              <BackButton href="/historique-programme-dispatcher" label="Retour historique" />
              <RefreshButton />
              <SimplePrintButton />
              {canDelete ? (
                <form action={deleteProgrammeDispatcherHistoryGroupAction}>
                  <input type="hidden" name="groupe_id" value={groupeIdNumber} />
                  <DeleteIconButton />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Zone</th>
                  <th className="px-4 py-3 font-semibold">Chaine</th>
                  <th className="px-4 py-3 font-semibold">Produit</th>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Qt carton</th>
                  <th className="px-4 py-3 font-semibold">Qt vrac</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.zone || "-"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.chaine || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.produit || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.code || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.qt_carton !== null ? Math.round(row.qt_carton).toLocaleString("fr-FR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.qt_vrac !== null ? row.qt_vrac.toLocaleString("fr-FR") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
