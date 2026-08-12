import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { formatDate } from "@/lib/format-date";

type ProgrammeRow = {
  id: number;
  numero_programme: number;
  qt_carton: number;
  qt_vrac: number;
  date_jour: string;
  remarque: string | null;
  statut: string;
  utilisateur: string | null;
};

type GroupeProgramme = {
  numero: number;
  date: string;
  remarque: string | null;
  statut: string;
  utilisateur: string | null;
  qtCartonTotal: number;
  qtVracTotal: number;
};

async function fetchAllProgrammes() {
  const rows: ProgrammeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programmes")
      .select("id, numero_programme, qt_carton, qt_vrac, date_jour, remarque, statut, utilisateur")
      .order("date_jour", { ascending: false })
      .order("numero_programme", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    rows.push(...((data ?? []) as ProgrammeRow[]));

    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

// Regroupe les lignes (une par article) par numero_programme, meme "MB" -
// date/remarque/statut/utilisateur sont identiques sur toutes les lignes
// d'un groupe (ecrites ainsi a la creation), seuls qt carton/vrac
// s'additionnent pour le total du programme.
function regrouperParProgramme(rows: ProgrammeRow[]) {
  const groupes = new Map<number, GroupeProgramme>();
  for (const row of rows) {
    const existant = groupes.get(row.numero_programme);
    if (existant) {
      existant.qtCartonTotal += row.qt_carton;
      existant.qtVracTotal += row.qt_vrac;
      continue;
    }
    groupes.set(row.numero_programme, {
      numero: row.numero_programme,
      date: row.date_jour,
      remarque: row.remarque,
      statut: row.statut,
      utilisateur: row.utilisateur,
      qtCartonTotal: row.qt_carton,
      qtVracTotal: row.qt_vrac,
    });
  }
  return Array.from(groupes.values());
}

export default async function ProgrammePage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "programme");

  const { rows: programmes, error } = await fetchAllProgrammes();
  const groupes = regrouperParProgramme(programmes);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Programme
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Un programme par ligne (MB.2026.1, MB.2026.2...). Clique &quot;Voir&quot; pour le detail :
              articles, machines et quantites.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/production" label="Retour production" />
            {canWrite ? (
              <Link
                href="/production/programme/nouveau"
                className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                Ajouter un programme
              </Link>
            ) : null}
            <RefreshButton />
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : groupes.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              Aucun programme pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Programme</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Remarque</th>
                    <th className="px-6 py-4 font-semibold">Statut</th>
                    <th className="px-6 py-4 font-semibold">Saisi par</th>
                    <th className="px-6 py-4 font-semibold">Qt carton total</th>
                    <th className="px-6 py-4 font-semibold">Qt vrac total</th>
                    <th className="px-6 py-4 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupes.map((groupe) => (
                    <tr key={groupe.numero} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        MB.{groupe.date.slice(0, 4)}.{groupe.numero}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(groupe.date)}</td>
                      <td className="px-6 py-4 text-slate-600">{groupe.remarque || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{groupe.statut}</td>
                      <td className="px-6 py-4 text-slate-600">{groupe.utilisateur || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(groupe.qtCartonTotal)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(groupe.qtVracTotal)}</td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/production/programme/${groupe.numero}`}
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Voir
                        </Link>
                      </td>
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
