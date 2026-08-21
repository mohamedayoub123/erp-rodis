import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { createCompteAction, updateCompteAction } from "./actions";

type CompteRow = { id: number; code: string; libelle: string; classe: number };

async function fetchAllComptes() {
  const rows: CompteRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("comptes_comptables")
      .select("id, code, libelle, classe")
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

export default async function PlanComptablePage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "comptabilite");

  const { rows: comptes, error } = await fetchAllComptes();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
                Comptabilite
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Plan comptable</h1>
              <p className="mt-2 text-sm text-slate-600">
                Structure SYSCOHADA (classe 3 = stocks, 4 = tiers, 6 = charges, 7 = produits).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/comptabilite" label="Retour Comptabilite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canWrite ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Ajouter un compte</h2>
            <form action={createCompteAction} className="mt-4 grid gap-3 sm:grid-cols-4">
              <input
                type="text"
                name="code"
                placeholder="Code (ex: 601000)"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                required
              />
              <input
                type="text"
                name="libelle"
                placeholder="Libelle"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none sm:col-span-2"
                required
              />
              <input
                type="number"
                name="classe"
                placeholder="Classe (1-8)"
                min="1"
                max="8"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                required
              />
              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white"
                >
                  Ajouter
                </SubmitButton>
              </div>
            </form>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="p-6">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error.message}</p>
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Code</th>
                  <th className="px-6 py-4 font-semibold">Libelle</th>
                  <th className="px-6 py-4 font-semibold">Classe</th>
                  {canWrite ? <th className="px-6 py-4 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {comptes.map((compte) => (
                  <tr key={compte.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 font-mono text-slate-900">{compte.code}</td>
                    <td className="px-6 py-4 text-slate-800">{compte.libelle}</td>
                    <td className="px-6 py-4 text-slate-600">{compte.classe}</td>
                    {canWrite ? (
                      <td className="px-6 py-4">
                        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                            Modifier
                          </summary>
                          <form action={updateCompteAction} className="mt-4 grid gap-3">
                            <input type="hidden" name="compte_id" value={compte.id} />
                            <input
                              type="text"
                              name="code"
                              defaultValue={compte.code}
                              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                              required
                            />
                            <input
                              type="text"
                              name="libelle"
                              defaultValue={compte.libelle}
                              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                              required
                            />
                            <input
                              type="number"
                              name="classe"
                              defaultValue={compte.classe}
                              min="1"
                              max="8"
                              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                              required
                            />
                            <div>
                              <SubmitButton
                                pendingLabel="Enregistrement..."
                                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                              >
                                Enregistrer
                              </SubmitButton>
                            </div>
                          </form>
                        </details>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
