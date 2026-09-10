import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canVoirPrixUser, getCurrentStockUser } from "@/lib/stock-auth";
import { formatDate } from "@/lib/format-date";
import { formatMinutes } from "@/lib/suivi-tirage-time";
import { fetchBlocsHeuresSup, SOURCE_LABELS, type BlocHeuresSup, type SourceEtape } from "@/lib/heures-supplementaires";

const PAGE_SIZE = 200;

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { fromIso: from.toISOString().slice(0, 10), toIso: now.toISOString().slice(0, 10) };
}

type SearchParams = Promise<{
  date_from?: string;
  date_to?: string;
  chaine?: string;
  source?: string | string[];
  page?: string;
}>;

export default async function RapportHeuresSupPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;

  const currentUser = await getCurrentStockUser();
  const canVoirPrix = await canVoirPrixUser(currentUser);

  if (!canVoirPrix) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            La visibilite de cette page est reservee (donnees liees a la main d&apos;oeuvre) - demande
            l&apos;acces a un administrateur si besoin.
          </section>
        </div>
      </main>
    );
  }

  const defaultRange = currentMonthRange();
  const dateFrom = (params.date_from || defaultRange.fromIso).trim();
  const dateTo = (params.date_to || defaultRange.toIso).trim();
  const chaineFilter = (params.chaine || "").trim().toLowerCase();
  const sourceParam = params.source ? (Array.isArray(params.source) ? params.source : [params.source]) : [];
  const sourceFilter = new Set<SourceEtape>(
    (sourceParam.length > 0 ? sourceParam : ["fabrication", "conditionnement", "emballage"]) as SourceEtape[]
  );
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  const tousLesBlocs = await fetchBlocsHeuresSup({ dateFrom, dateTo });
  const blocs = tousLesBlocs.filter(
    (b) => sourceFilter.has(b.source) && (!chaineFilter || b.chaine.toLowerCase().includes(chaineFilter))
  );

  const availableChaines = [...new Set(tousLesBlocs.map((b) => b.chaine))].sort();

  const totalNormalesMinutes = blocs.reduce((sum, b) => sum + b.normalesMinutes, 0);
  const totalSupMinutes = blocs.reduce((sum, b) => sum + b.supMinutes, 0);
  const totalJoursSupMinutes = blocs.reduce((sum, b) => sum + b.joursSupMinutes, 0);

  type ChaineAgg = {
    chaine: string;
    nbBlocs: number;
    normalesMinutes: number;
    supMinutes: number;
    joursSupMinutes: number;
  };
  const parChaine = new Map<string, ChaineAgg>();
  for (const b of blocs) {
    const current = parChaine.get(b.chaine) ?? {
      chaine: b.chaine,
      nbBlocs: 0,
      normalesMinutes: 0,
      supMinutes: 0,
      joursSupMinutes: 0,
    };
    current.nbBlocs += 1;
    current.normalesMinutes += b.normalesMinutes;
    current.supMinutes += b.supMinutes;
    current.joursSupMinutes += b.joursSupMinutes;
    parChaine.set(b.chaine, current);
  }
  const chaineRows = [...parChaine.values()].sort(
    (a, b) => b.supMinutes + b.joursSupMinutes - (a.supMinutes + a.joursSupMinutes)
  );

  const totalRows = blocs.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageFrom = (currentPage - 1) * PAGE_SIZE;
  const pagedBlocs = blocs.slice(pageFrom, pageFrom + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("date_from", dateFrom);
    qs.set("date_to", dateTo);
    if (chaineFilter) qs.set("chaine", chaineFilter);
    sourceFilter.forEach((s) => qs.append("source", s));
    return `/production/rapport/heures-sup?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Heures Supplementaires</h1>
              <p className="mt-2 text-sm text-slate-600">
                Par fournee (Fabrication/Conditionnement/Emballage) : normal 8h, au-dela c&apos;est de la
                sup - le samedi, toute la duree compte en jour sup.
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
            <div className="grid gap-3 sm:grid-cols-4">
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
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Chaine / machine
                <input
                  type="text"
                  name="chaine"
                  list="chaines-list"
                  defaultValue={params.chaine || ""}
                  placeholder="Toutes"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
                <datalist id="chaines-list">
                  {availableChaines.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <div className="flex items-end gap-3">
                <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                  Filtrer
                </button>
                <Link
                  href="/production/rapport/heures-sup"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </Link>
              </div>
            </div>

            <fieldset className="rounded-2xl border border-slate-200 px-4 py-3">
              <legend className="px-1 text-xs font-semibold text-slate-500">Etape</legend>
              <div className="flex flex-wrap gap-4 pt-1">
                {(Object.keys(SOURCE_LABELS) as SourceEtape[]).map((source) => (
                  <label key={source} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="source"
                      value={source}
                      defaultChecked={sourceFilter.has(source)}
                    />
                    {SOURCE_LABELS[source]}
                  </label>
                ))}
              </div>
            </fieldset>
          </form>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
            Heures normales :
            <span className="ml-2 font-bold text-emerald-900">{formatMinutes(totalNormalesMinutes)}</span>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm">
            Heures sup (semaine) :
            <span className="ml-2 font-bold text-amber-900">{formatMinutes(totalSupMinutes)}</span>
          </div>
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm">
            Jour sup (samedi) :
            <span className="ml-2 font-bold text-red-900">{formatMinutes(totalJoursSupMinutes)}</span>
          </div>
        </section>

        {chaineRows.length > 0 ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Total par chaine / machine</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Chaine / machine</th>
                    <th className="px-4 py-3 font-semibold">Fournees</th>
                    <th className="px-4 py-3 font-semibold">Heures normales</th>
                    <th className="px-4 py-3 font-semibold">Heures sup</th>
                    <th className="px-4 py-3 font-semibold">Jour sup</th>
                  </tr>
                </thead>
                <tbody>
                  {chaineRows.map((row) => (
                    <tr key={row.chaine} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.chaine}</td>
                      <td className="px-4 py-3 text-slate-600">{row.nbBlocs}</td>
                      <td className="px-4 py-3 text-slate-600">{formatMinutes(row.normalesMinutes)}</td>
                      <td className="px-4 py-3 font-semibold text-amber-700">{formatMinutes(row.supMinutes)}</td>
                      <td className="px-4 py-3 font-semibold text-red-700">{formatMinutes(row.joursSupMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">Detail par fournee</h2>
            <p className="mt-1 text-sm text-slate-500">{totalRows} fournee(s)</p>
          </div>

          {totalRows === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune fournee avec horaire/nb personnes sur cette periode.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Etape</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Chaine / machine</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Debut</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Fin</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Personnes</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Duree</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Normal</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Sup</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Jour sup</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBlocs.map((b: BlocHeuresSup, index) => (
                    <tr
                      key={`${b.source}-${b.code}-${b.dateJour}-${b.debutLabel}-${index}`}
                      className={`border-t border-slate-100 ${b.estSamedi ? "bg-red-50/40" : ""}`}
                    >
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(b.dateJour)}</td>
                      <td className="px-4 py-3 text-slate-600">{SOURCE_LABELS[b.source]}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{b.chaine}</td>
                      <td className="px-4 py-3 text-slate-600">{b.code}</td>
                      <td className="px-4 py-3 text-slate-600">{b.debutLabel}</td>
                      <td className="px-4 py-3 text-slate-600">{b.finLabel}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{b.nbPersonnes}</td>
                      <td className="px-4 py-3 text-slate-600">{formatMinutes(b.dureeMinutes)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {b.normalesMinutes > 0 ? formatMinutes(b.normalesMinutes) : "-"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-700">
                        {b.supMinutes > 0 ? formatMinutes(b.supMinutes) : "-"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-700">
                        {b.joursSupMinutes > 0 ? formatMinutes(b.joursSupMinutes) : "-"}
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
                    currentPage === 1 ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-slate-950 text-white"
                  }`}
                >
                  Precedent
                </Link>
                <Link
                  href={buildPageHref(Math.min(totalPages, currentPage + 1))}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    currentPage >= totalPages ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-slate-950 text-white"
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
