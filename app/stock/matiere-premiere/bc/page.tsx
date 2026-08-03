import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { updateCommandeBcMpAction } from "./actions";
import { STATUT_BC_OPTIONS } from "./constants";

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

async function fetchAllCommandesBc() {
  const rows: CommandeBcRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("bons_commande_matiere_premiere")
      .select("id, code, article_label, quantite, n_doss_4d, n_doss_erp, statut, date_jour")
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as CommandeBcRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function statutBadgeClass(statut: string) {
  switch (statut) {
    case "Stand":
      return "bg-slate-100 text-slate-800";
    case "En cours":
      return "bg-amber-100 text-amber-800";
    case "Termine":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

export default async function CommandeBcMpPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWriteNouvelle = await canWritePageUser(currentUser, "commandeBcMpNouvelle");
  const canEdit = await canWritePageUser(currentUser, "commandeBcMp");

  const { rows: commandes, error } = await fetchAllCommandesBc();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Commande MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Bons de commande matiere premiere (BC) : article, quantite, dossier, statut.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
            {canWriteNouvelle ? (
              <Link
                href="/stock/matiere-premiere/bc/nouvelle"
                className="rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Ajouter commande
              </Link>
            ) : null}
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : commandes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucune commande pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">BC</th>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Qte</th>
                    <th className="px-6 py-4 font-semibold">Doss. 4D</th>
                    <th className="px-6 py-4 font-semibold">Doss. ERP</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    {canEdit ? <th className="px-6 py-4 font-semibold">Modifier</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((commande) => (
                    <tr key={commande.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 font-semibold text-slate-900">{commande.code}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {commande.article_label || "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(commande.quantite)}</td>
                      <td className="px-6 py-4 text-slate-600">{commande.n_doss_4d || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{commande.n_doss_erp || "-"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statutBadgeClass(
                            commande.statut
                          )}`}
                        >
                          {commande.statut}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(commande.date_jour)}</td>
                      {canEdit ? (
                        <td className="px-6 py-4">
                          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                              Modifier
                            </summary>

                            <form action={updateCommandeBcMpAction} className="mt-4 grid w-64 gap-3">
                              <input type="hidden" name="bc_id" value={commande.id} />
                              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                Quantite
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  name="quantite"
                                  defaultValue={commande.quantite ?? ""}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none"
                                />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                Doss. 4D
                                <input
                                  type="text"
                                  name="n_doss_4d"
                                  defaultValue={commande.n_doss_4d || ""}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none"
                                />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                Doss. ERP
                                <input
                                  type="text"
                                  name="n_doss_erp"
                                  defaultValue={commande.n_doss_erp || ""}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none"
                                />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                Statut
                                <select
                                  name="statut"
                                  defaultValue={commande.statut}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none"
                                >
                                  {STATUT_BC_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div>
                                <button
                                  type="submit"
                                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                >
                                  Enregistrer
                                </button>
                              </div>
                            </form>
                          </details>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
