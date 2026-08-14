import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { AuditTable, type AuditColumn, type AuditRow } from "../audit-table";
import { saveNcConfidentielBatchAction, deleteNcConfidentielRowAction } from "./actions";

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
  { key: "statut_correction", label: "Statut correction" },
  { key: "analyse_causes", label: "Analyse des causes", long: true },
  { key: "action_corrective_ac", label: "Action Corrective (AC)", long: true },
  { key: "responsable_ac", label: "Responsable AC" },
  { key: "delais_ac", label: "Délais AC" },
  { key: "commentaire2", label: "commentaire2", long: true },
  { key: "statut_ac", label: "Statut AC" },
  { key: "methode_mesure_efficacite_ac", label: "Methode de Mesure efficacité AC", long: true },
  { key: "mesure_efficacite_ac", label: "Mesure efficacité AC", long: true },
  { key: "realise_par", label: "Réalisé par" },
  { key: "commentaire3", label: "commentaire3", long: true },
  { key: "statut_cloture", label: "Statut cloture" },
];

async function fetchAllRows(): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
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

export default async function NcConfidentielPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "qualiteNcConfidentiel");
  const rows = await fetchAllRows();

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

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <AuditTable
            columns={COLUMNS}
            initialRows={rows}
            canWrite={canWrite}
            saveBatchAction={saveNcConfidentielBatchAction}
            deleteRowAction={deleteNcConfidentielRowAction}
          />
        </section>
      </div>
    </main>
  );
}
