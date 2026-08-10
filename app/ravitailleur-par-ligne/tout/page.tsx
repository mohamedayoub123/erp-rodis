import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ZonePrintButton } from "@/app/_components/zone-print-button";
import { DispatcherSaveAllButton } from "../dispatcher-save-all-button";
import { formatDate } from "../../production/suivi/data";
import { computePlCodesByGroupeId } from "@/lib/programme-pl-code";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { DispatcherRowEditor } from "../dispatcher-row-editor";

const VALID_ZONES = ["B1Z1", "B1Z2", "B4Z1", "B4Z2", "B4Z3", "D"];

// PRODUIT (nom d'article, souvent long) a besoin de bien plus de place que
// les colonnes booleennes/numeriques etroites - sans ca, le tableau force
// en table-layout: fixed a l'impression repartit les 13 colonnes a peu pres
// egalement, et le nom de produit passe sur 3-4 lignes au lieu d'1-2.
// Largeur par NOM de colonne (pas par position) - une colonne "besoin"
// entierement vide pour une zone est retiree du tableau (voir
// visibleColumnsForZone), donc les colonnes reellement affichees varient
// d'une zone a l'autre.
const WIDTH_BY_COLUMN: Record<string, string> = {
  DATE: "6%",
  CHAINE: "7%",
  PRODUIT: "17%",
  CODE: "8%",
  "QT CARTON": "7%",
  "QT VRAC": "7%",
  "FLACON/POT": "7%",
  "CAPSULE/POMPE": "7%",
  SLEEVE: "6%",
  CARTON: "6%",
  ETIQUETE: "6%",
  "NB ETUIT": "6%",
  DISPENSEUR: "7%",
};

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
  groupe_id: number | null;
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

async function fetchAllDispatcherRows(): Promise<DispatcherRow[]> {
  const rows: DispatcherRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .select("id, zone, article_id, date_jour, chaine, produit, code, qt_carton, qt_vrac, groupe_id")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as DispatcherRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  // Trie par date puis par chaine (tri numerique-aware : "5" avant "10A")
  // au lieu de l'ordre d'insertion brut - le decoupage en lots (voir
  // buildDispatcherDraftRows) peut inserer les lignes d'une chaine avant
  // celles d'une autre dans un ordre qui ne correspond plus a l'ordre des
  // chaines (ex: un lot "reliquat combine" est toujours insere apres tous
  // les lots pleins, meme s'il appartient a une chaine plus petite), ce qui
  // affichait a tort une chaine avant une autre plus petite.
  rows.sort((a, b) => {
    const dateCompare = (a.date_jour || "").localeCompare(b.date_jour || "");
    if (dateCompare !== 0) return dateCompare;
    return (a.chaine || "").localeCompare(b.chaine || "", "fr", { numeric: true });
  });

  return rows;
}

// Toutes les lignes programme_lignes (pas seulement celles affichees) sont
// necessaires pour calculer le rang PLn.annee correctement - le rang depend
// de TOUS les groupes crees, pas seulement ceux representes ici.
async function fetchAllProgrammeLignesForPlCode(): Promise<
  { groupe_id: number | null; created_at: string; date_jour: string }[]
