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
import { unmarkCartonTermineAction } from "../../actions";

type CodeTermineRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  termine_date: string | null;
  utilisateur: string | null;
};

type LigneRow = {
  id: number;
  zone: string | null;
  chaine: string | null;
  produit: string | null;
  date_jour: string | null;
};

async function fetchAllCartonTermineRows(): Promise<CodeTermineRow[]> {
  const rows: CodeTermineRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_code_termine")
      .select("id, programme_ligne_id, code, termine_date, utilisateur")
      .eq("stage", "carton")
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
  if (ids.length === 0) return [];
  const rows: LigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour")
      .in("id", ids)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as LigneRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type SearchParams = Promise<{ produit?: string }>;

// Historique de tout ce qui a ete "Fin programme" en Conditionnement -
// deplace hors du Dashboard (qui ne doit montrer que ce qui reste en
// cours) pour ne pas l'encombrer, avec qui l'a fait et un bouton pour
// revenir en arriere en cas d'erreur de clic.
//
// Reservee aux comptes admin, meme logique que l'historique des
// validations Salle de pesage/conditionnement voisin.
export default async function HistoriqueFinProgrammePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const currentUser = await getCurrentStockUser();
  if (!isAdminUser(currentUser)) {
    notFound();
  }

  const { produit: produitParam } = await searchParams;
  const produitFilter = (produitParam || "").trim().toLowerCase();

  const [termineRows, pdLabelByCode] = await Promise.all([fetchAllCartonTermineRows(), buildPdLabelByCode()]);

  const ligneIds = [...new Set(termineRows.map((r) => r.programme_ligne_id))];
  const lignes = await fetchLignesByIds(ligneIds);
  const ligneById = new Map(lignes.map((l) => [l.id, l]));

  const rows = termineRows
    .map((row) => {
      const ligne = ligneById.get(row.programme_ligne_id);
      return {
        id: row.id,
        ligneId: row.programme_ligne_id,
        code: row.code,
        date: row.termine_date,
        utilisateur: row.utilisateur,
        pdLabel: pdLabelsForNumeroLot(row.code, pdLabelByCode),
        zone: ligne?.zone ?? "-",
        chaine: ligne?.chaine ?? "-",
        produit: ligne?.produit ?? "-",
        dateJour: ligne?.date_jour ?? null,
      };
    })
    .filter((row) => !produitFilter || matchesArticleSearch(row.produit, produitFilter));

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
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Historique
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Fin programme - Conditionnement
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
            </div>
          </div>

          <form className="mt-4 max-w-sm">
            <SearchableFilterInput
              name="produit"
              defaultValue={produitParam || ""}
              options={produitOptions}
              placeholder="Filtrer par article"
            />
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun code Conditionnement termine pour le moment.
            </div>
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
                    <th className="px-6 py-4 font-semibold">Termine par</th>
                    <th className="px-6 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
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
                      <td className="px-6 py-4 text-slate-700">{row.utilisateur || "?"}</td>
                      <td className="px-6 py-4">
                        <form action={unmarkCartonTermineAction}>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
