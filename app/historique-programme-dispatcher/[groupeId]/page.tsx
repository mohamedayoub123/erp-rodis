import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteProgrammeDispatcherHistoryGroupAction } from "../actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { ZonePrintButton } from "@/app/_components/zone-print-button";
import Link from "next/link";
import { fetchPdCodeByGroupeId, fetchPlCodeByGroupeId } from "@/lib/programme-numbering";

type HistoryRow = {
  id: number;
  groupe_id: number | null;
  source_groupe_id: number | null;
  zone: string;
  chaine: string | null;
  article_id: number | null;
  produit: string | null;
  code: string | null;
  qt_carton: number | null;
  qt_vrac: number | null;
  date_jour: string;
  created_at: string;
  cree_par: string | null;
};

type ArticleProductionInfo = {
  piece_par_carton: number | null;
  dispenseur_pcs_carton: number | null;
  besoin_pot_flacon: boolean | null;
  besoin_capsule: boolean | null;
  besoin_sleeve: boolean | null;
  besoin_carton: boolean | null;
  besoin_etiquette: boolean | null;
  besoin_etui: boolean | null;
  besoin_dispenseur: boolean | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

async function fetchArticlesInfo(articleIds: number[]): Promise<Map<number, ArticleProductionInfo>> {
  const map = new Map<number, ArticleProductionInfo>();
  if (articleIds.length === 0) return map;

  const { data } = await supabaseServer
    .from("articles")
    .select(
      "id, piece_par_carton, dispenseur_pcs_carton, besoin_pot_flacon, besoin_capsule, besoin_sleeve, besoin_carton, besoin_etiquette, besoin_etui, besoin_dispenseur"
    )
    .in("id", articleIds);

  const rows = (data ?? []) as (ArticleProductionInfo & { id: number })[];
  for (const row of rows) {
    map.set(row.id, row);
  }

  return map;
}

function computePieces(qtCarton: number | null, piecePerCarton: number | null | undefined) {
  if (!qtCarton || !piecePerCarton) return null;
  return qtCarton * piecePerCarton;
}

function computeDispenseur(qtCarton: number | null, dispenseurPcsCarton: number | null | undefined) {
  if (!qtCarton || !dispenseurPcsCarton) return null;
  return qtCarton * dispenseurPcsCarton;
}

function formatCell(value: number | null) {
  if (value === null) return "";
  return Math.round(value).toLocaleString("fr-FR");
}

// Machine Fabrication n'existe que pour les programmes issus de "Programme"
// (MB) - reconnaissables via programme_lignes.source_numero_programme (non
// nul uniquement pour les lignes miroir creees par syncProgrammeLignesMirror,
// voir app/production/programme/actions.ts) - jamais pour "Programme par
// ligne", qui n'a pas cette notion. Retrouvee via les lignes source
// (programmes.machine_fabrication_id), associee par article_id, comme sur
// la page Dispatch en direct.
async function fetchMachineFabricationByArticleId(sourceGroupeIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (sourceGroupeIds.length === 0) return map;

  const { data: mirrorLignesData } = await supabaseServer
    .from("programme_lignes")
    .select("groupe_id, source_numero_programme")
    .in("groupe_id", sourceGroupeIds)
    .not("source_numero_programme", "is", null);

  const numerosProgramme = [
    ...new Set(
      ((mirrorLignesData ?? []) as { source_numero_programme: number }[]).map((row) => row.source_numero_programme)
    ),
  ];
  if (numerosProgramme.length === 0) return map;

  const { data: lignesData } = await supabaseServer
    .from("programmes")
    .select("article_id, machine_fabrication_id")
    .in("numero_programme", numerosProgramme);

  const lignes = (lignesData ?? []) as { article_id: number; machine_fabrication_id: number | null }[];
  const machineIds = [...new Set(lignes.map((l) => l.machine_fabrication_id).filter((id): id is number => !!id))];
  if (machineIds.length === 0) return map;

  const { data: machinesData } = await supabaseServer.from("machines").select("id, nom").in("id", machineIds);
  const machineNomById = new Map(((machinesData ?? []) as { id: number; nom: string }[]).map((m) => [m.id, m.nom]));

  for (const ligne of lignes) {
    if (ligne.machine_fabrication_id) {
      const nom = machineNomById.get(ligne.machine_fabrication_id);
      if (nom) map.set(ligne.article_id, nom);
    }
  }

  return map;
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
      "id, groupe_id, source_groupe_id, zone, chaine, article_id, produit, code, qt_carton, qt_vrac, date_jour, created_at, cree_par"
    )
    .eq("groupe_id", groupeIdNumber)
    .order("id", { ascending: true });

  const rows = (data ?? []) as HistoryRow[];

  if (rows.length === 0) {
    notFound();
  }

  const articleIds = [...new Set(rows.map((row) => row.article_id).filter((id): id is number => !!id))];
  const sourceGroupeIds = [...new Set(rows.map((row) => row.source_groupe_id).filter((id): id is number => id !== null))];
  const [articlesInfo, machineFabricationByArticleId] = await Promise.all([
    fetchArticlesInfo(articleIds),
    fetchMachineFabricationByArticleId(sourceGroupeIds),
  ]);

  // Groupe par zone (une section par zone, espacee, avec son propre bouton
  // imprimer) - meme presentation que la page Dispatch en direct
  // (app/production/programme/[numero]/dispatch/page.tsx), pour que le PD
  // enregistre montre exactement la meme chose que ce qui a ete dispatche.
  const zonesInView = [...new Set(rows.map((row) => row.zone))].sort((a, b) =>
    a.localeCompare(b, "fr", { numeric: true })
  );
  const rowsByZone = new Map<string, HistoryRow[]>();
  for (const zone of zonesInView) rowsByZone.set(zone, []);
  for (const row of rows) {
    rowsByZone.get(row.zone)?.push(row);
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

        {zonesInView.map((zone) => {
          const zoneRows = rowsByZone.get(zone) ?? [];

          const hasArticleFlag = (flag: keyof ArticleProductionInfo) =>
            zoneRows.some((row) => (row.article_id ? articlesInfo.get(row.article_id)?.[flag] : false));
          const showFlaconPot = hasArticleFlag("besoin_pot_flacon");
          const showCapsulePompe = hasArticleFlag("besoin_capsule");
          const showSleeve = hasArticleFlag("besoin_sleeve");
          const showCarton = hasArticleFlag("besoin_carton");
          const showEtiquette = hasArticleFlag("besoin_etiquette");
          const showEtui = hasArticleFlag("besoin_etui");
          const showDispenseur = hasArticleFlag("besoin_dispenseur");
          const showMachineFab = zoneRows.some(
            (row) => row.article_id && machineFabricationByArticleId.has(row.article_id)
          );

          return (
            <section
              key={zone}
              data-print-zone={zone}
              className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
            >
              <div className="no-print flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <h2 className="text-lg font-bold text-slate-900">{zone}</h2>
                <ZonePrintButton zone={zone} />
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Chaine</th>
                      {showMachineFab ? <th className="px-4 py-3 font-semibold">Machine Fab</th> : null}
                      <th className="px-4 py-3 font-semibold">Produit</th>
                      <th className="px-4 py-3 font-semibold">Code</th>
                      <th className="px-4 py-3 font-semibold">Qt carton</th>
                      <th className="px-4 py-3 font-semibold">Qt vrac</th>
                      {showFlaconPot ? <th className="px-4 py-3 font-semibold">Flacon/Pot</th> : null}
                      {showCapsulePompe ? <th className="px-4 py-3 font-semibold">Capsule/Pompe</th> : null}
                      {showSleeve ? <th className="px-4 py-3 font-semibold">Sleeve</th> : null}
                      {showCarton ? <th className="px-4 py-3 font-semibold">Carton</th> : null}
                      {showEtiquette ? <th className="px-4 py-3 font-semibold">Etiquete</th> : null}
                      {showEtui ? <th className="px-4 py-3 font-semibold">Nb Etuit</th> : null}
                      {showDispenseur ? <th className="px-4 py-3 font-semibold">Dispenseur</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {zoneRows.map((row) => {
                      const article = row.article_id ? articlesInfo.get(row.article_id) : undefined;
                      const pieces = computePieces(row.qt_carton, article?.piece_par_carton);
                      const machineFab = row.article_id
                        ? machineFabricationByArticleId.get(row.article_id)
                        : undefined;

                      return (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.chaine || "-"}</td>
                          {showMachineFab ? (
                            <td className="px-4 py-3 text-slate-600">{machineFab || "-"}</td>
                          ) : null}
                          <td className="px-4 py-3 text-slate-600">{row.produit || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.code || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.qt_carton !== null ? Math.round(row.qt_carton).toLocaleString("fr-FR") : "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.qt_vrac !== null ? row.qt_vrac.toLocaleString("fr-FR") : "-"}
                          </td>
                          {showFlaconPot ? (
                            <td className="px-4 py-3 text-slate-600">
                              {article?.besoin_pot_flacon ? formatCell(pieces) : ""}
                            </td>
                          ) : null}
                          {showCapsulePompe ? (
                            <td className="px-4 py-3 text-slate-600">
                              {article?.besoin_capsule ? formatCell(pieces) : ""}
                            </td>
                          ) : null}
                          {showSleeve ? (
                            <td className="px-4 py-3 text-slate-600">
                              {article?.besoin_sleeve ? formatCell(pieces) : ""}
                            </td>
                          ) : null}
                          {showCarton ? (
                            <td className="px-4 py-3 text-slate-600">
                              {article?.besoin_carton ? formatCell(row.qt_carton) : ""}
                            </td>
                          ) : null}
                          {showEtiquette ? (
                            <td className="px-4 py-3 text-slate-600">
                              {article?.besoin_etiquette ? formatCell(pieces) : ""}
                            </td>
                          ) : null}
                          {showEtui ? (
                            <td className="px-4 py-3 text-slate-600">
                              {article?.besoin_etui ? formatCell(pieces) : ""}
                            </td>
                          ) : null}
                          {showDispenseur ? (
                            <td className="px-4 py-3 text-slate-600">
                              {article?.besoin_dispenseur
                                ? formatCell(computeDispenseur(row.qt_carton, article?.dispenseur_pcs_carton))
                                : ""}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
