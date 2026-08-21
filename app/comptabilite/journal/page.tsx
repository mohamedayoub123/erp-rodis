import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

type EcritureRow = {
  id: number;
  date_ecriture: string;
  piece_reference: string | null;
  libelle: string;
  source_type: string;
  created_by: string | null;
};

type LigneRow = {
  ecriture_id: number;
  debit: number;
  credit: number;
  comptes_comptables: { code: string; libelle: string } | { code: string; libelle: string }[] | null;
};

type SearchParams = Promise<{ date_from?: string; date_to?: string; source_type?: string }>;

async function fetchAllEcritures(dateFrom: string, dateTo: string, sourceType: string) {
  const rows: EcritureRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("ecritures_comptables")
      .select("id, date_ecriture, piece_reference, libelle, source_type, created_by")
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);

    if (dateFrom) query = query.gte("date_ecriture", dateFrom);
    if (dateTo) query = query.lte("date_ecriture", dateTo);
    if (sourceType) query = query.eq("source_type", sourceType);

    const { data, error } = await query;
    if (error) return { rows, error };

    const chunk = (data ?? []) as EcritureRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchLignesForEcritures(ecritureIds: number[]) {
  const rows: LigneRow[] = [];
  if (ecritureIds.length === 0) return rows;
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("ecriture_lignes")
      .select("ecriture_id, debit, credit, comptes_comptables(code, libelle)")
      .in("ecriture_id", ecritureIds)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as unknown as LigneRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  mp_achat: "Achat MP",
  mp_stock_entree: "Entree stock MP",
  fabrication_vrac: "Fabrication",
  entree_production: "Entree production",
};

export default async function JournalComptablePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const dateFrom = (params.date_from || "").trim();
  const dateTo = (params.date_to || "").trim();
  const sourceType = (params.source_type || "").trim();

  const { rows: ecritures, error } = await fetchAllEcritures(dateFrom, dateTo, sourceType);
  const lignes = await fetchLignesForEcritures(ecritures.map((e) => e.id));

  const lignesByEcriture = new Map<number, LigneRow[]>();
  for (const ligne of lignes) {
    const list = lignesByEcriture.get(ligne.ecriture_id) ?? [];
    list.push(ligne);
    lignesByEcriture.set(ligne.ecriture_id, list);
  }

  function compteLabel(ligne: LigneRow) {
    const compte = Array.isArray(ligne.comptes_comptables) ? ligne.comptes_comptables[0] : ligne.comptes_comptables;
    return compte ? `${compte.code} - ${compte.libelle}` : "-";
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                Comptabilite
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Journal</h1>
              <p className="mt-2 text-sm text-slate-600">
                Toutes les ecritures generees automatiquement, les plus recentes en premier.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <input
              type="date"
              name="date_from"
              defaultValue={dateFrom}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="date"
              name="date_to"
              defaultValue={dateTo}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <select
              name="source_type"
              defaultValue={sourceType}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Toutes les sources</option>
              {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error.message}</p>
            </div>
          ) : ecritures.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucune ecriture pour l&apos;instant.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {ecritures.map((ecriture) => {
                const ecritureLignes = lignesByEcriture.get(ecriture.id) ?? [];
                return (
                  <details key={ecriture.id} className="px-6 py-4">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {ecriture.date_ecriture} - {ecriture.libelle}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {SOURCE_TYPE_LABELS[ecriture.source_type] || ecriture.source_type}
                      </span>
                    </summary>
                    <table className="mt-3 min-w-full text-left text-sm">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="py-2 pr-4 font-semibold">Compte</th>
                          <th className="py-2 pr-4 font-semibold">Debit</th>
                          <th className="py-2 pr-4 font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ecritureLignes.map((ligne, index) => (
                          <tr key={index} className="border-t border-slate-100">
                            <td className="py-2 pr-4 text-slate-800">{compteLabel(ligne)}</td>
                            <td className="py-2 pr-4 text-slate-600">
                              {ligne.debit > 0 ? ligne.debit.toLocaleString("fr-FR") : "-"}
                            </td>
                            <td className="py-2 pr-4 text-slate-600">
                              {ligne.credit > 0 ? ligne.credit.toLocaleString("fr-FR") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
