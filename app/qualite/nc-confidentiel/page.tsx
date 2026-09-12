import Link from "next/link";
import type { ReactNode } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { canWritePageUser, getCurrentStockUser, getNcTafProcessusAutorisesUser } from "@/lib/stock-auth";
import { formatDate } from "../../production/suivi/data";
import { AuditTable, type AuditColumn, type AuditRow, type AttachmentFile } from "../audit-table";
import {
  saveNcConfidentielBatchAction,
  deleteNcConfidentielRowAction,
  createNcConfidentielUploadSlotAction,
  confirmNcConfidentielUploadAction,
  getNcConfidentielFileUrlAction,
  deleteNcConfidentielFileAction,
  addNcEntryAction,
  updateNcEntryTextAction,
  createNcEntryUploadSlotAction,
  confirmNcEntryUploadAction,
  deleteNcEntryFileAction,
  type CorrectionEntry,
  type EntryField,
} from "./actions";
import { CorrectionEntries } from "./correction-entries";

// Memes 4 valeurs pour Statut correction et Statut AC.
const STATUT_OPTIONS = ["REALISEE", "EN COURS", "EN ATTENTE", "NON REALISEE", "NOUVELLE NC OUVERTE ANNEE N+1"];
// Statut cloture : calcule automatiquement a partir de Statut correction et
// Statut AC - CLOTUREE seulement si les 2 valent REALISEE, sinon EN COURS.
const STATUT_CLOTURE_OPTIONS = ["CLOTUREE", "EN COURS"];

// Ces colonnes restent en lecture seule pour tout le monde, meme l'admin -
// seule felicite peut les modifier. "numero" en est retire (demande
// explicite : "la personne qui peut ajouter il faut que ca vienne
// automatique avec lui, pas restreint a felicite") - modifiable par
// n'importe quel compte ayant acces en ecriture a ce tableau, comme les
// champs normaux.
const RESTRICTED_COLUMN_KEYS = ["audit", "constat", "processus_concerne", "service_concerne"];

const DATE_COLUMN_KEYS = ["created_at", "date_realisation_correction", "date_realisation_ac", "date_realisation"];

// Correction/Action Corrective sont desormais des listes d'entrees datees
// (colonnes JSONB correction_entries/action_corrective_ac_entries, voir
// correction-entries.tsx) - l'ancienne colonne texte du meme nom n'est plus
// jamais ecrite. La colonne du tableau affiche donc un resume de ces
// entrees plutot que l'ancien champ, sinon elle restait vide en
// permanence des qu'une NC n'utilisait plus que la nouvelle page detail.
const ENTRY_COLUMN_SOURCE: Record<string, string> = {
  correction: "correction_entries",
  action_corrective_ac: "action_corrective_ac_entries",
};

