import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";

type NcRow = { audit: string | null; numero: string | null; statut_cloture: string | null };
type TafRow = { audit: string | null; numero: string | null; statut: string | null };

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

// "audit" contient parfois des annotations libres collees au chiffre
// ("1\nANNULEE", "3\nTransfere en 2026 dans la AI-1-2026-TAF-038") - seul
// le chiffre en tete designe le A1/A2/A3/A4 reel, le reste est une note.
// "NOUVELLE NC OUVERTE ANNEE N+1" est un cas special explicite (NC reportee
// sur l'annee suivante, jamais rattachee a un audit precis) - garde son
// propre libelle plutot que de tomber dans "Non classe".
function parsePeriode(audit: string | null): string {
  const raw = String(audit || "").trim();
  if (!raw) return "Non classe";
  if (raw.toUpperCase().includes("NOUVELLE NC OUVERTE")) return "Reportee N+1";
  const m = raw.match(/^(\d+)/);
  return m ? `A${m[1]}` : "Non classe";
}

// Ordre d'affichage naturel des periodes (A1..A4 d'abord, cas particuliers
// ensuite) - jamais alphabetique (donnerait "A1, A10, A2..." des que 2
// chiffres, et les cas speciaux se retrouveraient au milieu).
const PERIODE_ORDER = ["A1", "A2", "A3", "A4"];
function periodeRank(periode: string): number {
  const index = PERIODE_ORDER.indexOf(periode);
  return index >= 0 ? index : PERIODE_ORDER.length + (periode === "Reportee N+1" ? 0 : 1);
}

type CroiseRow = {
  annee: string;
  periode: string;
  nbNc: number;
  ncRealisees: number;
  nbTaf: number;
  tafRealisees: number;
};

