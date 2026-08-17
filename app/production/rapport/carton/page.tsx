import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import {
  buildPdLabelByCode,
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllProgrammeLignes,
  formatDate,
  groupCartonEntriesByLigne,
  pdLabelsForNumeroLot,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../suivi/data";

// Rapport Carton : par code, carton COMMANDE (prevu) vs carton REELLEMENT
// fabrique, avec des KPI globaux sur toute la selection filtree. Copie
// adaptee de la logique deja utilisee par Rapport Balance Matiere/Ecarts
// (meme fichier suivi/data.ts), simplifiee ici au carton seul (pas de vrac,
// pas de conversion en kg) - demande explicite d'une page dediee juste pour
// suivre commande vs fabrique en unites.
type Statut = "Termine" | "Termine Manuel" | "En cours" | "Pas commence";

function StatutBadge({ statut }: { statut: Statut }) {
  const className =
    statut === "Termine"
      ? "bg-emerald-100 text-emerald-800"
      : statut === "Termine Manuel"
        ? "bg-violet-100 text-violet-800"
        : statut === "En cours"
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{statut}</span>
  );
}

// Positif = surplus (fabrique plus que commande), negatif = manque - meme
// convention que Rapport Ecarts (Ecart vrac/Ecart carton).
function EcartCell({ value }: { value: number }) {
  const rounded = Math.round(value);
  const className =
    rounded > 0 ? "font-semibold text-emerald-700" : rounded < 0 ? "font-semibold text-red-700" : "text-slate-500";

  return <td className={`px-4 py-3 ${className}`}>{rounded}</td>;
}

const PAGE_SIZE = 200;

type SearchParams = Promise<{
  produit?: string;
  code?: string;
  page?: string;
  date_debut?: string;
  date_fin?: string;
}>;

export default async function RapportCartonPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const hasFilters = Boolean(produitFilter || codeFilter || dateDebutFilter || dateFinFilter);
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  // Meme raisonnement que Rapport Ecarts/Balance Matiere : sans recherche,
  // fenetre par defaut de 3 mois (perf) - toute recherche repasse sans
  // borne pour retrouver du vieux.
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

    // Fabrique reel : somme directe des entrees deja taguees par code
    // (meme helper que Balance Matiere/Emballage), pas un split
    // demande-restant qui plafonnerait silencieusement au commande.
    const cartonFabriqueByCode = computeProduitParCode(
      cartonEntriesForLigne,
      codes,
      (code) => cartonDemandeByCode.get(code) ?? 0
    );

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

      return {
        statut,
        id: ligne.id,
        key: `${ligne.id}::${code}`,
        date: ligne.date_jour,
        code,
        pd: pdLabelsForNumeroLot(code, pdLabelByCode),
        produit: ligne.produit || "-",
        cartonDemande,
        cartonFabrique,
        cartonDiff: cartonFabrique - cartonDemande,
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
      // Code sans rien a comparer (jamais rien commande ni fabrique pour ce
      // code precis) - "Termine" ici est juste un cas vide qui a
      // trivialement passe le test "0 <= 0", pas un vrai code termine a
      // montrer dans le rapport.
      if (row.cartonDemande <= 0 && row.cartonFabrique <= 0) return false;
      if (produitFilter && !row.produit.toLowerCase().includes(produitFilter)) return false;
      if (codeFilter && !row.code.toLowerCase().includes(codeFilter)) return false;
      if (dateDebutFilter && row.date < dateDebutFilter) return false;
      if (dateFinFilter && row.date > dateFinFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const pdCompare = a.pd.localeCompare(b.pd, "fr", { numeric: true });
      if (pdCompare !== 0) return pdCompare;
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.code.localeCompare(b.code, "fr", { numeric: true });
    });

  const totalCartonCommande = rows.reduce((sum, row) => sum + row.cartonDemande, 0);
  const totalCartonFabrique = rows.reduce((sum, row) => sum + row.cartonFabrique, 0);
  const ecartTotal = totalCartonFabrique - totalCartonCommande;

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(from, from + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.produit) qs.set("produit", params.produit);
    if (params.code) qs.set("code", params.code);
    if (params.date_debut) qs.set("date_debut", params.date_debut);
    if (params.date_fin) qs.set("date_fin", params.date_fin);
    return `/production/rapport/carton?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport Carton</h1>
              <p className="mt-2 text-sm text-slate-600">
                Par code : carton commande (prevu) vs carton reellement fabrique.
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
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/rapport/carton"
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
          <div className="rounded-[1.75rem] border border-black/5 bg-amber-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              Total carton commande
            </p>
            <p className="mt-2 text-3xl font-black text-amber-900">{Math.round(totalCartonCommande)}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-sky-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
              Total carton fabrique
            </p>
            <p className="mt-2 text-3xl font-black text-sky-900">{Math.round(totalCartonFabrique)}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Ecart fabrique - commande
            </p>
            <p
              className={`mt-2 text-3xl font-black ${ecartTotal < 0 ? "text-red-700" : "text-emerald-700"}`}
            >
              {Math.round(ecartTotal)}
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
                    <th className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800">
                      Carton commande
                    </th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                      Carton fabrique
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Ecart</th>
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
                      <td className="bg-amber-50/30 px-4 py-3 text-slate-600">
                        {Math.round(row.cartonDemande)}
                      </td>
                      <td className="bg-sky-50/30 px-4 py-3 text-slate-600">
                        {Math.round(row.cartonFabrique)}
                      </td>
                      <EcartCell value={row.cartonDiff} />
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