> {
  const rows: { groupe_id: number | null; created_at: string; date_jour: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("groupe_id, created_at, date_jour")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as { groupe_id: number | null; created_at: string; date_jour: string }[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

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

function countProgrammesByChaine(rows: DispatcherRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.chaine || "-";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr", { numeric: true }));
}

function uniqueDatesFrom(rows: DispatcherRow[]) {
  return [...new Set(rows.map((row) => row.date_jour).filter((date): date is string => !!date))].sort();
}

// Nb de programmes "Programme par ligne" (PL<n>.<annee>) distincts derriere
// les lignes actuellement affichees - repose sur groupe_id, rempli
// seulement depuis l'ajout de cette colonne : les lignes plus anciennes
// (groupe_id NULL) ne sont pas comptees. Un groupe_id dont le programme
// source a ete supprime depuis (Historique programme) n'a plus de code PL
// resolvable (plCodeByGroupeId) - il n'est plus compte non plus, sinon
// "Nb PL" annoncerait un programme qui n'existe plus dans l'historique.
function listDistinctPlCodes(rows: DispatcherRow[], plCodeByGroupeId: Map<number, string>) {
  const groupeIds = new Set(
    rows.map((row) => row.groupe_id).filter((id): id is number => id !== null && plCodeByGroupeId.has(id))
  );
  return [...groupeIds].map((id) => plCodeByGroupeId.get(id)!).sort();
}

// Remarque (voir Programme par ligne) : un champ libre pour tout le
// programme, pas par ligne - recuperee ici scopee aux groupe_id
// effectivement affiches sur cette page (pas toute la table, contrairement
// a fetchAllProgrammeLignesForPlCode qui a besoin de tout pour le rang).
async function fetchRemarqueByGroupeId(groupeIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (groupeIds.length === 0) return map;

  const { data } = await supabaseServer
    .from("programme_lignes")
    .select("groupe_id, remarque")
    .in("groupe_id", groupeIds)
    .not("remarque", "is", null);

  for (const row of (data as { groupe_id: number; remarque: string }[] | null) ?? []) {
    if (row.remarque && !map.has(row.groupe_id)) {
      map.set(row.groupe_id, row.remarque);
    }
  }

  return map;
}

function listDistinctRemarques(rows: DispatcherRow[], remarqueByGroupeId: Map<number, string>) {
  const groupeIds = new Set(
    rows.map((row) => row.groupe_id).filter((id): id is number => id !== null && remarqueByGroupeId.has(id))
  );
  return [...new Set([...groupeIds].map((id) => remarqueByGroupeId.get(id)!))];
}

export default async function RavitailleurToutesZonesPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "ravitailleurParLigne");
  const dataRows = await fetchAllDispatcherRows();
  const articleIds = [...new Set(dataRows.map((row) => row.article_id).filter((id): id is number => !!id))];
  const articlesInfo = await fetchArticlesInfo(articleIds);
  const programmesByChaine = countProgrammesByChaine(dataRows);
  const dates = uniqueDatesFrom(dataRows);
  const programmeLignesForPl = await fetchAllProgrammeLignesForPlCode();
  const plCodeByGroupeId = computePlCodesByGroupeId(programmeLignesForPl);
  const plCodes = listDistinctPlCodes(dataRows, plCodeByGroupeId);
  const groupeIdsInView = [
    ...new Set(dataRows.map((row) => row.groupe_id).filter((id): id is number => id !== null)),
  ];
  const remarqueByGroupeId = await fetchRemarqueByGroupeId(groupeIdsInView);
  const remarques = listDistinctRemarques(dataRows, remarqueByGroupeId);
  const rowsByZone = new Map<string, DispatcherRow[]>();
  for (const zone of VALID_ZONES) rowsByZone.set(zone, []);
  for (const row of dataRows) {
    const list = rowsByZone.get(row.zone);
    if (list) list.push(row);
  }
  const missingCodeCount = dataRows.filter((row) => !row.code || !row.code.trim()).length;

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
                Ravitailleur - Toutes les zones
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold text-slate-600">
                {dates.length > 0 ? (
                  <span>
                    Date{dates.length > 1 ? "s" : ""} : {dates.map((date) => formatDate(date)).join(", ")}
                  </span>
                ) : null}
                {plCodes.length > 0 ? <span>PL : {plCodes.join(", ")}</span> : null}
                {remarques.length > 0 ? <span>Remarque : {remarques.join(", ")}</span> : null}
                {programmesByChaine.map(([chaine, count]) => (
                  <span key={chaine}>
                    {chaine} : {count} programme{count > 1 ? "s" : ""}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/ravitailleur-par-ligne" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {missingCodeCount > 0 ? (
          <section className="no-print rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">
            {missingCodeCount} ligne{missingCodeCount > 1 ? "s" : ""} sans code (surlignee
            {missingCodeCount > 1 ? "s" : ""} en rouge ci-dessous) - le systeme n&apos;a jamais vu de
            code pour cette famille de produit, tape le 1er code toi-meme dans la case CODE.
          </section>
        ) : null}

        {VALID_ZONES.map((zone) => {
          const zoneRows = rowsByZone.get(zone) ?? [];

          // Une colonne "besoin" (FLACON/POT, CAPSULE/POMPE...) entierement
          // vide pour CETTE zone (aucun article affiche n'en a besoin)
          // n'apporte rien - elle est retiree du tableau (ecran ET
          // impression) plutot que d'afficher une colonne vide sur toute la
          // hauteur. Le calcul est propre a chaque zone : une colonne peut
          // etre vide ici mais remplie ailleurs.
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
                  <colgroup>
                    {visibleColumns.map((column) => (
                      <col key={column} style={{ width: WIDTH_BY_COLUMN[column] }} />
                    ))}
                  </colgroup>
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
                    {zoneRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={visibleColumns.length}
                          className="border border-slate-300 bg-white px-3 py-4 text-center text-slate-400"
                        >
                          Aucune ligne pour cette zone.
                        </td>
                      </tr>
                    ) : (
                      zoneRows.map((row) => {
                        const article = row.article_id ? articlesInfo.get(row.article_id) : undefined;
                        const pieces = computePieces(row.qt_carton, article?.piece_par_carton);

                        return (
                          <tr key={row.id}>
                            <td className="border border-slate-300 bg-white px-3 py-3">
                              {row.date_jour ? formatDate(row.date_jour) : ""}
                            </td>
                            <td className="border border-slate-300 bg-white px-3 py-3">{row.chaine || ""}</td>
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
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <DispatcherSaveAllButton />
      </div>
    </main>
  );
}