// Memes titres, dans le meme ordre, que la feuille "NC Confidentiel" du
// classeur CCSIQP-ENR-053 (Suivi NC & TAF audit Interne), plus 4 colonnes
// jamais dans le classeur d'origine - demande explicite : "Date" (creation)
// en 1ere colonne, puis chaque date de realisation juste a cote de son
// statut (Correction, AC, puis Cloture globale) plutot que toutes
// regroupees a la fin.
// readOnly (les 4 colonnes de date) : toujours calculees cote serveur (voir
// actions.ts), jamais saisies a la main - meme felicite ne peut pas les
// corriger, contrairement aux colonnes de RESTRICTED_COLUMN_KEYS ci-dessus.
// Demande explicite : uniquement de l'information vue, jamais un champ
// ecrivable.
const COLUMNS: AuditColumn[] = [
  { key: "created_at", label: "Date", readOnly: true },
  { key: "audit", label: "Audit" },
  // readOnly (numero) : genere automatiquement a la creation (voir
  // genererProchainNumero dans actions.ts) - demande explicite, plus
  // modifiable a la main du tout, meme felicite.
  { key: "numero", label: "N°", readOnly: true },
  { key: "constat", label: "Constat", long: true },
  // readOnly (Classe -> Sous sous chapitre) : deja saisies a la creation
  // (voir /qualite/nc-confidentiel/nouvelle), plus rien a corriger ici -
  // demande explicite.
  { key: "classe", label: "Classe", readOnly: true },
  { key: "processus_concerne", label: "Processus concerné" },
  { key: "service_concerne", label: "Service concerné" },
  { key: "norme_concernee", label: "Norme Concernée", readOnly: true },
  { key: "chapitre", label: "Chapitre", readOnly: true },
  { key: "sous_chapitre", label: "Sous chapitre", readOnly: true },
  { key: "sous_sous_chapitre", label: "Sous sous chapitre", readOnly: true },
  // readOnly (Correction -> commentaire3, Statut correction, Statut AC) :
  // editables UNIQUEMENT depuis la page dediee /qualite/nc-confidentiel/[id]
  // (bouton "📝") - demande explicite, le tableau ne doit plus permettre de
  // taper directement dans ces colonnes (trop etroites, saisie en double
  // avec la page dediee).
  { key: "correction", label: "Correction", long: true, readOnly: true },
  { key: "responsable_correction", label: "Responsable de la correction", readOnly: true },
  { key: "delais_correction", label: "Délais Correction", readOnly: true },
  { key: "commentaire", label: "Commentaire", long: true, readOnly: true },
  { key: "statut_correction", label: "Statut correction", select: STATUT_OPTIONS, readOnly: true },
  { key: "date_realisation_correction", label: "Date correction réalisée", readOnly: true },
  { key: "analyse_causes", label: "Analyse des causes", long: true, readOnly: true },
  { key: "action_corrective_ac", label: "Action Corrective (AC)", long: true, readOnly: true },
  { key: "responsable_ac", label: "Responsable AC", readOnly: true },
  { key: "delais_ac", label: "Délais AC", readOnly: true },
  { key: "commentaire2", label: "commentaire2", long: true, readOnly: true },
  { key: "statut_ac", label: "Statut AC", select: STATUT_OPTIONS, readOnly: true },
  { key: "date_realisation_ac", label: "Date AC réalisée", readOnly: true },
  { key: "methode_mesure_efficacite_ac", label: "Methode de Mesure efficacité AC", long: true, readOnly: true },
  { key: "mesure_efficacite_ac", label: "Mesure efficacité AC", long: true, readOnly: true },
  { key: "realise_par", label: "Réalisé par", readOnly: true },
  { key: "commentaire3", label: "commentaire3", long: true, readOnly: true },
  { key: "statut_cloture", label: "Statut cloture", select: STATUT_CLOTURE_OPTIONS, readOnly: true },
  { key: "date_realisation", label: "Date de clôture", readOnly: true },
];

