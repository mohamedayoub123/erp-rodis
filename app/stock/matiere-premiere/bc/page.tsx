import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { formatDate } from "@/lib/format-date";
import { deleteCommandeBcGroupAction } from "./actions";
import { computeStatutBc, statutBcBadgeClass, STATUT_BC_OPTIONS, type StatutBc } from "./constants";
import { matchesArticleSearch } from "@/lib/article-search";

type CommandeBcRow = {
  id: number;
  code: string;
  article_label: string | null;
  quantite: number | null;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  fournisseur: string | null;
  date_jour: string | null;
  statut: string | null;
};

type ImportEvenementRow = {
  bc_ligne_id: number;
  quantite_importee: number;
};

type ImportDossierRow = {
  bc_ligne_id: number;
  n_doss_4d_import: string | null;
  n_doss_erp_import: string | null;
};

type BcGroup = {
  code: string;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  fournisseur: string | null;
  date_jour: string | null;
  nbArticles: number;
  quantiteTotale: number;
  quantiteImporteeTotale: number;
  statutLigne: string | null;
  statut: StatutBc;
  dossImport4d: string;
  dossImportErp: string;
};

async function fetchAllCommandesBc() {
  const rows: CommandeBcRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select("id, code, article_label, quantite, n_doss_4d, n_doss_erp, fournisseur, date_jour, statut")
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as CommandeBcRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllImportEvenements() {
  const rows: ImportEvenementRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    // Exclut les evenements issus d'une Reception (lot_stock_id renseigne) -
    // "Creer import" et "Reception" sont deux suivis distincts depuis que la
    // Reception credite le stock reel ; melanger les deux ici faussait "Qte
    // importee"/"Reste a importer" du BC (double comptage).
    const { data, error } = await supabaseServer
      .from("bons_commande_mp_imports")
      .select("bc_ligne_id, quantite_importee")
      .is("lot_stock_id", null)
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ImportEvenementRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

// Pas de filtre sur lot_stock_id ici (contrairement a fetchAllImportEvenements)
// - la colonne "Doss import" est juste informative, elle doit refleter le
// dossier de TOUS les evenements (Creer import ET Reception) lies au BC.
async function fetchAllImportDossiers() {
  const rows: ImportDossierRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_mp_imports")
      .select("bc_ligne_id, n_doss_4d_import, n_doss_erp_import")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ImportDossierRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

type SearchParams = Promise<{ doss_4d?: string; doss_erp?: string; produit?: string; statut?: string }>;

export default async function CommandeBcMpPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const doss4dFilter = (params.doss_4d || "").trim().toLowerCase();
  const dossErpFilter = (params.doss_erp || "").trim().toLowerCase();
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const statutFilter = (params.statut || "").trim();
  const hasFilters = Boolean(doss4dFilter || dossErpFilter || produitFilter || statutFilter);
  const currentUser = await getCurrentStockUser();
  const canWriteNouvelle = await canWritePageUser(currentUser, "commandeBcMpNouvelle");
  const canDelete = await canDeletePageUser(currentUser, "commandeBcMp");

  const { rows, error } = await fetchAllCommandesBc();
  const { rows: importRows } = await fetchAllImportEvenements();
  const { rows: dossierRows } = await fetchAllImportDossiers();

  const importeeParLigne = new Map<number, number>();
  for (const imp of importRows) {
    const current = importeeParLigne.get(imp.bc_ligne_id) ?? 0;
    importeeParLigne.set(imp.bc_ligne_id, current + Number(imp.quantite_importee ?? 0));
  }

  const codeParLigne = new Map<number, string>();
  for (const row of rows) {
    codeParLigne.set(row.id, row.code);
  }

  const doss4dParCode = new Map<string, Set<string>>();
  const dossErpParCode = new Map<string, Set<string>>();
  for (const dossier of dossierRows) {
    const code = codeParLigne.get(dossier.bc_ligne_id);
    if (!code) continue;

    if (dossier.n_doss_4d_import) {
      const set = doss4dParCode.get(code) ?? new Set<string>();
      set.add(dossier.n_doss_4d_import);
      doss4dParCode.set(code, set);
    }
    if (dossier.n_doss_erp_import) {
      const set = dossErpParCode.get(code) ?? new Set<string>();
      set.add(dossier.n_doss_erp_import);
      dossErpParCode.set(code, set);
    }
  }

  const byCode = new Map<string, CommandeBcRow[]>();
  for (const row of rows) {
    const list = byCode.get(row.code) ?? [];
    list.push(row);
    byCode.set(row.code, list);
  }

  const groups: BcGroup[] = [...byCode.entries()]
    .filter(([, groupRows]) => {
      const first = groupRows[0];
      if (doss4dFilter && !(first.n_doss_4d || "").toLowerCase().includes(doss4dFilter)) return false;
      if (dossErpFilter && !(first.n_doss_erp || "").toLowerCase().includes(dossErpFilter)) return false;
      // Le produit se filtre sur les lignes/articles A L'INTERIEUR du BC
      // (article_label, pas un champ du groupe) - des qu'UNE ligne du
      // groupe matche, tout le groupe (vue exterieure) reste affiche.
      if (
        produitFilter &&
        !groupRows.some((row) => matchesArticleSearch(row.article_label, produitFilter))
      ) {
        return false;
      }
      return true;
    })
    .map(([code, groupRows]) => {
      const first = groupRows[0];
      const quantiteTotale = groupRows.reduce((sum, row) => sum + Number(row.quantite ?? 0), 0);
      const quantiteImporteeTotale = groupRows.reduce(
        (sum, row) => sum + (importeeParLigne.get(row.id) ?? 0),
        0
      );
      // Un BC groupe peut avoir plusieurs lignes/articles - si au moins une
      // a ete forcee "Termine" a la main (bouton, independant du cote
      // Import), le badge du groupe affiche ce statut en priorite (coherent
      // avec le detail par ligne).
      const statutLigne = groupRows.some((row) => row.statut === "Termine") ? "Termine" : null;
      return {
        code,
        n_doss_4d: first.n_doss_4d,
        n_doss_erp: first.n_doss_erp,
        fournisseur: first.fournisseur,
        date_jour: first.date_jour,
        nbArticles: groupRows.length,
        quantiteTotale,
        quantiteImporteeTotale,
        statutLigne,
        statut: computeStatutBc(quantiteTotale, quantiteImporteeTotale, statutLigne),
        dossImport4d: [...(doss4dParCode.get(code) ?? [])].join(", "),
        dossImportErp: [...(dossErpParCode.get(code) ?? [])].join(", "),
      };
    })
    .filter((group) => !statutFilter || group.statut === statutFilter)
    .sort((a, b) => {
      const numA = Number(a.code.replace("BC", ""));
      const numB = Number(b.code.replace("BC", ""));
      return numB - numA;
    });

  const doss4dOptions = [
    ...new Set(rows.map((row) => row.n_doss_4d).filter((value): value is string => Boolean(value))),
  ].map((label, index) => ({ id: index, label }));

  const dossErpOptions = [
    ...new Set(rows.map((row) => row.n_doss_erp).filter((value): value is string => Boolean(value))),
  ].map((label, index) => ({ id: index, label }));

  const produitOptions = [
    ...new Set(
      rows.map((row) => row.article_label).filter((value): value is string => Boolean(value))
    ),
  ].map((label, index) => ({ id: index, label }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Commande MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Bons de commande matiere premiere (BC) - un BC peut regrouper plusieurs articles.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
            {canWriteNouvelle ? (
              <Link
                href="/stock/matiere-premiere/bc/nouvelle"
                className="rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Ajouter commande
              </Link>
            ) : null}
          </div>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="doss_4d"
              defaultValue={params.doss_4d || ""}
              options={doss4dOptions}
              placeholder="N Dossier 4D"
            />
            <SearchableFilterInput
              name="doss_erp"
              defaultValue={params.doss_erp || ""}
              options={dossErpOptions}
              placeholder="N Dossier ERP"
            />
            <SearchableFilterInput
              name="produit"
              defaultValue={params.produit || ""}
              options={produitOptions}
              placeholder="Produit"
            />
            <select
              name="statut"
              defaultValue={statutFilter}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Tous les statuts</option>
              {STATUT_BC_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/stock/matiere-premiere/bc"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : groups.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucune commande pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">BC</th>
                    <th className="px-6 py-4 font-semibold">Nb articles</th>
                    <th className="px-6 py-4 font-semibold">Qte commandee</th>
                    <th className="px-6 py-4 font-semibold">Qte importee</th>
                    <th className="px-6 py-4 font-semibold">Reste a importer</th>
                    <th className="px-6 py-4 font-semibold">Fournisseur</th>
                    <th className="px-6 py-4 font-semibold">Dossier BC 4D</th>
                    <th className="px-6 py-4 font-semibold">Dossier BC ERP</th>
                    <th className="px-6 py-4 font-semibold">Doss import 4D</th>
                    <th className="px-6 py-4 font-semibold">Doss import ERP</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    {canDelete ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const statut = group.statut;
                    const reste = group.quantiteTotale - group.quantiteImporteeTotale;

                    return (
                      <tr key={group.code} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold">
                          <Link
                            href={`/stock/matiere-premiere/bc/${group.code}`}
                            className="text-sky-700 underline"
                          >
                            {group.code}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{group.nbArticles}</td>
                        <td className="px-6 py-4 text-slate-900">{group.quantiteTotale}</td>
                        <td className="px-6 py-4 text-slate-600">{group.quantiteImporteeTotale}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">{reste}</td>
                        <td className="px-6 py-4 text-slate-600">{group.fournisseur || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{group.n_doss_4d || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{group.n_doss_erp || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{group.dossImport4d || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{group.dossImportErp || "-"}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statutBcBadgeClass(
                              statut
                            )}`}
                          >
                            {statut}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(group.date_jour)}</td>
                        {canDelete ? (
                          <td className="px-6 py-4">
                            <form action={deleteCommandeBcGroupAction}>
                              <input type="hidden" name="code" value={group.code} />
                              <DeleteIconButton label={`Supprimer ${group.code}`} />
                            </form>
                          </td>
                        ) : null}
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
