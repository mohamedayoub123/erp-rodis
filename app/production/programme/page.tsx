import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { formatDate } from "@/lib/format-date";
import { deleteProgrammeAction } from "./actions";

type ProgrammeRow = {
  id: number;
  article_id: number;
  vrac_article_id: number | null;
  machine_fabrication_id: number | null;
  machine_conditionnement_id: number | null;
  duree_minutes: number | null;
  qt_carton: number;
  qt_vrac: number;
  date_jour: string;
  numero_programme: number | null;
  utilisateur: string | null;
};

async function fetchAllProgrammes() {
  const rows: ProgrammeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programmes")
      .select(
        "id, article_id, vrac_article_id, machine_fabrication_id, machine_conditionnement_id, duree_minutes, qt_carton, qt_vrac, date_jour, numero_programme, utilisateur"
      )
      .order("date_jour", { ascending: false })
      .order("id", { ascending: false })
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

export default async function ProgrammePage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "programme");

  const [{ rows: programmes, error }, { data: articlesData }, { data: machinesData }] = await Promise.all([
    fetchAllProgrammes(),
    supabaseServer.from("articles").select("id, nom_article"),
    supabaseServer.from("machines").select("id, nom"),
  ]);

  const articleById = new Map(((articlesData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article]));
  const machineById = new Map(((machinesData ?? []) as { id: number; nom: string }[]).map((m) => [m.id, m.nom]));

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
              Article, machines et quantites (carton/vrac calcules a partir de la capacite
              machine).
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
          ) : programmes.length === 0 ? (
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
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Vrac</th>
                    <th className="px-6 py-4 font-semibold">Machine Fabrication</th>
                    <th className="px-6 py-4 font-semibold">Machine Conditionnement</th>
                    <th className="px-6 py-4 font-semibold">Qt carton</th>
                    <th className="px-6 py-4 font-semibold">Qt vrac</th>
                    <th className="px-6 py-4 font-semibold">Saisi par</th>
                    {canWrite ? <th className="px-6 py-4 font-semibold"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {programmes.map((programme) => (
                    <tr key={programme.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {programme.numero_programme ? `MB${programme.numero_programme}` : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(programme.date_jour)}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {articleById.get(programme.article_id) || `#${programme.article_id}`}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {programme.vrac_article_id ? articleById.get(programme.vrac_article_id) || "-" : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {programme.machine_fabrication_id ? machineById.get(programme.machine_fabrication_id) || "-" : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {programme.machine_conditionnement_id
                          ? machineById.get(programme.machine_conditionnement_id) || "-"
                          : "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(programme.qt_carton)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(programme.qt_vrac)}</td>
                      <td className="px-6 py-4 text-slate-600">{programme.utilisateur || "-"}</td>
                      {canWrite ? (
                        <td className="px-6 py-4">
                          <form action={deleteProgrammeAction}>
                            <input type="hidden" name="programme_id" value={programme.id} />
                            <button
                              type="submit"
                              className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                            >
                              Supprimer
                            </button>
                          </form>
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
