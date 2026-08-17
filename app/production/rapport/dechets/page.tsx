import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import {
  buildPdLabelByCode,
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllProgrammeLignes,
  fetchArticleKgFactorsByIds,
  formatDate,
  groupCartonEntriesByLigne,
  pdLabelsForNumeroLot,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../suivi/data";

// Rapport Dechets : par code, pieces reellement fabriquees (carton fabrique
// x piece_par_carton, meme facteur que Rapport Balance Matiere) vs pieces
// jetees (somme des 7 champs dechet_* de Conditionnement), et le % de
// dechet (dechet / (fabrique + dechet)).
type Statut = "Termine" | "Termine Manuel" | "En cours" | "Pas commence";

const DECHET_FIELDS = [
  "dechet_sleeve",
  "dechet_capsule",
  "dechet_pompe",
  "dechet_flacon",
  "dechet_pot",
  "dechet_etiquette",
  "dechet_etui",
] as const;

type DechetRow = { programme_ligne_id: number; code: string } & Record<
  (typeof DECHET_FIELDS)[number],
  number | null
>;

async function fetchDechetsByLigneCode(ligneIds: number[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ligneIds.length === 0) return map;

  const columns = ["programme_ligne_id", "code", ...DECHET_FIELDS].join(", ");
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(columns)
      .in("programme_ligne_id", ligneIds)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as unknown as DechetRow[];
    for (const row of chunk) {
      const total = DECHET_FIELDS.reduce((sum, field) => sum + Number(row[field] ?? 0), 0);
      const key = `${row.programme_ligne_id}::${row.code}`;
      map.set(key, (map.get(key) ?? 0) + total);
    }

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return map;
}

function StatutBadge({ statut }: { statut: Statut }) {
  const className =
    statut === "Termine"
      ? "bg-emerald-100 text-emerald-800"
      : statut === "Termine Manuel"
        ? "bg-violet-100 text-violet-800"
        : statut === "En cours"
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{statut}</span>;
}

function PctDechetCell({ value }: { value: number | null }) {
  if (value === null) return <td className="px-4 py-3 text-slate-400">-</td>;
  const className =
    value > 5 ? "font-semibold text-red-700" : value > 2 ? "font-semibold text-amber-700" : "text-slate-600";
  return <td className={`px-4 py-3 ${className}`}>{value.toFixed(1)}%</td>;
}

const PAGE_SIZE = 200;

const EXPORT_COLUMNS = [
  { label: "Date", key: "date" },
  { label: "Code", key: "code" },
  { label: "Programme (PD)", key: "pd" },
  { label: "Produit", key: "produit" },
  { label: "Pieces fabriquees", key: "pieces" },
  { label: "Dechets", key: "dechet" },
  { label: "% dechet", key: "pctLabel" },
];

type SearchParams = Promise<{
  produit?: string;
  code?: string;
  page?: string;
  date_debut?: string;
  date_fin?: string;
}>;

export default async function RapportDechetsPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const hasFilters = Boolean(produitFilter || codeFilter || dateDebutFilter || dateFinFilter);
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sinceDate = hasFilters ? undefined : threeMonthsAgo.toISOString().slice(0, 10);

  const [{ rows: lignes }, cartonEntries, pdLabelByCode] = await Promise.all([
    fetchAllProgrammeLignes({ sinceDate }),
    fetchAllCartonEntries(),
    buildPdLabelByCode(),
  ]);

  const codeTermineRows = await fetchAllCodeTermineRows(lignes.map((ligne) => ligne.id));
  const terminatedCodes = new Set(
    codeTermineRows.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`)
  );

  const articleFactors = await fetchArticleKgFactorsByIds(lignes.map((ligne) => ligne.article_id));
  const dechetByKey = await fetchDechetsByLigneCode(lignes.map((ligne) => ligne.id));

  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);

  function ligneOwnCodes(ligne: ProgrammeLigneRow): string[] {
    return splitLigneIntoDisplayRows(ligne, "qt_vrac", 0).map((split) => split.displayCode);
  }

  const lignesWithLot = lignes.filter((ligne) => ligne.numero_lot);

  const allRows = lignesWithLot.flatMap((ligne) => {
    const codes = ligneOwnCodes(ligne);
    const cartonEntriesForLigne = (cartonByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];

    const cartonSplits = splitLigneIntoDisplayRows(ligne, "qt_carton", 0);
    const cartonDemandeByCode = new Map(
      cartonSplits.map((split) => [split.displayCode, split.displayQuantite ?? ligne.qt_carton ?? 0])
    );

    const cartonFabriqueByCode = computeProduitParCode(
      cartonEntriesForLigne,
      codes,
      (code) => cartonDemandeByCode.get(code) ?? 0
    );

    const factor = ligne.article_id ? articleFactors.get(ligne.article_id) : undefined;
    const pieceParCarton = factor?.pieceParCarton ?? null;

    return codes.map((code) => {
      const cartonDemande = cartonDemandeByCode.get(code) ?? 0;
      const cartonFabrique = cartonFabriqueByCode.get(code) ?? 0;

      const cartonManuel = Boolean(
        ligne.programme_termine || ligne.carton_termine || terminatedCodes.has(`${ligne.id}::${code}::carton`)
      );
      const cartonNaturel = cartonDemande <= 0 || cartonFabrique >= cartonDemande;
      const hasStarted = cartonFabrique > 0;
      const statut: Statut =
        cartonManuel || cartonNaturel
          ? cartonNaturel
            ? "Termine"
            : "Termine Manuel"
          : hasStarted
            ? "En cours"
            : "Pas commence";

      // Pieces reellement fabriquees (carton x piece_par_carton) - "-" si
      // le facteur manque, plutot que d'afficher 0 (trompeur).
      const pieces = pieceParCarton !== null && pieceParCarton > 0 ? cartonFabrique * pieceParCarton : null;
      const dechet = dechetByKey.get(`${ligne.id}::${code}`) ?? 0;
      const pct = pieces !== null && pieces + dechet > 0 ? (dechet / (pieces + dechet)) * 100 : null;

      return {
        statut,
        id: ligne.id,
        key: `${ligne.id}::${code}`,
        date: ligne.date_jour,
        code,
        pd: pdLabelsForNumeroLot(code, pdLabelByCode),
        produit: ligne.produit || "-",
        pieces,
        dechet,
        pct,
      };
    });
  });

  const produitOptions = [...new Set(allRows.map((row) => row.produit).filter((p) => p && p !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const codeOptions = [...new Set(allRows.map((row) => row.code).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
    .map((label, id) => ({ id, label }));

  const rows = allRows
    .filter((row) => {
      if (row.statut !== "Termine" && row.statut !== "Termine Manuel") return false;
      if ((row.pieces ?? 0) <= 0 && row.dechet <= 0) return false;
      if (produitFilter && !row.produit.toLowerCase().includes(produitFilter)) return false;
      if (codeFilter && !row.code.toLowerCase().includes(codeFilter)) return false;
      if (dateDebutFilter && row.date < dateDebutFilter) return false;
      if (dateFinFilter && row.date > dateFinFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const pdCompare = b.pd.localeCompare(a.pd, "fr", { numeric: true });
      if (pdCompare !== 0) return pdCompare;
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.code.localeCompare(b.code, "fr", { numeric: true });
    });

  const totalPieces = rows.reduce((sum, row) => sum + (row.pieces ?? 0), 0);
  const totalDechet = rows.reduce((sum, row) => sum + row.dechet, 0);
  const totalPct = totalPieces + totalDechet > 0 ? (totalDechet / (totalPieces + totalDechet)) * 100 : null;

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(from, from + PAGE_SIZE);

  const exportRows = rows.map((row) => ({
    date: formatDate(row.date),
    code: row.code,
    pd: row.pd,
    produit: row.produit,
    pieces: row.pieces !== null ? Math.round(row.pieces) : "",
    dechet: Math.round(row.dechet),
    pctLabel: row.pct !== null ? `${row.pct.toFixed(1)}%` : "",
  }));

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.produit) qs.set("produit", params.produit);
    if (params.code) qs.set("code", params.code);
    if (params.date_debut) qs.set("date_debut", params.date_debut);
    if (params.date_fin) qs.set("date_fin", params.date_fin);
    return `/production/rapport/dechets?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport Dechets</h1>
              <p className="mt-2 text-sm text-slate-600">
                Par code : pieces reellement fabriquees vs pieces jetees (dechet), et le % de dechet.
              </p>
              {sinceDate ? (
                <p className="mt-1 text-xs text-slate-400">
                  Affiche les 3 derniers mois par defaut - cherche un produit ou un code pour retrouver plus
                  ancien.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <ExportExcelButton
                rows={exportRows}
                columns={EXPORT_COLUMNS}
                filename={`rapport-dechets-${new Date().toISOString().slice(0, 10)}.xlsx`}
              />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="produit"
              defaultValue={params.produit || ""}
              options={produitOptions}
              placeholder="Produit"
            />
            <SearchableFilterInput
              name="code"
              defaultValue={params.code || ""}
              options={codeOptions}
              placeholder="Code"
            />
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/rapport/dechets"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}

            <div className="flex flex-wrap items-end gap-4 sm:col-span-4">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date programme depuis
                <input
                  type="date"
                  name="date_debut"
                  defaultValue={params.date_debut || ""}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date programme jusqu&apos;au
                <input
                  type="date"
                  name="date_fin"
                  defaultValue={params.date_fin || ""}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
                />
              </label>
            </div>
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.75rem] border border-black/5 bg-sky-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
              Total pieces fabriquees
            </p>
            <p className="mt-2 text-3xl font-black text-sky-900">{Math.round(totalPieces)}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-red-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">Total dechets</p>
            <p className="mt-2 text-3xl font-black text-red-900">{Math.round(totalDechet)}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">% dechet global</p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {totalPct !== null ? `${totalPct.toFixed(1)}%` : "-"}
            </p>
          </div>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun code programme pour le moment."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Statut</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date programme</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Programme (PD)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Produit</th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                      Pieces fabriquees
                    </th>
                    <th className="sticky top-0 z-10 bg-red-50 px-4 py-3 font-semibold text-red-800">
                      Dechets
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">% dechet</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <StatutBadge statut={row.statut} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.code}</td>
                      <td className="px-4 py-3 text-slate-600">{row.pd}</td>
                      <td className="px-4 py-3 text-slate-600">{row.produit}</td>
                      <td className="bg-sky-50/30 px-4 py-3 text-slate-600">
                        {row.pieces !== null ? Math.round(row.pieces) : "-"}
                      </td>
                      <td className="bg-red-50/30 px-4 py-3 text-slate-600">{Math.round(row.dechet)}</td>
                      <PctDechetCell value={row.pct} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {totalRows > 0 ? (
          <div className="flex items-center justify-between rounded-[1.75rem] border border-black/5 bg-white px-6 py-4 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-slate-500">
              Codes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows}
            </p>

            <div className="flex gap-3">
              <Link
                href={buildPageHref(Math.max(1, currentPage - 1))}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage === 1
                    ? "pointer-events-none bg-slate-100 text-slate-400"
                    : "bg-slate-950 text-white"
                }`}
              >
                Precedent
              </Link>
              <Link
                href={buildPageHref(Math.min(totalPages, currentPage + 1))}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage >= totalPages
                    ? "pointer-events-none bg-slate-100 text-slate-400"
                    : "bg-slate-950 text-white"
                }`}
              >
                Suivant
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
