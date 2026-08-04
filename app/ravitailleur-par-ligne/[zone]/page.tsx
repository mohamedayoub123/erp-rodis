import { notFound } from "next/navigation";
import { BackButton } from "@/app/_components/back-button";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { deleteAllDispatcherLignesAction } from "../dispatcher-actions";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "../../production/suivi/data";
import { ZonePrintButton } from "../zone-print-button";

const VALID_ZONES = ["B1Z1", "B1Z2", "B4Z1", "B4Z2", "B4Z3", "D"];

const COLUMNS = [
  "DATE",
  "CHAINE",
  "PRODUIT",
  "CODE",
  "QT CARTON",
  "QT VRAC",
  "FLACON/POT",
  "CAPSULE/POMPE",
  "SLEEVE",
  "CARTON",
  "ETIQUETE",
  "NB ETUIT",
  "DISPENSEUR",
];

type DispatcherRow = {
  id: number;
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

async function fetchDispatcherRows(zone: string): Promise<DispatcherRow[]> {
  const rows: DispatcherRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .select("id, article_id, date_jour, chaine, produit, code, qt_carton, qt_vrac")
      .eq("zone", zone)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as DispatcherRow[];
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

// Nb total de pieces = qt de carton * piece par carton (parametre de
// l'article) - utilise pour Flacon/Pot, Capsule/Pompe, Sleeve, Carton,
// Etiquete, Nb Etui.
function computePieces(qtCarton: number | null, piecePerCarton: number | null | undefined) {
  if (!qtCarton || !piecePerCarton) return null;
  return qtCarton * piecePerCarton;
}

// Dispenseur : calcul different des autres - qt de carton * nb de
// dispenseur par carton (pas via le nb de pieces).
function computeDispenseur(qtCarton: number | null, dispenseurPcsCarton: number | null | undefined) {
  if (!qtCarton || !dispenseurPcsCarton) return null;
  return qtCarton * dispenseurPcsCarton;
}

function formatCell(value: number | null) {
  if (value === null) return "";
  return Math.round(value).toLocaleString("fr-FR");
}

export default async function RavitailleurParLigneZonePage({
  params,
}: {
  params: Promise<{ zone: string }>;
}) {
  noStore();
  const { zone } = await params;
  const zoneUpper = decodeURIComponent(zone).toUpperCase();
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "ravitailleurParLigne");

  if (!VALID_ZONES.includes(zoneUpper)) {
    notFound();
  }

  const dataRows = await fetchDispatcherRows(zoneUpper);
  const articleIds = [...new Set(dataRows.map((row) => row.article_id).filter((id): id is number => !!id))];
  const articlesInfo = await fetchArticlesInfo(articleIds);

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
                Programme Dispatcher {zoneUpper}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/ravitailleur-par-ligne" />
              <RefreshButton />
              <ZonePrintButton zone={zoneUpper} iconOnly />
              {canDelete ? (
                <form action={deleteAllDispatcherLignesAction}>
                  <input type="hidden" name="zone" value={zoneUpper} />
                  <DeleteIconButton label="Supprimer tout" />
                </form>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th
                    colSpan={COLUMNS.length}
                    className="border border-slate-300 bg-slate-300 px-3 py-2 text-center font-bold text-slate-900"
                  >
                    {zoneUpper}
                  </th>
                </tr>
                <tr>
                  {COLUMNS.map((column) => (
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
                {dataRows.map((row) => {
                  const article = row.article_id ? articlesInfo.get(row.article_id) : undefined;
                  const pieces = computePieces(row.qt_carton, article?.piece_par_carton);

                  return (
                    <tr key={row.id}>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {row.date_jour ? formatDate(row.date_jour) : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">{row.chaine || ""}</td>
                      <td className="border border-slate-300 bg-white px-3 py-3">{row.produit || ""}</td>
                      <td className="border border-slate-300 bg-white px-3 py-3">{row.code || ""}</td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {row.qt_carton !== null ? Math.round(row.qt_carton).toLocaleString("fr-FR") : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {row.qt_vrac !== null ? row.qt_vrac.toLocaleString("fr-FR") : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {article?.besoin_pot_flacon ? formatCell(pieces) : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {article?.besoin_capsule ? formatCell(pieces) : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {article?.besoin_sleeve ? formatCell(pieces) : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {article?.besoin_carton ? formatCell(row.qt_carton) : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {article?.besoin_etiquette ? formatCell(pieces) : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {article?.besoin_etui ? formatCell(pieces) : ""}
                      </td>
                      <td className="border border-slate-300 bg-white px-3 py-3">
                        {article?.besoin_dispenseur
                          ? formatCell(computeDispenseur(row.qt_carton, article?.dispenseur_pcs_carton))
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
