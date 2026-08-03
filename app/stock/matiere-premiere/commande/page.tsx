import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { updateCommandeMpAction } from "./actions";
import { STATUT_OPTIONS } from "./constants";

type CommandeRow = {
  id: number;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  date_commande: string | null;
  fournisseur: string | null;
  statut: string;
};

async function fetchAllCommandes() {
  const rows: CommandeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("commandes_matiere_premiere")
      .select("id, n_doss_4d, n_doss_erp, date_commande, fournisseur, statut")
      .order("date_commande", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as CommandeRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function statutBadgeClass(statut: string) {
  switch (statut) {
    case "Commande":
      return "bg-slate-100 text-slate-800";
    case "Commande approuvee":
      return "bg-sky-100 text-sky-800";
    case "En cours de livraison":
      return "bg-amber-100 text-amber-800";
    case "Arrive port":
      return "bg-violet-100 text-violet-800";
    case "Arrive usine":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

export default async function CommandeMpPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWriteNouvelle = await canWritePageUser(currentUser, "commandeMpNouvelle");
  const canEdit = await canWritePageUser(currentUser, "commandeMp");

  const { rows: commandes, error } = await fetchAllCommandes();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Import MP
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Suivi des commandes matiere premiere : dossier, fournisseur, statut de livraison.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
            <RefreshButton />
            {canWriteNouvelle ? (
              <Link
                href="/stock/matiere-premiere/commande/nouvelle"
                className="rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Ajouter import
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
                    <th className="px-6 py-4 font-semibold">Doss. 4D</th>
                    <th className="px-6 py-4 font-semibold">Doss. ERP</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Fournisseur</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    {canEdit ? <th className="px-6 py-4 font-semibold">Modifier</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((commande) => (
                    <tr key={commande.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 text-slate-600">{commande.n_doss_4d || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{commande.n_doss_erp || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(commande.date_commande)}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {commande.fournisseur || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statutBadgeClass(
                            commande.statut
                          )}`}
                        >
                          {commande.statut}
                        </span>
                      </td>
                      {canEdit ? (
                        <td className="px-6 py-4">
                          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                              Modifier
                            </summary>

                            <form action={updateCommandeMpAction} className="mt-4 grid w-64 gap-3">
                              <input type="hidden" name="commande_id" value={commande.id} />
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
                                Date
                                <input
                                  type="date"
                                  name="date_commande"
                                  defaultValue={commande.date_commande || ""}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none"
                                />
                              </label>
                              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                                Fournisseur
                                <input
                                  type="text"
                                  name="fournisseur"
                                  defaultValue={commande.fournisseur || ""}
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
                                  {STATUT_OPTIONS.map((option) => (
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
