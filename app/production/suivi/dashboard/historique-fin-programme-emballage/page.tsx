import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { formatDate } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { buildPdLabelByCode, pdLabelsForNumeroLot } from "../../data";
import { lireQuantitesParCode, type LigneQuantites } from "../quantites-fin-programme";
import { unmarkEmballageTermineAction } from "../../actions";

type CodeTermineRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  termine_date: string | null;
  utilisateur: string | null;
};

type LigneRow = LigneQuantites & {
  zone: string | null;
  chaine: string | null;
  produit: string | null;
  date_jour: string | null;
};

// Fins "automatiques" faites par un nettoyage des lignes sans quantite, pas par une personne.
const NETTOYAGE_AUTO = "nettoyage_lignes_sans_quantite";

function libelleUtilisateur(utilisateur: string | null) {
  if (!utilisateur) return "Non enregistre (avant le 19/08/2026)";
  if (utilisateur === NETTOYAGE_AUTO) return "Nettoyage automatique";
  return utilisateur;
}

async function fetchAllEmballageTermineRows(): Promise<CodeTermineRow[]> {
  const rows: CodeTermineRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_code_termine")
      .select("id, programme_ligne_id, code, termine_date, utilisateur")
      .eq("stage", "emballage")
      .order("termine_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as CodeTermineRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchLignesByIds(ids: number[]): Promise<LigneRow[]> {
  const rows: LigneRow[] = [];
  const tailleLot = 200;
  for (let debut = 0; debut < ids.length; debut += tailleLot) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, numero_lot, numero_lot_detail, vrac_a_fabriquer, qt_carton")
      .in("id", ids.slice(debut, debut + tailleLot));

    if (error) break;
    rows.push(...((data ?? []) as LigneRow[]));
  }

  return rows;
}

type SearchParams = Promise<{ produit?: string; code?: string }>;

// Historique de tout ce qui a ete "Fin programme" en Emballage - meme principe que l'historique Conditionnement : qui l'a
// fait, ce qui restait a emballer a ce moment, et un bouton Annuler pour ramener le code dans la colonne Emballage du
// Dashboard en cas d'erreur de clic. Reservee aux comptes admin.
export default async function HistoriqueFinProgrammeEmballagePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const currentUser = await getCurrentStockUser();
  if (!isAdminUser(currentUser)) {
    notFound();
  }

  const { produit: produitParam, code: codeParam } = await searchParams;
  const produitFilter = (produitParam || "").trim().toLowerCase();
  const codeFilter = (codeParam || "").trim().toLowerCase();

  const [termineRows, pdLabelByCode] = await Promise.all([fetchAllEmballageTermineRows(), buildPdLabelByCode()]);

  const ligneIds = [...new Set(termineRows.map((r) => r.programme_ligne_id))];
  const lignes = await fetchLignesByIds(ligneIds);
  const ligneById = new Map(lignes.map((l) => [l.id, l]));
  // A emballer = cartons produits en Conditionnement ; emballe = ce qui avait ete saisi en Emballage
  const quantites = await lireQuantitesParCode("emballage", lignes);

  const rows = termineRows
    .map((row) => {
      const ligne = ligneById.get(row.programme_ligne_id);
      const quantite = quantites.get(`${row.programme_ligne_id}::${row.code}`);
      const aEmballer = quantite?.prevu ?? null;
      const emballe = quantite?.fait ?? 0;
      return {
        id: row.id,
        ligneId: row.programme_ligne_id,
        code: row.code,
        date: row.termine_date,
        utilisateur: row.utilisateur,
        pdLabel: pdLabelsForNumeroLot(row.code, pdLabelByCode),
        aEmballer,
        emballe,
        reste: aEmballer === null ? null : aEmballer - emballe,
        zone: ligne?.zone ?? "-",
        chaine: ligne?.chaine ?? "-",
        produit: ligne?.produit ?? "-",
        dateJour: ligne?.date_jour ?? null,
      };
    })
    .filter((row) => !produitFilter || matchesArticleSearch(row.produit, produitFilter))
    .filter((row) => !codeFilter || row.code.toLowerCase().includes(codeFilter));

  const produitOptions = [...new Set(lignes.map((l) => l.produit).filter(Boolean))].map((label, index) => ({
    id: index,
    label: label as string,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Historique</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Fin programme - Emballage</h1>
              <p className="mt-2 text-sm text-slate-600">
                Annuler ramene le code dans la colonne Emballage du Dashboard (s&apos;il reste des cartons a emballer).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
            </div>
          </div>

          <form className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm">
              <SearchableFilterInput
                name="produit"
                defaultValue={produitParam || ""}
                options={produitOptions}
                placeholder="Filtrer par article"
              />
            </div>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Code
              <input
                type="text"
                name="code"
                defaultValue={codeParam || ""}
                placeholder="ex : GB1115"
                className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
            >
              Afficher
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun code Emballage termine pour ce filtre.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Termine le</th>
                    <th className="px-6 py-4 font-semibold">Chaine</th>
                    <th className="px-6 py-4 font-semibold">Produit</th>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">PD</th>
                    <th className="px-6 py-4 font-semibold">A emballer (cartons)</th>
                    <th className="px-6 py-4 font-semibold">Emballe (cartons)</th>
                    <th className="px-6 py-4 font-semibold">Reste (cartons)</th>
                    <th className="px-6 py-4 font-semibold">Termine par</th>
                    <th className="px-6 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const reste = row.reste === null ? null : Math.round(row.reste * 100) / 100;
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 text-slate-600">
                          {row.date ? new Date(row.date).toLocaleString("fr-FR") : formatDate(row.dateJour)}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {row.zone} / {row.chaine}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{row.produit}</td>
                        <td className="px-6 py-4 text-slate-700">{row.code}</td>
                        <td className="px-6 py-4 text-slate-700">{row.pdLabel}</td>
                        <td className="px-6 py-4 tabular-nums text-slate-600">
                          {row.aEmballer === null ? "-" : Math.round(row.aEmballer * 100) / 100}
                        </td>
                        <td className="px-6 py-4 font-semibold tabular-nums text-slate-700">
                          {Math.round(row.emballe * 100) / 100}
                        </td>
                        <td
                          className={`px-6 py-4 font-semibold tabular-nums ${
                            reste === null ? "text-slate-400" : reste > 0 ? "text-amber-700" : "text-emerald-700"
                          }`}
                        >
                          {reste === null ? "-" : reste}
                        </td>
                        <td className="px-6 py-4 text-slate-700">{libelleUtilisateur(row.utilisateur)}</td>
                        <td className="px-6 py-4">
                          <form action={unmarkEmballageTermineAction}>
                            <input type="hidden" name="ligne_id" value={row.ligneId} />
                            <input type="hidden" name="code" value={row.code} />
                            <SubmitButton
                              pendingLabel="..."
                              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                            >
                              Annuler
                            </SubmitButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