export default async function RapportNcTafPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  if (!(await canViewPageUser(currentUser, "qualiteRapportNcTaf"))) {
    redirect("/qualite");
  }

  const [ncRows, tafRows] = await Promise.all([
    fetchAllRows<NcRow>("qualite_nc_confidentiel", "audit, numero, statut_cloture"),
    fetchAllRows<TafRow>("qualite_taf_confidentiel", "audit, numero, statut"),
  ]);

  const parMap = new Map<string, CroiseRow>();
  function getOrCreate(annee: string, periode: string): CroiseRow {
    const key = `${annee}::${periode}`;
    const current = parMap.get(key);
    if (current) return current;
    const created: CroiseRow = { annee, periode, nbNc: 0, ncRealisees: 0, nbTaf: 0, tafRealisees: 0 };
    parMap.set(key, created);
    return created;
  }

  for (const row of ncRows) {
    const annee = parseAnnee(row.numero);
    const periode = parsePeriode(row.audit);
    const current = getOrCreate(annee, periode);
    current.nbNc += 1;
    if (row.statut_cloture === "CLOTUREE") current.ncRealisees += 1;
  }

  for (const row of tafRows) {
    const annee = parseAnnee(row.numero);
    const periode = parsePeriode(row.audit);
    const current = getOrCreate(annee, periode);
    current.nbTaf += 1;
    if (row.statut === "CLOTUREE") current.tafRealisees += 1;
  }

  const croiseRows = [...parMap.values()].sort((a, b) => {
    if (a.annee !== b.annee) return b.annee.localeCompare(a.annee);
    return periodeRank(a.periode) - periodeRank(b.periode);
  });

  // Sous-totaux par annee, dans l'ordre d'affichage (juste apres les lignes
  // de cette annee).
  const anneesOrder = [...new Set(croiseRows.map((r) => r.annee))];
  const totalParAnnee = new Map<string, CroiseRow>();
  for (const row of croiseRows) {
    const current = totalParAnnee.get(row.annee) ?? {
      annee: row.annee,
      periode: "Total",
      nbNc: 0,
      ncRealisees: 0,
      nbTaf: 0,
      tafRealisees: 0,
    };
    current.nbNc += row.nbNc;
    current.ncRealisees += row.ncRealisees;
    current.nbTaf += row.nbTaf;
    current.tafRealisees += row.tafRealisees;
    totalParAnnee.set(row.annee, current);
  }

  const displayRows: (CroiseRow & { isSubtotal?: boolean })[] = [];
  for (const annee of anneesOrder) {
    for (const row of croiseRows.filter((r) => r.annee === annee)) {
      displayRows.push(row);
    }
    const subtotal = totalParAnnee.get(annee);
    if (subtotal) displayRows.push({ ...subtotal, isSubtotal: true });
  }

  const grandTotal = croiseRows.reduce(
    (acc, r) => ({
      nbNc: acc.nbNc + r.nbNc,
      ncRealisees: acc.ncRealisees + r.ncRealisees,
      nbTaf: acc.nbTaf + r.nbTaf,
      tafRealisees: acc.tafRealisees + r.tafRealisees,
    }),
    { nbNc: 0, ncRealisees: 0, nbTaf: 0, tafRealisees: 0 }
  );
  const totalGlobal = grandTotal.nbNc + grandTotal.nbTaf;
  const realiseGlobal = grandTotal.ncRealisees + grandTotal.tafRealisees;
  const pctGlobal = totalGlobal > 0 ? Math.round((realiseGlobal / totalGlobal) * 1000) / 10 : 0;

  function pct(realise: number, total: number) {
    return total > 0 ? Math.round((realise / total) * 1000) / 10 : null;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Rapport NC &amp; TAF</h1>
              <p className="mt-2 text-sm text-slate-600">
                Nombre de NC et de TAF par audit (A1 a A4) et par annee, avec combien sont realisees
                (cloturees).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite" label="Retour qualite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-2xl bg-violet-50 px-4 py-3 text-sm">
            NC :<span className="ml-2 font-bold text-violet-900">{grandTotal.nbNc}</span>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
            NC realisees :<span className="ml-2 font-bold text-emerald-900">{grandTotal.ncRealisees}</span>
          </div>
          <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm">
            TAF :<span className="ml-2 font-bold text-sky-900">{grandTotal.nbTaf}</span>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
            TAF realisees :<span className="ml-2 font-bold text-emerald-900">{grandTotal.tafRealisees}</span>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm">
            % realise (NC+TAF) :<span className="ml-2 font-bold text-amber-900">{pctGlobal}%</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Annee</th>
                  <th className="px-4 py-3 font-semibold">Audit</th>
                  <th className="px-4 py-3 font-semibold">Nb NC</th>
                  <th className="px-4 py-3 font-semibold">NC realisees</th>
                  <th className="px-4 py-3 font-semibold">Nb TAF</th>
                  <th className="px-4 py-3 font-semibold">TAF realisees</th>
                  <th className="px-4 py-3 font-semibold">Total (NC+TAF)</th>
                  <th className="px-4 py-3 font-semibold">% realise</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const total = row.nbNc + row.nbTaf;
                  const realise = row.ncRealisees + row.tafRealisees;
                  return (
                    <tr
                      key={`${row.annee}-${row.periode}`}
                      className={`border-t border-slate-100 ${row.isSubtotal ? "bg-slate-50 font-semibold" : ""}`}
                    >
                      <td className="px-4 py-3 text-slate-900">{row.isSubtotal ? row.annee : ""}</td>
                      <td className="px-4 py-3 text-slate-700">{row.periode}</td>
                      <td className="px-4 py-3 text-slate-700">{row.nbNc}</td>
                      <td className="px-4 py-3 text-emerald-700">{row.ncRealisees}</td>
                      <td className="px-4 py-3 text-slate-700">{row.nbTaf}</td>
                      <td className="px-4 py-3 text-emerald-700">{row.tafRealisees}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{total}</td>
                      <td className="px-4 py-3 text-slate-700">{pct(realise, total) ?? "-"}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
