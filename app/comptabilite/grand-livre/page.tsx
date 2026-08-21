import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

type CompteRow = { id: number; code: string; libelle: string };

type LigneRow = {
  debit: number;
  credit: number;
  ecritures_comptables: { date_ecriture: string; libelle: string; piece_reference: string | null } | { date_ecriture: string; libelle: string; piece_reference: string | null }[] | null;
};

type SearchParams = Promise<{ compte_id?: string }>;

async function fetchAllComptes() {
  const rows: CompteRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("comptes_comptables")
      .select("id, code, libelle")
      .order("code", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };
    const chunk = (data ?? []) as CompteRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

async function fetchLignesForCompte(compteId: number) {
  const rows: LigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("ecriture_lignes")
      .select("debit, credit, ecritures_comptables(date_ecriture, libelle, piece_reference)")
      .eq("compte_id", compteId)
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };
    const chunk = (data ?? []) as unknown as LigneRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export default async function GrandLivrePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const compteId = Number(params.compte_id || "0") || null;

  const { rows: comptes, error: comptesError } = await fetchAllComptes();

  let lignes: LigneRow[] = [];
  let lignesError: { message: string } | null = null;
  if (compteId) {
    const result = await fetchLignesForCompte(compteId);
    lignes = result.rows;
    lignesError = result.error;
  }

  function ecritureInfo(ligne: LigneRow) {
    const e = Array.isArray(ligne.ecritures_comptables) ? ligne.ecritures_comptables[0] : ligne.ecritures_comptables;
    return e ?? { date_ecriture: "-", libelle: "-", piece_reference: null };
  }

  const lignesTriees = [...lignes].sort((a, b) =>
    ecritureInfo(a).date_ecriture.localeCompare(ecritureInfo(b).date_ecriture)
  );

  const lignesAvecSolde = lignesTriees.reduce<{ ligne: LigneRow; solde: number }[]>((acc, ligne) => {
    const soldePrecedent = acc.length > 0 ? acc[acc.length - 1].solde : 0;
    acc.push({ ligne, solde: soldePrecedent + ligne.debit - ligne.credit });
    return acc;
  }, []);

  const compteChoisi = comptes.find((c) => c.id === compteId);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                Comptabilite
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Ecriture comptable</h1>
              <p className="mt-2 text-sm text-slate-600">
                Choisis un compte pour voir toutes ses lignes et le solde cumule.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {comptesError ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {comptesError.message}
            </p>
          ) : (
            <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <select
                name="compte_id"
                defaultValue={compteId ?? ""}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                required
              >
                <option value="">Choisir un compte...</option>
                {comptes.map((compte) => (
                  <option key={compte.id} value={compte.id}>
                    {compte.code} - {compte.libelle}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                Voir
              </button>
            </form>
          )}
        </section>

        {compteId ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-bold text-slate-900">
                {compteChoisi ? `${compteChoisi.code} - ${compteChoisi.libelle}` : "Compte"}
              </h2>
            </div>
            {lignesError ? (
              <div className="p-6">
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {lignesError.message}
                </p>
              </div>
            ) : lignesAvecSolde.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Aucune ligne pour ce compte.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Libelle</th>
                      <th className="px-6 py-4 font-semibold">Piece</th>
                      <th className="px-6 py-4 font-semibold">Debit</th>
                      <th className="px-6 py-4 font-semibold">Credit</th>
                      <th className="px-6 py-4 font-semibold">Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesAvecSolde.map(({ ligne, solde: soldeLigne }, index) => {
                      const info = ecritureInfo(ligne);
                      return (
                        <tr key={index} className="border-t border-slate-100">
                          <td className="px-6 py-4 text-slate-600">{info.date_ecriture}</td>
                          <td className="px-6 py-4 text-slate-800">{info.libelle}</td>
                          <td className="px-6 py-4 text-slate-600">{info.piece_reference || "-"}</td>
                          <td className="px-6 py-4 text-slate-600">
                            {ligne.debit > 0 ? ligne.debit.toLocaleString("fr-FR") : "-"}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {ligne.credit > 0 ? ligne.credit.toLocaleString("fr-FR") : "-"}
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            {soldeLigne.toLocaleString("fr-FR")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
