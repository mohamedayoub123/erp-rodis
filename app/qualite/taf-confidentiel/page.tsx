import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { AuditTable, type AuditColumn, type AuditRow } from "../audit-table";
import { saveTafConfidentielBatchAction, deleteTafConfidentielRowAction } from "./actions";

// Memes valeurs que celles deja utilisees dans les donnees TAF importees.
const STATUT_OPTIONS = ["EN COURS", "CLOTUREE", "PAS D'ACTION"];

// Memes titres, dans le meme ordre, que la feuille "TAF Confidentiel" du
// classeur CCSIQP-ENR-053 (Suivi NC & TAF audit Interne).
const COLUMNS: AuditColumn[] = [
  { key: "audit", label: "Audit" },
  { key: "numero", label: "n°" },
  { key: "constat", label: "Constat", long: true },
  { key: "processus_concerne", label: "Processus concerné" },
  { key: "service_concerne", label: "Service concerné" },
  { key: "qui", label: "Qui" },
  { key: "delais", label: "Délais" },
  { key: "norme_concernee", label: "Norme concernée" },
  { key: "chapitre", label: "Chapitre" },
  { key: "sous_chapitre", label: "Sous chapitre" },
  { key: "sous_sous_chapitre", label: "Sous sous chapitre" },
  { key: "commentaire", label: "Commentaire", long: true },
  { key: "t1", label: "T1" },
  { key: "t2", label: "T2" },
  { key: "t3", label: "T3" },
  { key: "t4", label: "T4" },
  { key: "tx_progression", label: "Tx de progression" },
  { key: "statut", label: "Statut", select: STATUT_OPTIONS },
];

async function fetchAllRows(): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("qualite_taf_confidentiel")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as Record<string, unknown>[];
    for (const raw of chunk) {
      const row: AuditRow = { id: Number(raw.id) };
      for (const col of COLUMNS) {
        row[col.key] = raw[col.key] != null ? String(raw[col.key]) : "";
      }
      rows.push(row);
    }

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type SearchParams = Promise<{
  audit?: string;
  numero?: string;
  processus?: string;
  statut?: string;
}>;

function buildOptions(rows: AuditRow[], key: string) {
  return [...new Set(rows.map((r) => String(r[key] ?? "")).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
}

export default async function TafConfidentielPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "qualiteTafConfidentiel");
  const allRows = await fetchAllRows();

  const auditFilter = (params.audit || "").trim().toLowerCase();
  const numeroFilter = (params.numero || "").trim().toLowerCase();
  const processusFilter = (params.processus || "").trim().toLowerCase();
  const statutFilter = (params.statut || "").trim().toLowerCase();
  const hasFilters = Boolean(auditFilter || numeroFilter || processusFilter || statutFilter);

  const rows = allRows.filter((row) => {
    if (auditFilter && !String(row.audit ?? "").toLowerCase().includes(auditFilter)) return false;
    if (numeroFilter && !String(row.numero ?? "").toLowerCase().includes(numeroFilter)) return false;
    if (
      processusFilter &&
      !String(row.processus_concerne ?? "").toLowerCase().includes(processusFilter)
    )
      return false;
    if (statutFilter && !String(row.statut ?? "").toLowerCase().includes(statutFilter)) return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                TAF Confidentiel
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Suivi des TAF d&apos;audit interne.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite" label="Retour qualite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SearchableFilterInput
              name="audit"
              placeholder="Audit"
              defaultValue={params.audit || ""}
              options={buildOptions(allRows, "audit")}
            />
            <SearchableFilterInput
              name="numero"
              placeholder="N°"
              defaultValue={params.numero || ""}
              options={buildOptions(allRows, "numero")}
            />
            <SearchableFilterInput
              name="processus"
              placeholder="Processus concerné"
              defaultValue={params.processus || ""}
              options={buildOptions(allRows, "processus_concerne")}
            />
            <SearchableFilterInput
              name="statut"
              placeholder="Statut"
              defaultValue={params.statut || ""}
              options={buildOptions(allRows, "statut")}
            />
            <div className="flex items-center gap-3 sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <Link
                  href="/qualite/taf-confidentiel"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <AuditTable
            columns={COLUMNS}
            initialRows={rows}
            canWrite={canWrite}
            saveBatchAction={saveTafConfidentielBatchAction}
            deleteRowAction={deleteTafConfidentielRowAction}
          />
        </section>
      </div>
    </main>
  );
}
