import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { TestLaboLineChart } from "../rapport/test-labo-line-chart";

type NcRow = {
  audit: string | null;
  numero: string | null;
  processus_concerne: string | null;
  statut_cloture: string | null;
  created_at: string | null;
  date_realisation: string | null;
};
type TafRow = {
  audit: string | null;
  numero: string | null;
  processus_concerne: string | null;
  statut: string | null;
  created_at: string | null;
  date_realisation: string | null;
};

async function fetchAllRows<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
    if (error) break;

    const chunk = (data ?? []) as T[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Le numero encode l'annee ("AI-1-2026-NC-033", "AI-2-2025-TAF-024") - pas
// de colonne annee dediee sur ces tableaux (calques sur le classeur Excel
// d'origine CCSIQP-ENR-053), donc extraite depuis le numero.
function parseAnnee(numero: string | null): string {
  const m = String(numero || "").match(/-(\d{4})-/);
  return m ? m[1] : "Annee inconnue";
}

// Marqueur d'un NC/TAF reporte sur l'annee suivante (jamais rattache a un
// audit ou un processus precis) - retrouve tel quel dans "audit" ("NOUVELLE
// NC OUVERTE ANNEE N+1") ET dans "processus_concerne" ("Report 2026") selon
// le tableau - meme libelle affiche dans les 2 cas plutot que de le traiter
// comme un vrai audit/processus.
function estReporte(value: string | null): boolean {
  const upper = String(value || "").toUpperCase();
  return upper.includes("NOUVELLE NC OUVERTE") || upper.includes("REPORT ");
}

// "audit" contient parfois des annotations libres collees au chiffre
// ("1\nANNULEE", "3\nTransfere en 2026 dans la AI-1-2026-TAF-038") - seul
// le chiffre en tete designe le A1/A2/A3/A4 reel, le reste est une note.
function parsePeriode(audit: string | null): string {
  const raw = String(audit || "").trim();
  if (estReporte(raw)) return "Reportee N+1";
  if (!raw) return "Non classe";
  const m = raw.match(/^(\d+)/);
  return m ? `A${m[1]}` : "Non classe";
}

// Groupe par la valeur EXACTE de processus_concerne (meme convention que le
// filtre "Processus" deja present sur NC/TAF Confidentiel) - jamais fusionne
// 2 libelles qui se ressemblent (ex: 2 formulations differentes de PR4) :
// une fusion automatique serait une decision editoriale sur la taxonomie
// qualite, pas a Claude de la prendre sans qu'on le demande explicitement.
function parseProcessus(value: string | null): string {
  const raw = String(value || "").trim();
  if (estReporte(raw)) return "Reportee N+1";
  return raw || "Non renseigne";
}

// Ordre d'affichage naturel des periodes (A1..A4 d'abord, cas particuliers
// ensuite) - jamais alphabetique (donnerait "A1, A10, A2..." des que 2
// chiffres, et les cas speciaux se retrouveraient au milieu).
const PERIODE_ORDER = ["A1", "A2", "A3", "A4"];
function periodeRank(periode: string): number {
  const index = PERIODE_ORDER.indexOf(periode);
  return index >= 0 ? index : PERIODE_ORDER.length + (periode === "Reportee N+1" ? 0 : 1);
}

type Compte = { nbNc: number; ncRealisees: number; nbTaf: number; tafRealisees: number };

function nouveauCompte(): Compte {
  return { nbNc: 0, ncRealisees: 0, nbTaf: 0, tafRealisees: 0 };
}

// % calcule SEPAREMENT pour NC et pour TAF (jamais un % combine "NC+TAF" -
// demande explicite : "le % il faut qu'il reste juste pour le NC seul et
// pour le TAF seul").
function pct(realise: number, total: number): number | null {
  return total > 0 ? Math.round((realise / total) * 1000) / 10 : null;
}

function pctLabel(realise: number, total: number): string {
  const value = pct(realise, total);
  return value === null ? "-" : `${value}%`;
}

const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];
function moisLabel(moisKey: string) {
  const [year, month] = moisKey.split("-");
  const index = Number(month) - 1;
  return `${MOIS_NOMS[index] ?? month} ${year}`;
}

