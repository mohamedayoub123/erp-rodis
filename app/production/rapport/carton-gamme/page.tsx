import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import {
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllProgrammeLignes,
  fetchArticleGammeInfoByIds,
  formatDate,
  groupCartonEntriesByLigne,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../suivi/data";

// Rapport Carton par Gamme : combien de carton a ete reellement fabrique,
// regroupe par gamme (au lieu de par code comme Rapport Carton) - vue
// d'ensemble par gamme, avec repli sur un detail mensuel/journalier des
// qu'on filtre sur un article precis.
const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function moisLabel(key: string) {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  return `${MOIS_NOMS[index] ?? month} ${year}`;
}

type SearchParams = Promise<{
  gamme?: string;
  produit?: string;
  date_debut?: string;
  date_fin?: string;
}>;

export default async function RapportCartonGammePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const gammeFilter = (params.gamme || "").trim().toLowerCase();
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const hasFilters = Boolean(gammeFilter || produitFilter || dateDebutFilter || dateFinFilter);

  // Meme raisonnement que Rapport Carton/Balance Matiere : sans recherche,
  // fenetre par defaut de 3 mois (perf) - toute recherche repasse sans
  // borne pour retrouver du vieux.
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sinceDate = hasFilters ? undefined : threeMonthsAgo.toISOString().slice(0, 10);

  const [{ rows: lignes }, cartonEntries] = await Promise.all([
    fetchAllProgrammeLignes({ sinceDate }),
    fetchAllCartonEntries(),
  ]);

  const gammeInfoByArticleId = await fetchArticleGammeInfoByIds(lignes.map((ligne) => ligne.article_id));

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

    const gammeInfo = ligne.article_id ? gammeInfoByArticleId.get(ligne.article_id) : null;

    return codes.map((code) => ({
      date: ligne.date_jour,
      produit: ligne.produit || "-",
      gamme: gammeInfo?.gamme?.trim() || "Sans gamme",
      cartonFabrique: cartonFabriqueByCode.get(code) ?? 0,
    }));
  });

  const gammeOptions = [...new Set(allRows.map((row) => row.gamme))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const produitOptions = [...new Set(allRows.map((row) => row.produit).filter((p) => p && p !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));

  const rows = allRows.filter((row) => {
    if (row.cartonFabrique <= 0) return false;
    if (gammeFilter && !row.gamme.toLowerCase().includes(gammeFilter)) return false;
    if (produitFilter && !row.produit.toLowerCase().includes(produitFilter)) return false;
    if (dateDebutFilter && row.date < dateDebutFilter) return false;
    if (dateFinFilter && row.date > dateFinFilter) return false;
    return true;
  });

  const byGamme = new Map<string, number>();
  for (const row of rows) {
    byGamme.set(row.gamme, (byGamme.get(row.gamme) ?? 0) + row.cartonFabrique);
  }
  const gammeRows = [...byGamme.entries()]
    .map(([gamme, total]) => ({ gamme, total }))
    .sort((a, b) => b.total - a.total);
  const totalGeneral = gammeRows.reduce((sum, row) => sum + row.total, 0);

  // Detail mensuel/journalier : uniquement quand un article precis est
  // filtre (sinon melanger plusieurs produits dans un total par jour n'a
  // pas de sens pour l'usage demande - "combien fabrique par mois/jour
  // pour CET article").
  const detailRows = produitFilter ? rows : [];
  const byMonth = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const row of detailRows) {
    const mois = (row.date || "").slice(0, 7);
    if (mois) byMonth.set(mois, (byMonth.get(mois) ?? 0) + row.cartonFabrique);
    if (row.date) byDay.set(row.date, (byDay.get(row.date) ?? 0) + row.cartonFabrique);
  }
  const monthRows = [...byMonth.entries()]
    .map(([mois, total]) => ({ mois, label: moisLabel(mois), total }))
    .sort((a, b) => b.mois.localeCompare(a.mois));
  const dayRows = [...byDay.entries()]
    .map(([jour, total]) => ({ jour, total }))
    .sort((a, b) => b.jour.localeCompare(a.jour));

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const merged = { gamme: params.gamme, produit: params.produit, date_debut: params.date_debut, date_fin: params.date_fin, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) qs.set(key, value);
    }
    return `/production/rapport/carton-gamme?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport Carton par Gamme</h1>
              <p className="mt-2 text-sm text-slate-600">
                Total carton reellement fabrique regroupe par gamme. Filtrez sur un article precis pour voir
                le detail mois par mois et jour par jour.
              </p>
              {sinceDate ? (
                <p className="mt-1 text-xs text-slate-400">
                  Affiche les 3 derniers mois par defaut - cherche une gamme, un article ou une date pour
                  retrouver plus ancien.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <SearchableFilterInput name="gamme" defaultValue={params.gamme || ""} options={gammeOptions} placeholder="Gamme" />
            <SearchableFilterInput
              name="produit"
              defaultValue={params.produit || ""}
              options={produitOptions}
              placeholder="Article (pour voir le detail mois/jour)"
            />
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/rapport/carton-gamme"
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

        <section className="rounded-[1.75rem] border border-black/5 bg-sky-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
            Total carton fabrique (selection)
          </p>
          <p className="mt-2 text-3xl font-black text-sky-900">{Math.round(totalGeneral)}</p>
        </section>

        {gammeRows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun carton fabrique pour le moment."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Gamme</th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                      Carton fabrique
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Part du total</th>
                  </tr>
                </thead>
                <tbody>
                  {gammeRows.map((row) => (
                    <tr key={row.gamme} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <Link
                          href={buildHref({ gamme: row.gamme })}
                          className="hover:text-sky-700 hover:underline"
                        >
                          {row.gamme}
                        </Link>
                      </td>
                      <td className="bg-sky-50/30 px-4 py-3 font-semibold text-slate-900">
                        {Math.round(row.total)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {totalGeneral > 0 ? `${Math.round((row.total / totalGeneral) * 100)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {produitFilter ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-900">Detail par mois - {params.produit}</h2>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Mois</th>
                      <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                        Carton fabrique
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate-400">
                          Aucune donnee.
                        </td>
                      </tr>
                    ) : (
                      monthRows.map((row) => (
                        <tr key={row.mois} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.label}</td>
                          <td className="bg-sky-50/30 px-4 py-3 text-slate-700">{Math.round(row.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-900">Detail par jour - {params.produit}</h2>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Jour</th>
                      <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                        Carton fabrique
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate-400">
                          Aucune donnee.
                        </td>
                      </tr>
                    ) : (
                      dayRows.map((row) => (
                        <tr key={row.jour} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900">{formatDate(row.jour)}</td>
                          <td className="bg-sky-50/30 px-4 py-3 text-slate-700">{Math.round(row.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Filtrez sur un article precis (champ &quot;Article&quot; ci-dessus) pour voir le detail mois par
            mois et jour par jour.
          </div>
        )}
      </div>
    </main>
  );
}
