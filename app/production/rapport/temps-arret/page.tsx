import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { formatMinutes, hhmmDiffMinutes } from "@/lib/suivi-tirage-time";

const ARRET_FIELDS = [
  { key: "arret_depot", label: "Depot" },
  { key: "arret_consommable_non_livre", label: "Consommable" },
  { key: "arret_manque_conditionnement", label: "Manque cond." },
  { key: "arret_manque_vrac", label: "Manque vrac" },
  { key: "arret_technique", label: "Technique" },
  { key: "arret_coupure_courant", label: "Coupure courant" },
  { key: "arret_raclage_vrac", label: "Raclage vrac" },
  { key: "arret_changement_lot", label: "Changement lot" },
  { key: "arret_flacons_nc", label: "Flacons NC" },
  { key: "arret_autre", label: "Autre" },
] as const;

type ArretKey = (typeof ARRET_FIELDS)[number]["key"];

type SearchParams = Promise<{
  date_from?: string;
  date_to?: string;
  months?: string | string[];
  chaine?: string;
  zone?: string;
  page?: string;
}>;

type ProductionRapportRow = { temps_demarage_lot: string | null; temps_arret_batch: string | null } & Record<
  ArretKey,
  number | null
>;

type ProgrammeLigneRow = {
  id: number;
  date_jour: string | null;
  zone: string | null;
  chaine: string | null;
  produit: string | null;
  numero_lot: string | null;
  production_rapports: ProductionRapportRow | ProductionRapportRow[] | null;
};

const PAGE_SIZE = 200;

function firstRapport(
  value: ProductionRapportRow | ProductionRapportRow[] | null
): ProductionRapportRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const noms = [
    "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
  ];
  return `${noms[(month || 1) - 1]} ${year}`;
}

// Le mois par defaut evite de charger des annees de lignes non filtrees au
// premier chargement de la page.
function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = now.toISOString().slice(0, 10);
  return { fromIso, toIso };
}

const ROW_SELECT =
  "id,date_jour,zone,chaine,produit,numero_lot," +
  "production_rapports!inner(temps_demarage_lot,temps_arret_batch,arret_depot,arret_consommable_non_livre," +
  "arret_manque_conditionnement,arret_manque_vrac,arret_technique,arret_coupure_courant,arret_raclage_vrac," +
  "arret_changement_lot,arret_flacons_nc,arret_autre)";

