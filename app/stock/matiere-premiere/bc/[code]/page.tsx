import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { updateCommandeBcGroupAction, updateCommandeBcLigneAction } from "../actions";
import { STATUT_BC_OPTIONS } from "../constants";

type CommandeBcRow = {
  id: number;
  code: string;
  article_label: string | null;
  quantite: number | null;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  statut: string;
  date_jour: string | null;
};

async function fetchGroup(code: string) {
  const { data, error } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id, code, article_label, quantite, n_doss_4d, n_doss_erp, statut, date_jour")
    .eq("code", code)
    .order("id", { ascending: true });

  if (error) return { rows: [] as CommandeBcRow[], error };

  return { rows: (data ?? []) as CommandeBcRow[], error: null };
}

export default async function CommandeBcMpDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  noStore();
  const { code } = await params;
  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "commandeBcMp");

  const { rows, error } = await fetchGroup(code);

  if (!error && rows.length === 0) {
    notFound();
  }

  const first = rows[0];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{code}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {rows.length} article(s) - {formatDate(first?.date_jour ?? null)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/bc" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error.message}
            </p>
          </section>
        ) : (
          <>
            {canEdit ? (
              <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <h2 className="mb-3 text-lg font-bold text-slate-900">Dossier / Statut</h2>
                <form action={updateCommandeBcGroupAction} className="grid gap-4 md:grid-cols-4">
                  <input type="hidden" name="code" value={code} />
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Doss. 4D
                    <input
                      type="text"
                      name="n_doss_4d"
                      defaultValue={first?.n_doss_4d || ""}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Doss. ERP
                    <input
                      type="text"
                      name="n_doss_erp"
                      defaultValue={first?.n_doss_erp || ""}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Statut
                    <select
                      name="statut"
                      defaultValue={first?.statut}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                    >
                      {STATUT_BC_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Enregistrer
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Article</th>
                      <th className="px-4 py-3 font-semibold">Quantite</th>
                      {canEdit ? <th className="px-4 py-3 font-semibold">Modifier</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {row.article_label || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-900">{row.quantite ?? "-"}</td>
                        {canEdit ? (
                          <td className="px-4 py-3">
                            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                                Modifier
                              </summary>
                              <form
                                action={updateCommandeBcLigneAction}
                                className="mt-2 grid w-56 gap-2"
                              >
                                <input type="hidden" name="bc_id" value={row.id} />
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Article
                                  <input
                                    type="text"
                                    name="article"
                                    defaultValue={row.article_label || ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                    required
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-slate-500">
                                  Quantite
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    name="quantite"
                                    defaultValue={row.quantite ?? ""}
                                    className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
                                    required
                                  />
                                </label>
                                <button
                                  type="submit"
                                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Enregistrer
                                </button>
                              </form>
                            </details>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
