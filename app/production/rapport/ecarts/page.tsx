import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  buildPdLabelByCode,
  fetchAllCartonEntries,
  fetchAllEmballageEntries,
  fetchAllProgrammeLignes,
  fetchAllVracEntries,
  formatDate,
  formatQty,
  pdLabelsForNumeroLot,
} from "../../suivi/data";
import { deleteProgrammeLigneRapportAction } from "./actions";

type Statut = "Termine" | "En cours" | "Pas commence";

function StatutBadge({ statut }: { statut: Statut }) {
  const className =
    statut === "Termine"
      ? "bg-emerald-100 text-emerald-800"
      : statut === "En cours"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{statut}</span>
  );
}

function DiffCell({ value, whole }: { value: number; whole?: boolean }) {
  const rounded = whole ? Math.round(value) : formatQty(value);
  const className =
    rounded > 0
      ? "font-semibold text-amber-700"
      : rounded < 0
        ? "font-semibold text-sky-700"
        : "text-emerald-700";

  return <td className={`px-4 py-3 ${className}`}>{rounded}</td>;
}

const PAGE_SIZE = 200;

type SearchParams = Promise<{ code?: string; pd?: string; page?: string }>;

export default async function RapportEcartsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "productionRapportEcarts");
  const codeFilter = (params.code || "").trim().toLowerCase();
  const pdFilter = (params.pd || "").trim().toLowerCase();
  const hasFilters = Boolean(codeFilter || pdFilter);
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  // Sans recherche, on se limite aux 3 derniers mois par defaut - une
  // recherche par code/PD repasse sans borne pour retrouver du vieux.
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sinceDate = hasFilters ? undefined : threeMonthsAgo.toISOString().slice(0, 10);

  const [{ rows: lignes }, vracEntries, cartonEntries, emballageEntries, pdLabelByCode] =
    await Promise.all([
      fetchAllProgrammeLignes({ sinceDate }),
      fetchAllVracEntries(),
      fetchAllCartonEntries(),
      fetchAllEmballageEntries(),
      buildPdLabelByCode(),
    ]);

  function sumByLigne(entries: { programme_ligne_id: number; quantite: number }[]) {
    const map = new Map<number, number>();
    for (const entry of entries) {
      map.set(entry.programme_ligne_id, (map.get(entry.programme_ligne_id) ?? 0) + Number(entry.quantite));
    }
    return map;
  }

  const vracByLigne = sumByLigne(vracEntries);
  const cartonByLigne = sumByLigne(cartonEntries);
  const emballageByLigne = sumByLigne(emballageEntries);

  const allRows = lignes
    .filter((ligne) => ligne.numero_lot)
    .map((ligne) => {
      const vracDemande = ligne.vrac_a_fabriquer ?? 0;
      const vracFabrique = vracByLigne.get(ligne.id) ?? 0;
      const cartonDemande = ligne.qt_carton ?? 0;
      const cartonFabrique = cartonByLigne.get(ligne.id) ?? 0;
      const cartonEmballe = emballageByLigne.get(ligne.id) ?? 0;

      // "Termine" = exactement quand la ligne a disparu des 3 colonnes du
      // Dashboard (reste <= 0 OU "Fin programme" appuye pour cette etape,
      // OU "Fin programme" general) - meme regle, pas une estimation a part.
      const vracOk = ligne.programme_termine || ligne.vrac_termine || vracDemande <= 0 || vracFabrique >= vracDemande;
      const cartonOk =
        ligne.programme_termine || ligne.carton_termine || cartonDemande <= 0 || cartonFabrique >= cartonDemande;
      const emballageOk =
        ligne.programme_termine ||
        ligne.emballage_termine ||
        cartonFabrique <= 0 ||
        cartonEmballe >= cartonFabrique;
      const hasStarted = vracFabrique > 0 || cartonFabrique > 0 || cartonEmballe > 0;
      const statut: Statut =
        vracOk && cartonOk && emballageOk ? "Termine" : hasStarted ? "En cours" : "Pas commence";

      return {
        statut,
        id: ligne.id,
        date: ligne.date_jour,
        code: ligne.numero_lot || "-",
        pd: pdLabelsForNumeroLot(ligne.numero_lot, pdLabelByCode),
        produit: ligne.produit || "-",
        vracDemande,
        vracFabrique,
        vracDiff: vracDemande - vracFabrique,
        cartonDemande,
        cartonFabrique,
        cartonDiff: cartonDemande - cartonFabrique,
        cartonEmballe,
        conditionnementEmballageDiff: cartonEmballe - cartonFabrique,
      };
    });

  const rows = allRows.filter((row) => {
    if (codeFilter && !row.code.toLowerCase().includes(codeFilter)) return false;
    if (pdFilter && !row.pd.toLowerCase().includes(pdFilter)) return false;
    return true;
  });

  // Avec des milliers de codes, tout rendre d'un coup fait exploser le
  // temps de rendu et la memoire - meme filtre pagine que les autres
  // grosses listes de l'appli (/stock, /historique-programme...).
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(from, from + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.code) qs.set("code", params.code);
    if (params.pd) qs.set("pd", params.pd);
    return `/production/rapport/ecarts?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Rapport Ecarts Production
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Par code : vrac et carton demandes vs fabriques, et ecart entre ce qui a ete
                conditionne (carton) et ce qui a ete emballe.
              </p>
              {sinceDate ? (
                <p className="mt-1 text-xs text-slate-400">
                  Affiche les 3 derniers mois par defaut - cherche un code ou un PD pour
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
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code (N Lot)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="pd"
              defaultValue={params.pd || ""}
              placeholder="N programme (PD1, PD2...)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/rapport/ecarts"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun code programme pour le moment."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    <th className="px-4 py-3 font-semibold">Date programme</th>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Programme (PD)</th>
                    <th className="px-4 py-3 font-semibold">Produit</th>
                    <th className="px-4 py-3 font-semibold">Vrac demande</th>
                    <th className="px-4 py-3 font-semibold">Vrac fabrique</th>
                    <th className="px-4 py-3 font-semibold">Ecart vrac</th>
                    <th className="px-4 py-3 font-semibold">Carton demande</th>
                    <th className="px-4 py-3 font-semibold">Carton fabrique</th>
                    <th className="px-4 py-3 font-semibold">Ecart carton</th>
                    <th className="px-4 py-3 font-semibold">Carton emballe</th>
                    <th className="px-4 py-3 font-semibold">Ecart emballage/conditionnement</th>
                    {canDelete ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <StatutBadge statut={row.statut} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.code}</td>
                      <td className="px-4 py-3 text-slate-600">{row.pd}</td>
                      <td className="px-4 py-3 text-slate-600">{row.produit}</td>
                      <td className="px-4 py-3 text-slate-600">{formatQty(row.vracDemande)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatQty(row.vracFabrique)}</td>
                      <DiffCell value={row.vracDiff} />
                      <td className="px-4 py-3 text-slate-600">{Math.round(row.cartonDemande)}</td>
                      <td className="px-4 py-3 text-slate-600">{Math.round(row.cartonFabrique)}</td>
                      <DiffCell value={row.cartonDiff} whole />
                      <td className="px-4 py-3 text-slate-600">{Math.round(row.cartonEmballe)}</td>
                      <DiffCell value={row.conditionnementEmballageDiff} whole />
                      {canDelete ? (
                        <td className="px-4 py-3">
                          <form action={deleteProgrammeLigneRapportAction}>
                            <input type="hidden" name="ligne_id" value={row.id} />
                            <DeleteIconButton label="Supprimer cette ligne" />
                          </form>
                        </td>
                      ) : null}
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
