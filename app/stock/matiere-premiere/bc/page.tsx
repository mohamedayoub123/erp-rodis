import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";

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

type BcGroup = {
  code: string;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  statut: string;
  date_jour: string | null;
  nbArticles: number;
  quantiteTotale: number;
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

  const { rows, error } = await fetchAllCommandesBc();

  const byCode = new Map<string, CommandeBcRow[]>();
  for (const row of rows) {
    const list = byCode.get(row.code) ?? [];
    list.push(row);
    byCode.set(row.code, list);
  }

  const groups: BcGroup[] = [...byCode.entries()]
    .map(([code, groupRows]) => {
      const first = groupRows[0];
      return {
        code,
        n_doss_4d: first.n_doss_4d,
        n_doss_erp: first.n_doss_erp,
        statut: first.statut,
        date_jour: first.date_jour,
        nbArticles: groupRows.length,
        quantiteTotale: groupRows.reduce((sum, row) => sum + Number(row.quantite ?? 0), 0),
      };
    })
    .sort((a, b) => {
      const numA = Number(a.code.replace("BC", ""));
      const numB = Number(b.code.replace("BC", ""));
      return numB - numA;
    });

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
              Bons de commande matiere premiere (BC) - un BC peut regrouper plusieurs articles.
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
          ) : groups.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucune commande pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">BC</th>
                    <th className="px-6 py-4 font-semibold">Nb articles</th>
                    <th className="px-6 py-4 font-semibold">Qte totale</th>
                    <th className="px-6 py-4 font-semibold">Doss. 4D</th>
                    <th className="px-6 py-4 font-semibold">Doss. ERP</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.code} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold">
                        <Link
                          href={`/stock/matiere-premiere/bc/${group.code}`}
                          className="text-sky-700 underline"
                        >
                          {group.code}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{group.nbArticles}</td>
                      <td className="px-6 py-4 text-slate-900">{group.quantiteTotale}</td>
                      <td className="px-6 py-4 text-slate-600">{group.n_doss_4d || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{group.n_doss_erp || "-"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statutBadgeClass(
                            group.statut
                          )}`}
                        >
                          {group.statut}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(group.date_jour)}</td>
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
