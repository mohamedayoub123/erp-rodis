import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  deleteProgrammeLigneGroupAction,
  dispatchExistingProgrammeLigneGroupAction,
} from "../../programe-par-ligne/actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteGroupButton } from "../delete-group-button";
import { DispatchGroupButton } from "../dispatch-group-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { formatDateTime } from "@/lib/format-date";
import { fetchPlCodeByGroupeId, fetchPdRefsBySourceGroupeId } from "@/lib/programme-numbering";
import { buildCodeFluxContext, fetchCodeFlux } from "@/lib/production-code-flux";
import { CodeFluxCard } from "@/app/_components/code-flux-card";

type ProgrammeLigneRow = {
  id: number;
  groupe_id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  type_article: string | null;
  qt_carton: number | null;
  vrac_a_fabriquer: number | null;
  plateforme: string | null;
  programe: string | null;
  date_jour: string;
  created_at: string;
  numero_lot: string | null;
  cree_par: string | null;
  remarque: string | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export default async function HistoriqueProgrammeDetailPage({
  params,
}: {
  params: Promise<{ groupeId: string }>;
}) {
  const { groupeId } = await params;
  const groupeIdNumber = Number(groupeId);
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "historiqueProgramme");
  const canRelaunch = await canWritePageUser(currentUser, "programeParLigne");

  if (!groupeIdNumber) {
    notFound();
  }

  // .or() couvre aussi le cas d'une ligne sans groupe_id (id.eq + groupe_id
  // is null) - voir la page liste, qui utilise l'id de la ligne comme cle de
  // groupe solo quand groupe_id est vide.
  const { data } = await supabaseServer
    .from("programme_lignes")
    .select(
      "id, groupe_id, zone, chaine, produit, type_article, qt_carton, vrac_a_fabriquer, plateforme, programe, date_jour, created_at, numero_lot, cree_par, remarque"
    )
    .or(`groupe_id.eq.${groupeIdNumber},and(groupe_id.is.null,id.eq.${groupeIdNumber})`)
    .order("id", { ascending: true });

  const lignes = (data ?? []) as ProgrammeLigneRow[];

  if (lignes.length === 0) {
    notFound();
  }

  // Le code PL1.2026, PL2.2026... n'est pas stocke en base - meme calcul que
  // la page liste (voir lib/programme-numbering.ts), pour ne plus jamais
  // afficher un numero different entre les 2 pages pour le meme groupe.
  const [plCodeByGroupeId, pdRefsBySourceGroupeId] = await Promise.all([
    fetchPlCodeByGroupeId(),
    fetchPdRefsBySourceGroupeId(),
  ]);
  const code = plCodeByGroupeId.get(groupeIdNumber) ?? `PL-${groupeIdNumber}`;
  const pdRefs = pdRefsBySourceGroupeId.get(groupeIdNumber) ?? [];

  const dateJour = lignes[0]?.date_jour;

  // Flux complet (meme calcul que le Flux TO/TI et le Rapport "Flux par
  // Code") pour chaque code de dispatch de ce groupe - une ligne decoupee en
  // plusieurs lots porte plusieurs codes separes par virgule dans
  // numero_lot (voir le meme split ailleurs pour ce champ).
  const codes = [
    ...new Set(
      lignes.flatMap((l) => (l.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean))
    ),
  ];
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
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {code}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDate(dateJour)} - {lignes.length} ligne{lignes.length > 1 ? "s" : ""}
                {lignes[0]?.cree_par
                  ? ` - Cree par ${lignes[0].cree_par} (${formatDateTime(lignes[0].created_at)})`
                  : ""}
              </p>
              {lignes[0]?.remarque ? (
                <p className="mt-2 text-base font-semibold text-sky-700">{lignes[0].remarque}</p>
              ) : null}
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                Dispatche dans :
                {pdRefs.length > 0 ? (
                  pdRefs.map((ref) => (
                    <Link
                      key={ref.groupeId}
                      href={`/historique-programme-dispatcher/${ref.groupeId}`}
                      className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      {ref.code}
                    </Link>
                  ))
                ) : (
                  <span className="text-slate-400">pas encore dispatche</span>
                )}
              </p>
            </div>

            <div className="no-print flex flex-wrap items-center gap-3">
              <BackButton href="/historique-programme" label="Retour historique" />
              <RefreshButton />
              <SimplePrintButton />
              {canRelaunch ? (
                <Link
                  href={`/programe-par-ligne?groupe_id=${groupeIdNumber}`}
                  className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  Charger dans Programme par ligne
                </Link>
              ) : null}
              {canRelaunch ? (
                <Link
                  href={`/historique-programme/${groupeIdNumber}/stock`}
                  className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  Verifier stock
                </Link>
              ) : null}
              {canRelaunch ? (
                <DispatchGroupButton groupeId={groupeIdNumber} dispatchAction={dispatchExistingProgrammeLigneGroupAction} />
              ) : null}
              {canDelete ? (
                <DeleteGroupButton groupeId={groupeIdNumber} deleteAction={deleteProgrammeLigneGroupAction} />
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
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Type</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Produit</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">N Lot</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Qt carton</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Vrac a fabriquer</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Plateforme</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Programme</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <tr key={ligne.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{ligne.zone}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{ligne.chaine}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.type_article || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.produit || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.numero_lot || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {ligne.qt_carton !== null ? Math.round(ligne.qt_carton).toLocaleString("fr-FR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {ligne.vrac_a_fabriquer !== null
                        ? ligne.vrac_a_fabriquer.toLocaleString("fr-FR")
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{ligne.plateforme || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{ligne.programe || "-"}</td>
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
