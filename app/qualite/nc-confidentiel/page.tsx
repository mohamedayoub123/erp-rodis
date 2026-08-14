import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { AuditTable, type AuditColumn, type AuditRow, type AttachmentFile } from "../audit-table";
import {
  saveNcConfidentielBatchAction,
  deleteNcConfidentielRowAction,
  uploadNcConfidentielFilesAction,
  getNcConfidentielFileUrlAction,
  deleteNcConfidentielFileAction,
} from "./actions";

// Memes 4 valeurs pour Statut correction et Statut AC.
const STATUT_OPTIONS = ["REALISEE", "EN COURS", "NON REALISEE", "NOUVELLE NC OUVERTE ANNEE N+1"];
// Statut cloture : calcule automatiquement a partir de Statut correction et
// Statut AC - CLOTUREE seulement si les 2 valent REALISEE, sinon EN COURS.
const STATUT_CLOTURE_OPTIONS = ["CLOTUREE", "EN COURS"];

// Memes titres, dans le meme ordre, que la feuille "NC Confidentiel" du
// classeur CCSIQP-ENR-053 (Suivi NC & TAF audit Interne).
const COLUMNS: AuditColumn[] = [
  { key: "audit", label: "Audit" },
  { key: "numero", label: "N°" },
  { key: "constat", label: "Constat", long: true },
  { key: "classe", label: "Classe" },
  { key: "processus_concerne", label: "Processus concerné" },
  { key: "service_concerne", label: "Service concerné" },
  { key: "norme_concernee", label: "Norme Concernée" },
  { key: "chapitre", label: "Chapitre" },
  { key: "sous_chapitre", label: "Sous chapitre" },
  { key: "sous_sous_chapitre", label: "Sous sous chapitre" },
  { key: "correction", label: "Correction", long: true },
  { key: "responsable_correction", label: "Responsable de la correction" },
  { key: "delais_correction", label: "Délais Correction" },
  { key: "commentaire", label: "Commentaire", long: true },
  { key: "statut_correction", label: "Statut correction", select: STATUT_OPTIONS },
  { key: "analyse_causes", label: "Analyse des causes", long: true },
  { key: "action_corrective_ac", label: "Action Corrective (AC)", long: true },
  { key: "responsable_ac", label: "Responsable AC" },
  { key: "delais_ac", label: "Délais AC" },
  { key: "commentaire2", label: "commentaire2", long: true },
  { key: "statut_ac", label: "Statut AC", select: STATUT_OPTIONS },
  { key: "methode_mesure_efficacite_ac", label: "Methode de Mesure efficacité AC", long: true },
  { key: "mesure_efficacite_ac", label: "Mesure efficacité AC", long: true },
  { key: "realise_par", label: "Réalisé par" },
  { key: "commentaire3", label: "commentaire3", long: true },
  { key: "statut_cloture", label: "Statut cloture", select: STATUT_CLOTURE_OPTIONS },
];

async function fetchAllRows(): Promise<{ rows: AuditRow[]; attachments: Record<number, AttachmentFile[]> }> {
  const rows: AuditRow[] = [];
  const attachments: Record<number, AttachmentFile[]> = {};
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("qualite_nc_confidentiel")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as Record<string, unknown>[];
    for (const raw of chunk) {
      const id = Number(raw.id);
      const row: AuditRow = { id };
      for (const col of COLUMNS) {
        row[col.key] = raw[col.key] != null ? String(raw[col.key]) : "";
      }
      rows.push(row);
      attachments[id] = Array.isArray(raw.pieces_jointes) ? (raw.pieces_jointes as AttachmentFile[]) : [];
    }

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, attachments };
}

type SearchParams = Promise<{
  audit?: string;
  numero?: string;
  processus?: string;
  statut_correction?: string;
  statut_ac?: string;
  statut_cloture?: string;
}>;

function buildOptions(rows: AuditRow[], key: string) {
  return [...new Set(rows.map((r) => String(r[key] ?? "")).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
}

export default async function NcConfidentielPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "qualiteNcConfidentiel");
  const { rows: allRows, attachments } = await fetchAllRows();

  const auditFilter = (params.audit || "").trim().toLowerCase();
  const numeroFilter = (params.numero || "").trim().toLowerCase();
  const processusFilter = (params.processus || "").trim().toLowerCase();
  const statutCorrectionFilter = (params.statut_correction || "").trim().toLowerCase();
  const statutAcFilter = (params.statut_ac || "").trim().toLowerCase();
  const statutClotureFilter = (params.statut_cloture || "").trim().toLowerCase();
  const hasFilters = Boolean(
    auditFilter || numeroFilter || processusFilter || statutCorrectionFilter || statutAcFilter || statutClotureFilter
  );

  const rows = allRows.filter((row) => {
    if (auditFilter && !String(row.audit ?? "").toLowerCase().includes(auditFilter)) return false;
    if (numeroFilter && !String(row.numero ?? "").toLowerCase().includes(numeroFilter)) return false;
    if (
      processusFilter &&
      !String(row.processus_concerne ?? "").toLowerCase().includes(processusFilter)
    )
      return false;
    if (
      statutCorrectionFilter &&
      !String(row.statut_correction ?? "").toLowerCase().includes(statutCorrectionFilter)
    )
      return false;
    if (statutAcFilter && !String(row.statut_ac ?? "").toLowerCase().includes(statutAcFilter)) return false;
    if (
      statutClotureFilter &&
      !String(row.statut_cloture ?? "").toLowerCase().includes(statutClotureFilter)
    )
      return false;
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
                NC Confidentiel
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Suivi des Non-Conformites d&apos;audit interne.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite" label="Retour qualite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
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
              name="statut_correction"
              placeholder="Statut correction"
              defaultValue={params.statut_correction || ""}
              options={buildOptions(allRows, "statut_correction")}
            />
            <SearchableFilterInput
              name="statut_ac"
              placeholder="Statut AC"
              defaultValue={params.statut_ac || ""}
              options={buildOptions(allRows, "statut_ac")}
            />
            <SearchableFilterInput
              name="statut_cloture"
              placeholder="Statut cloture"
              defaultValue={params.statut_cloture || ""}
              options={buildOptions(allRows, "statut_cloture")}
            />
            <div className="flex items-center gap-3 sm:col-span-3 xl:col-span-6">
              <button
                type="submit"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <Link
                  href="/qualite/nc-confidentiel"
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
            saveBatchAction={saveNcConfidentielBatchAction}
            deleteRowAction={deleteNcConfidentielRowAction}
            attachmentsColumnKey="numero"
            initialAttachments={attachments}
            uploadFilesAction={uploadNcConfidentielFilesAction}
            getFileUrlAction={getNcConfidentielFileUrlAction}
            deleteFileAction={deleteNcConfidentielFileAction}
            closureSourceKeys={["statut_correction", "statut_ac"]}
            closureTargetKey="statut_cloture"
            closureDoneValue="REALISEE"
            closureClosedStatus="CLOTUREE"
            closureOpenStatus="EN COURS"
          />
        </section>
      </div>
    </main>
  );
}
