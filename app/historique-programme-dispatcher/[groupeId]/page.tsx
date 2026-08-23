import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteProgrammeDispatcherHistoryGroupAction } from "../../ravitailleur-par-ligne/dispatcher-actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { formatDateTime } from "@/lib/format-date";
import { fetchPdCodeByGroupeId, fetchPlCodeByGroupeId } from "@/lib/programme-numbering";
import { buildCodeFluxContext, fetchCodeFlux } from "@/lib/production-code-flux";
import { CodeFluxCard } from "@/app/_components/code-flux-card";

type HistoryRow = {
  id: number;
  groupe_id: number | null;
  source_groupe_id: number | null;
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
    .select(
      "id, groupe_id, source_groupe_id, zone, chaine, produit, code, qt_carton, qt_vrac, date_jour, created_at, cree_par"
    )
    .eq("groupe_id", groupeIdNumber)
    .order("id", { ascending: true });

  const rows = (data ?? []) as HistoryRow[];

  if (rows.length === 0) {
    notFound();
  }

  // PD1/PD2/PD3... n'est pas stocke - meme calcul que la page liste (voir
  // lib/programme-numbering.ts), pour ne plus jamais afficher un numero
  // different entre les 2 pages pour le meme groupe.
  const [pdCodeByGroupeId, plCodeByGroupeId] = await Promise.all([
    fetchPdCodeByGroupeId(),
    fetchPlCodeByGroupeId(),
  ]);
  const code = pdCodeByGroupeId.get(groupeIdNumber) ?? `PD-${groupeIdNumber}`;
  const sourceGroupeId = rows.find((row) => row.source_groupe_id !== null)?.source_groupe_id ?? null;
  const plCode = sourceGroupeId !== null ? plCodeByGroupeId.get(sourceGroupeId) ?? null : null;
  const dateJour = rows[0]?.date_jour;

  // Flux complet (meme calcul que le Flux TO/TI et le Rapport "Flux par
  // Code") pour chaque code distinct de ce groupe PD.
  const codes = [...new Set(rows.map((r) => (r.code || "").trim()).filter(Boolean))];
  const codeFluxContext = codes.length > 0 ? await buildCodeFluxContext() : null;
  const codeFluxList = codeFluxContext
    ? (await Promise.all(codes.map((c) => fetchCodeFlux(c, codeFluxContext)))).filter((f) => f !== null)
    : [];

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
                {rows[0]?.cree_par
                  ? ` - Cree par ${rows[0].cree_par} (${formatDateTime(rows[0].created_at)})`
                  : ""}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                Programme source :
                {sourceGroupeId !== null ? (
                  <Link
                    href={`/historique-programme/${sourceGroupeId}`}
                    className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    {plCode ?? `PL-${sourceGroupeId}`}
                  </Link>
                ) : (
                  <span className="text-slate-400">inconnu</span>
                )}
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
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-50 text-slate-950">
                <tr>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Zone</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Chaine</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Produit</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Qt carton</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Qt vrac</th>
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

        {codeFluxList.length > 0 ? (
          <details className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <summary className="cursor-pointer px-6 py-4 text-sm font-bold text-slate-900">
              Flux - matiere premiere et produit fini par code
            </summary>
            <div className="space-y-3 border-t border-slate-100 px-6 py-4">
              {codeFluxList.map((flux) => (
                <CodeFluxCard key={flux.code} flux={flux} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