export default async function RapportTempsArretPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const monthsParam = params.months;
  const selectedMonths = Array.isArray(monthsParam) ? monthsParam : monthsParam ? [monthsParam] : [];
  const hasAnyFilter = Boolean(params.date_from || params.date_to || selectedMonths.length > 0);
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  const defaultRange = currentMonthRange();
  const dateFrom = (params.date_from || (hasAnyFilter ? "" : defaultRange.fromIso)).trim();
  const dateTo = (params.date_to || (hasAnyFilter ? "" : defaultRange.toIso)).trim();

  // PostgREST plafonne chaque requete a ~1000 lignes peu importe l'absence
  // de .range() - il faut paginer en boucle, sinon des mois entiers
  // disparaissent silencieusement de la liste.
  const monthSet = new Set<string>();
  let monthFrom = 0;
  const monthPageSize = 1000;
  while (true) {
    const { data: monthChunk } = await supabaseServer
      .from("programme_lignes")
      .select("date_jour, production_rapports!inner(id)")
      .not("date_jour", "is", null)
      .range(monthFrom, monthFrom + monthPageSize - 1);

    const chunkRows = (monthChunk ?? []) as { date_jour: string }[];
    chunkRows.forEach((row) => monthSet.add(row.date_jour.slice(0, 7)));

    if (chunkRows.length < monthPageSize) break;
    monthFrom += monthPageSize;
  }
  const availableMonths = [...monthSet].sort();

  let rows: ProgrammeLigneRow[] = [];
  let error: { message: string } | null = null;
  let rowsFrom = 0;
  const rowsPageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("programme_lignes")
      .select(ROW_SELECT)
      .order("date_jour", { ascending: true })
      .order("chaine", { ascending: true })
      .range(rowsFrom, rowsFrom + rowsPageSize - 1);

    if (dateFrom) query = query.gte("date_jour", dateFrom);
    if (dateTo) query = query.lte("date_jour", dateTo);

    const { data: chunk, error: chunkError } = await query;

    if (chunkError) {
      error = chunkError;
      break;
    }

    const chunkRows = (chunk as unknown as ProgrammeLigneRow[] | null) ?? [];
    rows.push(...chunkRows);

    if (chunkRows.length < rowsPageSize) break;
    rowsFrom += rowsPageSize;
  }

  if (selectedMonths.length > 0) {
    rows = rows.filter((row) => row.date_jour && selectedMonths.includes(row.date_jour.slice(0, 7)));
  }

  const availableChaines = [...new Set(rows.map((row) => row.chaine).filter(Boolean))].sort() as string[];
  const availableZones = [...new Set(rows.map((row) => row.zone).filter(Boolean))].sort() as string[];

  const chaineFilter = (params.chaine || "").trim();
  const zoneFilter = (params.zone || "").trim();

  if (chaineFilter) {
    rows = rows.filter((row) => row.chaine === chaineFilter);
  }
  if (zoneFilter) {
    rows = rows.filter((row) => row.zone === zoneFilter);
  }

  const enriched = rows
    .map((row) => {
      const rapport = firstRapport(row.production_rapports);
      if (!rapport) return null;

      // arret_* sont deja en minutes dans production_rapports (formulaire
      // Rapport Conditionnement), pas de conversion a faire ici.
      const arrets = ARRET_FIELDS.map((field) => ({
        ...field,
        minutes: Math.round(Number(rapport[field.key] ?? 0)),
      }));
      const arretTotalMinutes = arrets.reduce((sum, arret) => sum + arret.minutes, 0);
      const tempsPlanifieMinutes = hhmmDiffMinutes(rapport.temps_demarage_lot, rapport.temps_arret_batch);
      const tempsTravailTotalMinutes = tempsPlanifieMinutes + arretTotalMinutes;

      return { row, arrets, arretTotalMinutes, tempsPlanifieMinutes, tempsTravailTotalMinutes };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const totalsByType = ARRET_FIELDS.map((field) => ({
    label: field.label,
    totalMinutes: enriched.reduce(
      (sum, entry) => sum + (entry.arrets.find((a) => a.key === field.key)?.minutes ?? 0),
      0
    ),
  }));

  const grandTotalArretMinutes = totalsByType.reduce((sum, t) => sum + t.totalMinutes, 0);
  const grandTotalTravailMinutes = enriched.reduce((sum, e) => sum + e.tempsTravailTotalMinutes, 0);

  const totalRows = enriched.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageFrom = (currentPage - 1) * PAGE_SIZE;
  const pagedEnriched = enriched.slice(pageFrom, pageFrom + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);
    selectedMonths.forEach((month) => qs.append("months", month));
    if (chaineFilter) qs.set("chaine", chaineFilter);
    if (zoneFilter) qs.set("zone", zoneFilter);
    return `/production/rapport/temps-arret?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Rapport Temps d&apos;Arret
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Temps d&apos;arret par chaine/zone/article, totaux par cause, et temps de travail par code.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Du
                <input
                  type="date"
                  name="date_from"
                  defaultValue={dateFrom}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Au
                <input
                  type="date"
                  name="date_to"
                  defaultValue={dateTo}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <div className="flex items-end gap-3">
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
                >
                  Filtrer
                </button>
                <Link
                  href="/production/rapport/temps-arret"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Chaine
                <select
                  name="chaine"
                  defaultValue={chaineFilter}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                >
                  <option value="">Toutes les chaines</option>
                  {availableChaines.map((chaine) => (
                    <option key={chaine} value={chaine}>
                      {chaine}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Zone
                <select
                  name="zone"
                  defaultValue={zoneFilter}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                >
                  <option value="">Toutes les zones</option>
                  {availableZones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {availableMonths.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Ou choisis un ou plusieurs mois (remplace Du/Au)
                </p>
                <div className="flex flex-wrap gap-3">
                  {availableMonths.map((month) => (
                    <label
                      key={month}
                      className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        name="months"
                        value={month}
                        defaultChecked={selectedMonths.includes(month)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {monthLabel(month)}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </form>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="mb-3 text-lg font-bold text-slate-900">
            Total par cause d&apos;arret (toutes chaines confondues)
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {totalsByType.map((t) => (
                    <th key={t.label} className="px-4 py-3 font-semibold">
                      {t.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-semibold">Total arrets</th>
                  <th className="px-4 py-3 font-semibold">Total travail</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  {totalsByType.map((t) => (
                    <td key={t.label} className="px-4 py-3 text-slate-700">
                      {formatMinutes(t.totalMinutes)}
                    </td>
                  ))}
                  <td className="px-4 py-3 font-semibold text-amber-700">
                    {formatMinutes(grandTotalArretMinutes)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {formatMinutes(grandTotalTravailMinutes)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">Detail par ligne</h2>
            <p className="mt-1 text-sm text-slate-500">{totalRows} ligne(s)</p>
          </div>

          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : totalRows === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune ligne pour cette periode.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Zone</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Chaine</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code</th>
                    {ARRET_FIELDS.map((f) => (
                      <th key={f.key} className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                        {f.label}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Temps arret total</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Temps planifie</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Temps travail total</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEnriched.map(({ row, arrets, arretTotalMinutes, tempsPlanifieMinutes, tempsTravailTotalMinutes }) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.date_jour)}</td>
                      <td className="px-4 py-3 text-slate-600">{row.zone || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.chaine || "-"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.produit || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.numero_lot || "-"}</td>
                      {arrets.map((a) => (
                        <td key={a.key} className="px-4 py-3 text-slate-600">
                          {a.minutes > 0 ? `${a.minutes} min` : "-"}
                        </td>
                      ))}
                      <td className="px-4 py-3 font-semibold text-amber-700">
                        {formatMinutes(arretTotalMinutes)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatMinutes(tempsPlanifieMinutes)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatMinutes(tempsTravailTotalMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalRows > 0 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 text-sm">
              <p className="text-slate-500">
                Lignes {pageFrom + 1} a {Math.min(pageFrom + PAGE_SIZE, totalRows)} sur {totalRows}
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
        </section>
      </div>
    </main>
  );
}
