import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { COMPTE_STOCK_MP, COMPTE_STOCK_PRODUIT_FINI, COMPTE_EN_COURS_PRODUCTION } from "@/lib/comptabilite";

type CompteRow = { id: number; code: string; libelle: string; classe: number };
type LigneRow = { compte_id: number; debit: number; credit: number };

async function fetchAllComptes(): Promise<CompteRow[]> {
  const rows: CompteRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("comptes_comptables")
      .select("id, code, libelle, classe")
      .order("code", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data as CompteRow[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchAllLignes(): Promise<LigneRow[]> {
  const rows: LigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("ecriture_lignes")
      .select("compte_id, debit, credit")
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data as LigneRow[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function formatMontant(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Classes du plan comptable OHADA (comptes_comptables.classe, 1 chiffre) -
// meme decoupage que le plan importe (voir plan-comptable). "Capitaux"
// (classe 1) est le filtre demande explicitement, les autres sont ajoutes
// au meme cout pour couvrir le meme besoin sur n'importe quelle classe
// plutot que de limiter le filtre a une seule.
const CLASSE_LABELS: Record<number, string> = {
  1: "1 - Capitaux",
  2: "2 - Immobilisations",
  3: "3 - Stocks",
  4: "4 - Tiers",
  5: "5 - Tresorerie",
  6: "6 - Charges",
  7: "7 - Produits",
};

type SearchParams = Promise<{ classe?: string; q?: string }>;

// Balance des comptes : TOUS les comptes en une fois (total debit, total
// credit, solde cumule), au lieu de devoir choisir un compte a la fois
// comme le Grand livre - repond directement a "je veux voir la totalite
// du stock" : le solde du compte Stock MP EST la valeur totale du stock MP
// actuellement en magasin, selon les ecritures deja generees automatiquement
// (Achat/Reception, Fabrication, Entree production). Filtre par classe
// (ex: Capitaux) et/ou recherche code/libelle - sans ca, la liste complete
// (plan comptable OHADA, ~2300 comptes) est ingerable a l'oeil.
export default async function BalancePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const classeFilter = params.classe ? Number(params.classe) : null;
  const qFilter = (params.q || "").trim().toLowerCase();
  const hasFilters = Boolean(classeFilter || qFilter);

  const [comptes, lignes] = await Promise.all([fetchAllComptes(), fetchAllLignes()]);

  const totauxParCompte = new Map<number, { debit: number; credit: number }>();
  for (const ligne of lignes) {
    const current = totauxParCompte.get(ligne.compte_id) ?? { debit: 0, credit: 0 };
    current.debit += Number(ligne.debit ?? 0);
    current.credit += Number(ligne.credit ?? 0);
    totauxParCompte.set(ligne.compte_id, current);
  }

  const rows = comptes.map((compte) => {
    const totaux = totauxParCompte.get(compte.id) ?? { debit: 0, credit: 0 };
    return { ...compte, debit: totaux.debit, credit: totaux.credit, solde: totaux.debit - totaux.credit };
  });

  // Les 3 cartes KPI (Stock MP/PF, En-cours) restent sur la totalite - ce
  // sont des chiffres fixes de l'entreprise, pas lies au filtre applique au
  // tableau en dessous.
  const soldeStockMp = rows.find((r) => r.code === COMPTE_STOCK_MP)?.solde ?? 0;
  const soldeStockPf = rows.find((r) => r.code === COMPTE_STOCK_PRODUIT_FINI)?.solde ?? 0;
  const soldeEnCours = rows.find((r) => r.code === COMPTE_EN_COURS_PRODUCTION)?.solde ?? 0;

  const filteredRows = rows
    .filter((r) => !classeFilter || r.classe === classeFilter)
    .filter((r) => !qFilter || r.code.toLowerCase().includes(qFilter) || r.libelle.toLowerCase().includes(qFilter));

  const totalDebit = filteredRows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = filteredRows.reduce((sum, r) => sum + r.credit, 0);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                Comptabilite
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Balance des comptes</h1>
              <p className="mt-2 text-sm text-slate-600">
                Tous les comptes en une fois, avec le total debit/credit et le solde cumule - le solde
                du compte Stock MP est la valeur totale du stock actuellement en magasin.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Valeur totale du stock MP
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">{formatMontant(soldeStockMp)}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              En-cours de production
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">{formatMontant(soldeEnCours)}</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Valeur totale du stock Produit fini
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">{formatMontant(soldeStockPf)}</p>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <select
              name="classe"
              defaultValue={params.classe || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Toutes les classes</option>
              {Object.entries(CLASSE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="q"
              defaultValue={params.q || ""}
              placeholder="Recherche (code, libelle...)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/comptabilite/balance"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Compte</th>
                  <th className="px-6 py-4 font-semibold">Debit</th>
                  <th className="px-6 py-4 font-semibold">Credit</th>
                  <th className="px-6 py-4 font-semibold">Solde</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-sm text-slate-500">
                      Aucun compte.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-6 py-4">
                        <Link
                          href={`/comptabilite/grand-livre?compte_id=${row.id}`}
                          className="font-semibold text-sky-700 hover:underline"
                        >
                          {row.code} - {row.libelle}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{row.debit > 0 ? formatMontant(row.debit) : "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{row.credit > 0 ? formatMontant(row.credit) : "-"}</td>
                      <td
                        className={`px-6 py-4 font-semibold ${row.solde >= 0 ? "text-slate-900" : "text-red-700"}`}
                      >
                        {formatMontant(row.solde)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td className="px-6 py-4 font-semibold text-slate-900">Total</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{formatMontant(totalDebit)}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{formatMontant(totalCredit)}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {formatMontant(totalDebit - totalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <p className="text-xs text-slate-500">
          Total debit = total credit si toutes les ecritures sont equilibrees (toujours vrai ici, verifie
          a la creation de chaque ecriture) - un ecart signalerait un probleme.
        </p>
      </div>
    </main>
  );
}