async function fetchAllRows(): Promise<{
  rows: AuditRow[];
  attachments: Record<number, AttachmentFile[]>;
  correctionEntriesById: Record<number, CorrectionEntry[]>;
  acEntriesById: Record<number, CorrectionEntry[]>;
}> {
  const rows: AuditRow[] = [];
  const attachments: Record<number, AttachmentFile[]> = {};
  const correctionEntriesById: Record<number, CorrectionEntry[]> = {};
  const acEntriesById: Record<number, CorrectionEntry[]> = {};
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
        if (DATE_COLUMN_KEYS.includes(col.key)) {
          row[col.key] = raw[col.key] ? formatDate(String(raw[col.key])) : "";
          continue;
        }
        const entriesSource = ENTRY_COLUMN_SOURCE[col.key];
        if (entriesSource) {
          const entries = (raw[entriesSource] as { date: string; texte: string }[] | null) ?? [];
          row[col.key] = entries.map((entry) => `${entry.date} : ${entry.texte}`).join("\n\n");
          continue;
        }
        row[col.key] = raw[col.key] != null ? String(raw[col.key]) : "";
      }
      rows.push(row);
      attachments[id] = Array.isArray(raw.pieces_jointes) ? (raw.pieces_jointes as AttachmentFile[]) : [];
      correctionEntriesById[id] = (raw.correction_entries as CorrectionEntry[] | null) ?? [];
      acEntriesById[id] = (raw.action_corrective_ac_entries as CorrectionEntry[] | null) ?? [];
    }

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, attachments, correctionEntriesById, acEntriesById };
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
  const {
    rows: rowsFetched,
    attachments: attachmentsFetched,
    correctionEntriesById,
    acEntriesById,
  } = await fetchAllRows();

  // Donnees confidentielles d'audit - en plus de la permission de page,
  // chaque compte ne voit que les lignes de son perimetre "Processus
  // concerne" (admin = tout, voir getNcTafProcessusAutorisesUser). Filtre
  // ici, avant toute autre etape (options de filtre, tableau), pour ne
  // jamais exposer meme le NOM d'un processus hors perimetre.
  const processusAutorises = await getNcTafProcessusAutorisesUser(currentUser);
  const allRows =
    processusAutorises === "all"
      ? rowsFetched
      : rowsFetched.filter((row) => processusAutorises.includes(String(row.processus_concerne ?? "").trim()));
  const attachments = Object.fromEntries(
    Object.entries(attachmentsFetched).filter(([id]) => allRows.some((row) => row.id === Number(id)))
  );

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

  // Correction/Action Corrective : demande explicite - le bouton "Joindre"
  // et les fichiers doivent etre visibles directement dans le tableau (pas
  // seulement sur la page dediee /qualite/nc-confidentiel/[id]) - le meme
  // composant CorrectionEntries est donc pre-rendu ici et pousse comme
  // "customCells" (voir audit-table.tsx : une fonction ne peut pas
  // traverser la frontiere Server->Client Component, un noeud deja rendu
  // le peut). allowEdit=false : modifier le texte d'une entree ou en
  // ajouter une nouvelle reste reserve a la page dediee - demande
  // explicite ("pour le modification et l'ajout je veux pas ca ici").
  const ENTRY_FIELDS: { key: EntryField; entriesById: Record<number, CorrectionEntry[]> }[] = [
    { key: "correction", entriesById: correctionEntriesById },
    { key: "action_corrective_ac", entriesById: acEntriesById },
  ];
  const customCells: Record<string, ReactNode> = {};
  for (const row of rows) {
    if (row.id == null) continue;
    for (const { key, entriesById } of ENTRY_FIELDS) {
      customCells[`${row.id}::${key}`] = (
        <CorrectionEntries
          key={`${key}-${row.id}`}
          ncId={row.id}
          field={key}
          initialEntries={entriesById[row.id] ?? []}
          canWrite={canWrite}
          allowEdit={false}
          addEntryAction={addNcEntryAction}
          updateEntryTextAction={updateNcEntryTextAction}
          createUploadSlotAction={createNcEntryUploadSlotAction}
          confirmUploadAction={confirmNcEntryUploadAction}
          getFileUrlAction={getNcConfidentielFileUrlAction}
          deleteFileAction={deleteNcEntryFileAction}
        />
      );
    }
  }

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
              <Link
                href="/qualite/nc-confidentiel/compteurs"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              >
                Compteurs de numero
              </Link>
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

        <AuditTable
          columns={COLUMNS}
          initialRows={rows}
          canWrite={canWrite}
          saveBatchAction={saveNcConfidentielBatchAction}
          deleteRowAction={deleteNcConfidentielRowAction}
          attachmentsColumnKey="numero"
          initialAttachments={attachments}
          createUploadSlotAction={createNcConfidentielUploadSlotAction}
          confirmUploadAction={confirmNcConfidentielUploadAction}
          getFileUrlAction={getNcConfidentielFileUrlAction}
          deleteFileAction={deleteNcConfidentielFileAction}
          closureSourceKeys={["statut_correction", "statut_ac"]}
          closureTargetKey="statut_cloture"
          closureDoneValue="REALISEE"
          closureClosedStatus="CLOTUREE"
          closureOpenStatus="EN COURS"
          restrictedColumnKeys={RESTRICTED_COLUMN_KEYS}
          canEditRestrictedColumns={currentUser === "felicite"}
          addRowHref="/qualite/nc-confidentiel/nouvelle"
          detailHrefPrefix="/qualite/nc-confidentiel"
          customCells={customCells}
        />
      </div>
    </main>
  );
}
