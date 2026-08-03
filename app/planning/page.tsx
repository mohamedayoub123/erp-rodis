import Link from "next/link";
import { readPlanning } from "@/lib/excel-live";
import { PersistPageFilters } from "@/app/_components/persist-page-filters";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

const PAGE_SIZE = 100;

type SearchParams = Promise<{
  page?: string;
  q?: string;
  famille?: string;
}>;

type PlanningRow = ReturnType<typeof readPlanning>[number];

function buildPageHref(page: number, q: string, famille: string) {
  return `/planning?page=${page}&q=${encodeURIComponent(q)}&famille=${encodeURIComponent(
    famille
  )}`;
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const q = (params.q || "").trim().toLowerCase();
  const famille = (params.famille || "").trim().toLowerCase();
  const rows = readPlanning() as PlanningRow[];

  const filteredRows = rows.filter((row) => {
    const matchesQ =
      !q ||
      [
        row.famille,
        row.client,
        row.numero_proforma,
        row.article,
        row.mode_chargement,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));

    const matchesFamille =
      !famille || String(row.famille || "").toLowerCase().includes(famille);

    return matchesQ && matchesFamille;
  });
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;
  const paginatedRows = filteredRows.slice(from, to);

  const totalQuantite = filteredRows.reduce(
    (sum, row) => sum + Number(row.quantite_prevue ?? 0),
    0
  );
  const famillesCount = new Set(filteredRows.map((row) => row.famille).filter(Boolean)).size;
  const clientsCount = new Set(filteredRows.map((row) => row.client).filter(Boolean)).size;
  const topFamilles = [...new Set(filteredRows.map((row) => row.famille).filter(Boolean))].slice(
    0,
    8
  );
  const urgentRows = [...filteredRows]
    .sort((a, b) => Number(b.quantite_prevue ?? 0) - Number(a.quantite_prevue ?? 0))
    .slice(0, 6);
  const topClients = [...new Set(filteredRows.map((row) => row.client).filter(Boolean))].slice(
    0,
    6
  );
  const hasFilters = q.length > 0 || famille.length > 0;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ecfff6_0%,#f7fffb_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <PersistPageFilters />
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Planning familles
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Lecture directe des quantites prevues depuis les feuilles familles du classeur Excel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackButton href="/" label="Retour accueil" />
            <RefreshButton />
            <Link
              href="/stock-dormant-sans-commande"
              className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Voir stock sans commande
            </Link>
            <Link
              href="/commandes#nouvelle-commande"
              className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Creer commande
            </Link>
          </div>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#d1fae5_100%)] p-6 shadow-[0_18px_40px_rgba(16,185,129,0.1)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Si tu regardes le planning
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-emerald-950">
              Verifie puis lance l&apos;action utile
            </h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/80">
              Le planning sert a voir les quantites prevues par famille et client. Ensuite,
              tu peux aller vers la commande, le stock ou le dormant sans commande.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Link
                href="/commandes#nouvelle-commande"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-50"
              >
                Creer commande
              </Link>
              <Link
                href="/stock"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
              >
                Verifier stock
              </Link>
              <Link
                href="/stock-dormant-sans-commande"
                className="rounded-[1.25rem] bg-white px-4 py-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-50"
              >
                Voir sans commande
              </Link>
            </div>
          </article>

          <article className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Lecture simple
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Famille</p>
                <p className="mt-1">La feuille ou la gamme de planification.</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="font-semibold text-emerald-900">Client / proforma</p>
                <p className="mt-1">Le besoin prevu a servir ou preparer.</p>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="font-semibold text-amber-900">Quantite prevue</p>
                <p className="mt-1">Le volume a suivre avant commande et FIFO.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Lignes planning</h2>
              <p className="mt-1 text-sm text-slate-500">
                Total : {totalRows} ligne(s) affichee(s) sur {rows.length} lues
                directement depuis Excel. Page {safePage} sur {totalPages}.
              </p>
            </div>

            <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900">
              Planning live Excel
            </span>
          </div>

          <div className="grid gap-4 border-b border-slate-100 px-6 py-5 md:grid-cols-3">
            <Link
              href="/commandes"
              className="rounded-[1.5rem] border border-sky-200 bg-sky-50 px-4 py-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
            >
              Aller aux commandes
            </Link>
            <Link
              href="/stock"
              className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
            >
              Verifier le stock
            </Link>
            <Link
              href="/stock-dormant-sans-commande"
              className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Voir dormant sans commande
            </Link>
          </div>

          <div className="grid gap-4 border-b border-slate-100 px-6 py-5 md:grid-cols-4">
            <Link
              href="/admin"
              className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
            >
              1. Mettre a jour
            </Link>
            <Link
              href="/stock"
              className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
            >
              2. Verifier stock
            </Link>
            <Link
              href="/commandes#nouvelle-commande"
              className="rounded-[1.25rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 transition hover:bg-sky-100"
            >
              3. Saisir commande
            </Link>
            <Link
              href="/planning"
              className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
            >
              4. Controler planning
            </Link>
          </div>

          <form className="grid gap-3 border-b border-slate-100 px-6 py-5 md:grid-cols-[2fr_1fr_auto]">
            <input
              type="text"
              name="q"
              defaultValue={params.q || ""}
              placeholder="Chercher client, proforma, article..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="famille"
              defaultValue={params.famille || ""}
              placeholder="Filtrer famille..."
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
          </form>

          <div className="flex flex-wrap gap-3 border-b border-slate-100 px-6 py-5 text-sm">
            <Link
              href="/planning"
              className="rounded-full bg-slate-100 px-4 py-2 font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              Tous
            </Link>
            {params.q ? (
              <span className="rounded-full bg-sky-50 px-4 py-2 font-semibold text-sky-900">
                Recherche : {params.q}
              </span>
            ) : null}
            {params.famille ? (
              <span className="rounded-full bg-emerald-50 px-4 py-2 font-semibold text-emerald-900">
                Famille : {params.famille}
              </span>
            ) : null}
            {hasFilters ? (
              <Link
                href="/planning"
                className="rounded-full bg-red-50 px-4 py-2 font-semibold text-red-900 transition hover:bg-red-100"
              >
                Effacer filtres
              </Link>
            ) : (
              <span className="rounded-full bg-emerald-50 px-4 py-2 font-semibold text-emerald-900">
                Aucun filtre actif
              </span>
            )}
          </div>

          <div className="grid gap-4 border-b border-slate-100 px-6 py-5 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Cette page lit <span className="font-bold">directement Excel</span>.
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Utilise les filtres pour retrouver une <span className="font-bold">famille</span> ou un <span className="font-bold">client</span>.
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Le total affiche la <span className="font-bold">quantite prevue filtree</span>.
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-100 px-6 py-5 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Cette page montre <span className="font-bold">100 lignes par page</span>.
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Si tu ne vois pas tout, utilise <span className="font-bold">Precedent / Suivant</span> en bas.
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Tu peux revenir a la <span className="font-bold">premiere</span> ou aller a la <span className="font-bold">derniere</span> page.
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-100 px-6 py-5 md:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
              Quantite totale :
              <span className="ml-2 font-bold text-emerald-800">{totalQuantite}</span>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              Familles :
              <span className="ml-2 font-bold text-slate-900">{famillesCount}</span>
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm">
              Clients :
              <span className="ml-2 font-bold text-sky-900">{clientsCount}</span>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-100 px-6 py-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[1.75rem] border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Filtres rapides
              </p>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">Familles visibles</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {topFamilles.length === 0 ? (
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500">Aucune</span>
                    ) : (
                      topFamilles.map((item) => (
                        <Link
                          key={item}
                          href={buildPageHref(1, params.q || "", String(item || ""))}
                          className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          {item}
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-900">Clients visibles</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {topClients.length === 0 ? (
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500">Aucun</span>
                    ) : (
                      topClients.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700"
                        >
                          {item}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Priorites planning
              </p>
              <div className="mt-4 space-y-3 text-sm">
                {urgentRows.length === 0 ? (
                  <p className="text-emerald-900/70">Aucune ligne visible.</p>
                ) : (
                  urgentRows.map((row, index) => (
                    <div
                      key={`${row.numero_proforma}-${index}`}
                      className="rounded-xl bg-white px-3 py-3"
                    >
                      <p className="font-semibold text-slate-900">
                        {row.client || "-"} | {row.famille || "-"}
                      </p>
                      <p className="text-slate-600">
                        {row.numero_proforma || "-"} | {row.article || "-"}
                      </p>
                      <p className="text-emerald-700">
                        Quantite prevue : {row.quantite_prevue}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {totalRows === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun planning importe pour le moment.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Famille</th>
                      <th className="px-6 py-4 font-semibold">Client</th>
                      <th className="px-6 py-4 font-semibold">Proforma</th>
                      <th className="px-6 py-4 font-semibold">Article</th>
                      <th className="px-6 py-4 font-semibold">Qt prevue</th>
                      <th className="px-6 py-4 font-semibold">Camions</th>
                      <th className="px-6 py-4 font-semibold">Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, index) => (
                      <tr key={`${row.famille}-${row.article}-${index}`} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {row.famille || "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{row.client || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.numero_proforma || "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.article || "-"}
                        </td>
                        <td className="px-6 py-4 font-semibold text-emerald-700">
                          {row.quantite_prevue}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.nombre_camion ?? "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.mode_chargement || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm">
                <p className="text-slate-500">
                  Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows}
                </p>

                <div className="flex gap-3">
                  <Link
                    href={buildPageHref(1, params.q || "", params.famille || "")}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      safePage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Premiere
                  </Link>
                  <Link
                    href={buildPageHref(
                      Math.max(1, safePage - 1),
                      params.q || "",
                      params.famille || ""
                    )}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      safePage === 1
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Precedent
                  </Link>
                  <Link
                    href={buildPageHref(
                      Math.min(totalPages, safePage + 1),
                      params.q || "",
                      params.famille || ""
                    )}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      safePage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Suivant
                  </Link>
                  <Link
                    href={buildPageHref(totalPages, params.q || "", params.famille || "")}
                    className={`rounded-full px-4 py-2 font-semibold ${
                      safePage >= totalPages
                        ? "pointer-events-none bg-slate-100 text-slate-400"
                        : "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Derniere
                  </Link>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