// "created_at" est un timestamp ISO, "date_realisation" une simple date
// "YYYY-MM-DD" (voir actions.ts) - les 2 commencent par "YYYY-MM", donc
// meme extraction pour les 2.
function moisKeyFromDate(value: string | null): string | null {
  const m = String(value || "").match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function moisRange(debut: string, fin: string): string[] {
  const mois: string[] = [];
  const [debutY, debutM] = debut.split("-").map(Number);
  const [finY, finM] = fin.split("-").map(Number);
  let y = debutY;
  let m = debutM;
  while (y < finY || (y === finY && m <= finM)) {
    mois.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return mois;
}

export default async function RapportNcTafPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  if (!(await canViewPageUser(currentUser, "qualiteRapportNcTaf"))) {
    redirect("/qualite");
  }

  const [ncRows, tafRows] = await Promise.all([
    fetchAllRows<NcRow>(
      "qualite_nc_confidentiel",
      "audit, numero, processus_concerne, statut_cloture, created_at, date_realisation"
    ),
    fetchAllRows<TafRow>(
      "qualite_taf_confidentiel",
      "audit, numero, processus_concerne, statut, created_at, date_realisation"
    ),
  ]);

  // --- Croise Annee x Audit ---
  type AnneeAuditRow = Compte & { annee: string; periode: string };
  const parAnneeAudit = new Map<string, AnneeAuditRow>();
  function getOrCreateAnneeAudit(annee: string, periode: string): AnneeAuditRow {
    const key = `${annee}::${periode}`;
    const current = parAnneeAudit.get(key);
    if (current) return current;
    const created: AnneeAuditRow = { annee, periode, ...nouveauCompte() };
    parAnneeAudit.set(key, created);
    return created;
  }

  // --- Par processus concerne ---
  type ProcessusRow = Compte & { processus: string };
  const parProcessus = new Map<string, ProcessusRow>();
  function getOrCreateProcessus(processus: string): ProcessusRow {
    const current = parProcessus.get(processus);
    if (current) return current;
    const created: ProcessusRow = { processus, ...nouveauCompte() };
    parProcessus.set(processus, created);
    return created;
  }

  for (const row of ncRows) {
    const annee = parseAnnee(row.numero);
    const periode = parsePeriode(row.audit);
    const processus = parseProcessus(row.processus_concerne);
    const estRealisee = row.statut_cloture === "CLOTUREE";

    const anneeAudit = getOrCreateAnneeAudit(annee, periode);
    anneeAudit.nbNc += 1;
    if (estRealisee) anneeAudit.ncRealisees += 1;

    const proc = getOrCreateProcessus(processus);
    proc.nbNc += 1;
    if (estRealisee) proc.ncRealisees += 1;
  }

  for (const row of tafRows) {
    const annee = parseAnnee(row.numero);
    const periode = parsePeriode(row.audit);
    const processus = parseProcessus(row.processus_concerne);
    const estRealisee = row.statut === "CLOTUREE";

    const anneeAudit = getOrCreateAnneeAudit(annee, periode);
    anneeAudit.nbTaf += 1;
    if (estRealisee) anneeAudit.tafRealisees += 1;

    const proc = getOrCreateProcessus(processus);
    proc.nbTaf += 1;
    if (estRealisee) proc.tafRealisees += 1;
  }

  const croiseRows = [...parAnneeAudit.values()].sort((a, b) => {
    if (a.annee !== b.annee) return b.annee.localeCompare(a.annee);
    return periodeRank(a.periode) - periodeRank(b.periode);
  });

  // Sous-totaux par annee, dans l'ordre d'affichage (juste apres les lignes
  // de cette annee).
  const anneesOrder = [...new Set(croiseRows.map((r) => r.annee))];
  const totalParAnnee = new Map<string, AnneeAuditRow>();
  for (const row of croiseRows) {
    const current = totalParAnnee.get(row.annee) ?? { annee: row.annee, periode: "Total", ...nouveauCompte() };
    current.nbNc += row.nbNc;
    current.ncRealisees += row.ncRealisees;
    current.nbTaf += row.nbTaf;
    current.tafRealisees += row.tafRealisees;
    totalParAnnee.set(row.annee, current);
  }

  const displayRows: (AnneeAuditRow & { isSubtotal?: boolean })[] = [];
  for (const annee of anneesOrder) {
    for (const row of croiseRows.filter((r) => r.annee === annee)) {
      displayRows.push(row);
    }
    const subtotal = totalParAnnee.get(annee);
    if (subtotal) displayRows.push({ ...subtotal, isSubtotal: true });
  }

  // Les processus les plus concernes (NC+TAF) en tete - pas alphabetique,
  // pour faire remonter directement ce qui merite le plus d'attention.
  const processusRows = [...parProcessus.values()].sort(
    (a, b) => b.nbNc + b.nbTaf - (a.nbNc + a.nbTaf)
  );

  const grandTotal = croiseRows.reduce(
    (acc, r) => ({
      nbNc: acc.nbNc + r.nbNc,
      ncRealisees: acc.ncRealisees + r.ncRealisees,
      nbTaf: acc.nbTaf + r.nbTaf,
      tafRealisees: acc.tafRealisees + r.tafRealisees,
    }),
    nouveauCompte()
  );

  // Evolution dans le temps du % realise - CUMULE (pas juste le % des
  // items crees ce mois-la) : "a fin de ce mois, quelle part de TOUT ce qui
  // a ete ouvert depuis le debut a deja ete cloturee" - demande explicite
  // ("comment on evalue le % de realisation" dans le temps). Un % par
  // cohorte du mois de creation serait trompeur ici (un NC recent n'a
  // souvent pas encore eu le temps d'etre cloture, meme si tout se passe
  // normalement) - le cumule montre la vraie tendance de rattrapage.
  //
  // Fiable seulement si date_realisation est rempli sur les anciennes
  // lignes deja cloturees - voir scripts/sql/add_date_realisation_nc_taf.sql
  // (backfill sur updated_at, la seule estimation disponible pour le passe).
  const ncCreationMonths = ncRows.map((r) => moisKeyFromDate(r.created_at));
  const ncRealisationMonths = ncRows.map((r) => moisKeyFromDate(r.date_realisation));
  const tafCreationMonths = tafRows.map((r) => moisKeyFromDate(r.created_at));
  const tafRealisationMonths = tafRows.map((r) => moisKeyFromDate(r.date_realisation));

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const toutesLesMoisCreation = [...ncCreationMonths, ...tafCreationMonths].filter(
    (m): m is string => m !== null
  );
  const premierMois =
    toutesLesMoisCreation.length > 0 ? [...toutesLesMoisCreation].sort()[0] : currentMonthKey;
  const monthKeys = moisRange(premierMois, currentMonthKey);

  const pctNcParMois = monthKeys.map((mk) => {
    const cumulNb = ncCreationMonths.filter((m) => m !== null && m <= mk).length;
    const cumulRealise = ncRealisationMonths.filter((m) => m !== null && m <= mk).length;
    return pct(cumulRealise, cumulNb) ?? 0;
  });
  const pctTafParMois = monthKeys.map((mk) => {
    const cumulNb = tafCreationMonths.filter((m) => m !== null && m <= mk).length;
    const cumulRealise = tafRealisationMonths.filter((m) => m !== null && m <= mk).length;
    return pct(cumulRealise, cumulNb) ?? 0;
  });

  const evolutionSeries = [
    { key: "pct_nc", label: "% NC realise (cumule)", color: "#7c3aed", values: pctNcParMois },
    { key: "pct_taf", label: "% TAF realise (cumule)", color: "#0284c7", values: pctTafParMois },
  ];
  const monthLabels = monthKeys.map(moisLabel);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport NC &amp; TAF</h1>
              <p className="mt-2 text-sm text-slate-600">
                Nombre de NC et de TAF par audit (A1 a A4) et par annee, et par processus concerne, avec
                combien sont realises (cloturees).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite" label="Retour qualite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-2xl bg-violet-50 px-4 py-3 text-sm">
            NC :<span className="ml-2 font-bold text-violet-900">{grandTotal.nbNc}</span>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
            NC realisees :<span className="ml-2 font-bold text-emerald-900">{grandTotal.ncRealisees}</span>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm">
            % NC realise :
            <span className="ml-2 font-bold text-amber-900">
              {pctLabel(grandTotal.ncRealisees, grandTotal.nbNc)}
            </span>
          </div>
          <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm">
            TAF :<span className="ml-2 font-bold text-sky-900">{grandTotal.nbTaf}</span>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
            TAF realisees :<span className="ml-2 font-bold text-emerald-900">{grandTotal.tafRealisees}</span>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm">
            % TAF realise :
            <span className="ml-2 font-bold text-amber-900">
              {pctLabel(grandTotal.tafRealisees, grandTotal.nbTaf)}
            </span>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <TestLaboLineChart
            months={monthLabels}
            series={evolutionSeries}
            title="Evolution du % realise dans le temps"
            unit="%"
          />
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Par annee et par audit</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Annee</th>
                  <th className="px-4 py-3 font-semibold">Audit</th>
                  <th className="px-4 py-3 font-semibold">Nb NC</th>
                  <th className="px-4 py-3 font-semibold">NC realisees</th>
                  <th className="px-4 py-3 font-semibold">% NC</th>
                  <th className="px-4 py-3 font-semibold">Nb TAF</th>
                  <th className="px-4 py-3 font-semibold">TAF realisees</th>
                  <th className="px-4 py-3 font-semibold">% TAF</th>
                  <th className="px-4 py-3 font-semibold">Total (NC+TAF)</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr
                    key={`${row.annee}-${row.periode}`}
                    className={`border-t border-slate-100 ${row.isSubtotal ? "bg-slate-50 font-semibold" : ""}`}
                  >
                    <td className="px-4 py-3 text-slate-900">{row.isSubtotal ? row.annee : ""}</td>
                    <td className="px-4 py-3 text-slate-700">{row.periode}</td>
                    <td className="px-4 py-3 text-slate-700">{row.nbNc}</td>
                    <td className="px-4 py-3 text-emerald-700">{row.ncRealisees}</td>
                    <td className="px-4 py-3 text-slate-700">{pctLabel(row.ncRealisees, row.nbNc)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.nbTaf}</td>
                    <td className="px-4 py-3 text-emerald-700">{row.tafRealisees}</td>
                    <td className="px-4 py-3 text-slate-700">{pctLabel(row.tafRealisees, row.nbTaf)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.nbNc + row.nbTaf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">Par processus concerne</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Processus concerne</th>
                  <th className="px-4 py-3 font-semibold">Nb NC</th>
                  <th className="px-4 py-3 font-semibold">NC realisees</th>
                  <th className="px-4 py-3 font-semibold">% NC</th>
                  <th className="px-4 py-3 font-semibold">Nb TAF</th>
                  <th className="px-4 py-3 font-semibold">TAF realisees</th>
                  <th className="px-4 py-3 font-semibold">% TAF</th>
                  <th className="px-4 py-3 font-semibold">Total (NC+TAF)</th>
                </tr>
              </thead>
              <tbody>
                {processusRows.map((row) => (
                  <tr key={row.processus} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.processus}</td>
                    <td className="px-4 py-3 text-slate-700">{row.nbNc}</td>
                    <td className="px-4 py-3 text-emerald-700">{row.ncRealisees}</td>
                    <td className="px-4 py-3 text-slate-700">{pctLabel(row.ncRealisees, row.nbNc)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.nbTaf}</td>
                    <td className="px-4 py-3 text-emerald-700">{row.tafRealisees}</td>
                    <td className="px-4 py-3 text-slate-700">{pctLabel(row.tafRealisees, row.nbTaf)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.nbNc + row.nbTaf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
