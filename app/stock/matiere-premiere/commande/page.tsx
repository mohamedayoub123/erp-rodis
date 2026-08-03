import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { formatDate } from "@/lib/format-date";
import { DateJmaFormField } from "@/app/_components/date-jma-input";
import { encodeDossierId } from "./dossier-id";
import { deleteDossierImportsAction, updateDossierMpStatutAction } from "./actions";
import { STATUT_DOSSIER_MP_OPTIONS, statutDossierMpBadgeClass } from "./constants";

type ImportRow = {
  id: number;
  bc_ligne_id: number;
  quantite_importee: number;
  n_doss_4d_import: string | null;
  n_doss_erp_import: string | null;
  date_import: string | null;
};

type DossierStatutRow = {
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  statut: string;
  date_prevue_reception: string | null;
};

type DossierGroup = {
  nDoss4d: string | null;
  nDossErp: string | null;
  nbArticles: number;
  quantiteTotale: number;
  dateRecente: string | null;
  statut: string;
  datePrevueReception: string | null;
};

function dossierKey(nDoss4d: string | null, nDossErp: string | null) {
  return `${nDoss4d ?? ""}|||${nDossErp ?? ""}`;
}

async function fetchAllImports() {
  const rows: ImportRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_mp_imports")
      .select("id, bc_ligne_id, quantite_importee, n_doss_4d_import, n_doss_erp_import, date_import")
      .order("date_import", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as ImportRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchAllDossierStatuts() {
  const { data, error } = await supabaseServer
    .from("dossiers_import_mp_statut")
    .select("n_doss_4d, n_doss_erp, statut, date_prevue_reception");

  if (error) return { rows: [] as DossierStatutRow[], error };

  return { rows: (data ?? []) as DossierStatutRow[], error: null };
}

export default async function CommandeMpPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "commandeMp");

  const [{ rows, error }, { rows: statutRows }] = await Promise.all([
    fetchAllImports(),
    fetchAllDossierStatuts(),
  ]);

  const statutByDossier = new Map(
    statutRows.map((row) => [
      dossierKey(row.n_doss_4d, row.n_doss_erp),
      { statut: row.statut, datePrevueReception: row.date_prevue_reception },
    ])
  );

  const byDossier = new Map<string, ImportRow[]>();
  for (const row of rows) {
    const key = dossierKey(row.n_doss_4d_import, row.n_doss_erp_import);
    const list = byDossier.get(key) ?? [];
    list.push(row);
    byDossier.set(key, list);
  }

  const groups: DossierGroup[] = [...byDossier.entries()]
    .map(([key, groupRows]) => {
      const first = groupRows[0];
      const statutInfo = statutByDossier.get(key);
      return {
        nDoss4d: first.n_doss_4d_import,
        nDossErp: first.n_doss_erp_import,
        nbArticles: groupRows.length,
        quantiteTotale: groupRows.reduce((sum, row) => sum + Number(row.quantite_importee ?? 0), 0),
        dateRecente: groupRows.reduce<string | null>((latest, row) => {
          if (!row.date_import) return latest;
          if (!latest || row.date_import > latest) return row.date_import;
          return latest;
        }, null),
        statut: statutInfo?.statut ?? STATUT_DOSSIER_MP_OPTIONS[0],
        datePrevueReception: statutInfo?.datePrevueReception ?? null,
      };
    })
    .sort((a, b) => (b.dateRecente ?? "").localeCompare(a.dateRecente ?? ""));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Import MP</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Vue calculee : regroupe automatiquement les imports enregistres depuis les BC qui
              partagent le meme dossier 4D / ERP.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : groups.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun import pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Doss. 4D</th>
                    <th className="px-6 py-4 font-semibold">Doss. ERP</th>
                    <th className="px-6 py-4 font-semibold">Nb articles</th>
                    <th className="px-6 py-4 font-semibold">Qte importee</th>
                    <th className="px-6 py-4 font-semibold">Date recente</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Date prevue reception</th>
                    {canEdit ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const dossierId = encodeDossierId(group.nDoss4d, group.nDossErp);

                    return (
                      <tr key={dossierId} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold">
                          <Link
                            href={`/stock/matiere-premiere/commande/${dossierId}`}
                            className="text-sky-700 underline"
                          >
                            {group.nDoss4d || "Sans dossier"}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{group.nDossErp || "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{group.nbArticles}</td>
                        <td className="px-6 py-4 text-slate-900">{group.quantiteTotale}</td>
                        <td className="px-6 py-4 text-slate-600">{formatDate(group.dateRecente)}</td>
                        <td className="px-6 py-4">
                          {canEdit ? (
                            <form action={updateDossierMpStatutAction} className="flex items-center gap-2">
                              <input type="hidden" name="n_doss_4d" value={group.nDoss4d ?? ""} />
                              <input type="hidden" name="n_doss_erp" value={group.nDossErp ?? ""} />
                              <select
                                name="statut"
                                defaultValue={group.statut}
                                className={`rounded-full border-none px-3 py-1 text-xs font-semibold outline-none ${statutDossierMpBadgeClass(
                                  group.statut
                                )}`}
                              >
                                {STATUT_DOSSIER_MP_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
                              >
                                OK
                              </button>
                            </form>
                          ) : (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${statutDossierMpBadgeClass(
                                group.statut
                              )}`}
                            >
                              {group.statut}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {canEdit ? (
                            <form action={updateDossierMpStatutAction} className="flex items-center gap-2">
                              <input type="hidden" name="n_doss_4d" value={group.nDoss4d ?? ""} />
                              <input type="hidden" name="n_doss_erp" value={group.nDossErp ?? ""} />
                              <input type="hidden" name="statut" value={group.statut} />
                              <DateJmaFormField
                                name="date_prevue_reception"
                                defaultValue={group.datePrevueReception}
                              />
                              <button
                                type="submit"
                                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
                              >
                                OK
                              </button>
                            </form>
                          ) : (
                            <span className="text-slate-600">{formatDate(group.datePrevueReception)}</span>
                          )}
                        </td>
                        {canEdit ? (
                          <td className="px-6 py-4">
                            <form action={deleteDossierImportsAction}>
                              <input type="hidden" name="n_doss_4d" value={group.nDoss4d ?? ""} />
                              <input type="hidden" name="n_doss_erp" value={group.nDossErp ?? ""} />
                              <DeleteIconButton label="Supprimer ce dossier" />
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
