import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "@/lib/format-date";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { DispatcherRowEditor } from "@/app/_components/dispatcher-row-editor";
import { ZonePrintButton } from "@/app/_components/zone-print-button";
import { deleteProgrammeDispatchByGroupAction } from "./actions";
import { DispatchSaveButton } from "./dispatch-save-button";

type DispatcherRow = {
  id: number;
  zone: string;
  article_id: number | null;
  date_jour: string | null;
  chaine: string | null;
  produit: string | null;
  code: string | null;
  qt_carton: number | null;
  qt_vrac: number | null;
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

// Le groupe_id est desormais un vrai groupe_id programme_lignes (positif),
// pas une formule fixe - retrouve via source_numero_programme (voir
// syncProgrammeLignesMirror, app/production/programme/actions.ts). Null si
// ce programme n'a jamais ete dispatche.
async function resolveGroupeId(numeroProgramme: number): Promise<number | null> {
  const { data, error } = await supabaseServer
    .from("programme_lignes")
    .select("groupe_id")
    .eq("source_numero_programme", numeroProgramme)
    .not("groupe_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) return null;

  return (data as { groupe_id: number } | null)?.groupe_id ?? null;
}

async function fetchDispatchRows(groupeId: number): Promise<DispatcherRow[]> {
  const rows: DispatcherRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .select("id, zone, article_id, date_jour, chaine, produit, code, qt_carton, qt_vrac")
      .eq("groupe_id", groupeId)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as DispatcherRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  rows.sort((a, b) => {
    const zoneCompare = (a.zone || "").localeCompare(b.zone || "", "fr", { numeric: true });
    if (zoneCompare !== 0) return zoneCompare;
    return (a.chaine || "").localeCompare(b.chaine || "", "fr", { numeric: true });
  });

  return rows;
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

// Machine Fabrication n'existe pas sur programme_dispatcher_lignes (table
// partagee avec "Programme par ligne", qui n'a pas cette notion) - retrouvee
// ici via les lignes source du programme (programmes.machine_fabrication_id),
// associee par article_id.
async function fetchMachineFabricationByArticleId(numeroProgramme: number): Promise<Map<number, string>> {
  const map = new Map<number, string>();

  const { data: lignesData } = await supabaseServer
    .from("programmes")
    .select("article_id, machine_fabrication_id")
    .eq("numero_programme", numeroProgramme);

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

function uniqueDatesFrom(rows: DispatcherRow[]) {
  return [...new Set(rows.map((row) => row.date_jour).filter((date): date is string => !!date))].sort();
}

export default async function ProgrammeDispatchPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  noStore();
  const { numero } = await params;
  const numeroProgramme = Number(numero);
  if (!numeroProgramme) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "programme");
  const canEdit = await canWritePageUser(currentUser, "programme");

  const groupeId = await resolveGroupeId(numeroProgramme);

  const [dataRows, machineFabricationByArticleId] = await Promise.all([
    groupeId ? fetchDispatchRows(groupeId) : Promise.resolve([]),
    fetchMachineFabricationByArticleId(numeroProgramme),
  ]);

  const articleIds = [...new Set(dataRows.map((row) => row.article_id).filter((id): id is number => !!id))];
  const articlesInfo = await fetchArticlesInfo(articleIds);
  const dates = uniqueDatesFrom(dataRows);
  const missingCodeCount = dataRows.filter((row) => !row.code || !row.code.trim()).length;

  // Groupe par zone (une section par zone, comme Ravitailleur "Toutes les
  // zones") - seulement les zones reellement touchees par ce programme, pas
  // les 6 zones fixes (contrairement a "tout", qui est un tableau de bord
  // permanent voulant toujours tout montrer).
  const zonesInView = [...new Set(dataRows.map((row) => row.zone))].sort((a, b) =>
    a.localeCompare(b, "fr", { numeric: true })
  );
  const rowsByZone = new Map<string, DispatcherRow[]>();
  for (const zone of zonesInView) rowsByZone.set(zone, []);
  for (const row of dataRows) {
    rowsByZone.get(row.zone)?.push(row);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="no-print rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Dispatch - MB.{(dates[0] || "").slice(0, 4) || "----"}.{numeroProgramme}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold text-slate-600">
                {dates.length > 0 ? (
                  <span>
                    Date{dates.length > 1 ? "s" : ""} : {dates.map((date) => formatDate(date)).join(", ")}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href={`/production/programme/${numeroProgramme}`} label="Retour" />
              <RefreshButton />
              {canDelete && dataRows.length > 0 ? (
                <form action={deleteProgrammeDispatchByGroupAction}>
                  <input type="hidden" name="numero_programme" value={numeroProgramme} />
                  <DeleteIconButton label="Supprimer tout" />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        {missingCodeCount > 0 ? (
          <section className="no-print rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">
            {missingCodeCount} ligne{missingCodeCount > 1 ? "s" : ""} sans code (surlignee
            {missingCodeCount > 1 ? "s" : ""} en rouge ci-dessous) - tape le 1er code toi-meme dans la
            case CODE.
          </section>
        ) : null}

        {zonesInView.length === 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white px-5 py-8 text-center text-sm text-slate-400 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune ligne dispatchee - clique &quot;Dispatch&quot; depuis la page du programme.
          </section>
        ) : (
          zonesInView.map((zone) => {
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

            const visibleColumns = [
              "DATE",
              "CHAINE",
              "MACHINE FAB",
              "PRODUIT",
              "CODE",
              "QT CARTON",
              "QT VRAC",
              ...(showFlaconPot ? ["FLACON/POT"] : []),
              ...(showCapsulePompe ? ["CAPSULE/POMPE"] : []),
              ...(showSleeve ? ["SLEEVE"] : []),
              ...(showCarton ? ["CARTON"] : []),
              ...(showEtiquette ? ["ETIQUETE"] : []),
              ...(showEtui ? ["NB ETUIT"] : []),
              ...(showDispenseur ? ["DISPENSEUR"] : []),
            ];

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
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr>
                        <th
                          colSpan={visibleColumns.length}
                          className="border border-slate-300 bg-slate-300 px-3 py-2 text-center font-bold text-slate-900"
                        >
                          {zone}
                        </th>
                      </tr>
                      <tr>
                        {visibleColumns.map((column) => (
                          <th
                            key={column}
                            className="border border-slate-300 bg-slate-200 px-3 py-2 text-center font-bold text-slate-900"
                          >
                            {column}
                          </th>
                        ))}
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
                          <tr key={row.id}>
                            <td className="border border-slate-300 bg-white px-3 py-3">
                              {row.date_jour ? formatDate(row.date_jour) : ""}
                            </td>
                            <td className="border border-slate-300 bg-white px-3 py-3">{row.chaine || ""}</td>
                            <td className="border border-slate-300 bg-white px-3 py-3">{machineFab || "-"}</td>
                            <td className="border border-slate-300 bg-white px-3 py-3">{row.produit || ""}</td>
                            <DispatcherRowEditor
                              id={row.id}
                              initialCode={row.code || ""}
                              initialQtCarton={row.qt_carton}
                              initialQtVrac={row.qt_vrac}
                              canEdit={canEdit}
                            />
                            {showFlaconPot ? (
                              <td className="border border-slate-300 bg-white px-3 py-3">
                                {article?.besoin_pot_flacon ? formatCell(pieces) : ""}
                              </td>
                            ) : null}
                            {showCapsulePompe ? (
                              <td className="border border-slate-300 bg-white px-3 py-3">
                                {article?.besoin_capsule ? formatCell(pieces) : ""}
                              </td>
                            ) : null}
                            {showSleeve ? (
                              <td className="border border-slate-300 bg-white px-3 py-3">
                                {article?.besoin_sleeve ? formatCell(pieces) : ""}
                              </td>
                            ) : null}
                            {showCarton ? (
                              <td className="border border-slate-300 bg-white px-3 py-3">
                                {article?.besoin_carton ? formatCell(row.qt_carton) : ""}
                              </td>
                            ) : null}
                            {showEtiquette ? (
                              <td className="border border-slate-300 bg-white px-3 py-3">
                                {article?.besoin_etiquette ? formatCell(pieces) : ""}
                              </td>
                            ) : null}
                            {showEtui ? (
                              <td className="border border-slate-300 bg-white px-3 py-3">
                                {article?.besoin_etui ? formatCell(pieces) : ""}
                              </td>
                            ) : null}
                            {showDispenseur ? (
                              <td className="border border-slate-300 bg-white px-3 py-3">
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
          })
        )}

        {dataRows.length > 0 ? <DispatchSaveButton numeroProgramme={numeroProgramme} /> : null}
      </div>
    </main>
  );
}
