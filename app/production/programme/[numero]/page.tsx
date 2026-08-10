import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { ProgrammeFormulaire } from "../programme-formulaire";
import {
  addLignesProgrammeAction,
  copyProgrammeAction,
  deleteProgrammeAction,
  dispatchProgrammeAction,
  updateProgrammeGroupeAction,
  updateProgrammeLigneAction,
} from "../actions";
import { STATUT_PROGRAMME_OPTIONS } from "../constants";

type ProgrammeRow = {
  id: number;
  article_id: number;
  vrac_article_id: number | null;
  machine_fabrication_id: number | null;
  machine_conditionnement_id: number | null;
  duree_minutes: number | null;
  qt_carton: number;
  qt_vrac: number;
  plateforme: string | null;
  date_jour: string;
  remarque: string | null;
  statut: string;
  utilisateur: string | null;
};

type ArticleRow = {
  id: number;
  nom_article: string;
  vrac_article_id: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
};

type MachineRow = { id: number; nom: string; type: string | null; zone: string | null };

type MachineProduitRow = {
  machine_id: number;
  article_id: number;
  capacite: number | null;
  capacite_min: number | null;
  capacite_max: number | null;
  temps_minutes: number | null;
};

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer.from(table).select(select).range(from, from + pageSize - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  noStore();
  const { numero } = await params;
  const numeroProgramme = Number(numero);
  if (!numeroProgramme) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "programme");

  const [
    { data: lignesData, error },
    { rows: articles, error: articlesError },
    { rows: machines, error: machinesError },
    { rows: machineProduits, error: machineProduitsError },
  ] = await Promise.all([
    supabaseServer
      .from("programmes")
      .select(
        "id, article_id, vrac_article_id, machine_fabrication_id, machine_conditionnement_id, duree_minutes, qt_carton, qt_vrac, plateforme, date_jour, remarque, statut, utilisateur"
      )
      .eq("numero_programme", numeroProgramme)
      .order("id", { ascending: true }),
    fetchAll<ArticleRow>("articles", "id, nom_article, vrac_article_id, contenance, piece_par_carton"),
    fetchAll<MachineRow>("machines", "id, nom, type, zone"),
    fetchAll<MachineProduitRow>("machine_produits", "machine_id, article_id, capacite, capacite_min, capacite_max, temps_minutes"),
  ]);

  const lignes = (lignesData ?? []) as ProgrammeRow[];
  if (!error && lignes.length === 0) {
    notFound();
  }

  const ajoutError = articlesError || machinesError || machineProduitsError;

  const articleById = new Map(articles.map((article) => [article.id, article]));
  const machineNomById = new Map(machines.map((m) => [m.id, m.nom]));

  const articleOptions = articles
    .filter((article) => article.vrac_article_id === null || article.vrac_article_id !== article.id)
    .map((article) => ({
      id: article.id,
      label: article.nom_article,
      vracArticleId: article.vrac_article_id,
      vracLabel: article.vrac_article_id ? articleById.get(article.vrac_article_id)?.nom_article ?? null : null,
      contenance: article.contenance,
      piecePartCarton: article.piece_par_carton,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  const machinesFabrication = machines
    .filter((machine) => machine.type === "Fabrication")
    .map((machine) => ({ id: machine.id, label: `${machine.nom} (${machine.zone || "sans zone"})` }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const machinesConditionnement = machines
    .filter((machine) => machine.type === "Conditionnement")
    .map((machine) => ({ id: machine.id, label: `${machine.nom} (${machine.zone || "sans zone"})` }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  const capaciteParMachineArticle: Record<
    string,
    { capacite: number | null; capaciteMin: number | null; capaciteMax: number | null; tempsMinutes: number | null }
  > = {};
  for (const row of machineProduits) {
    capaciteParMachineArticle[`${row.machine_id}-${row.article_id}`] = {
      capacite: row.capacite,
      capaciteMin: row.capacite_min,
      capaciteMax: row.capacite_max,
      tempsMinutes: row.temps_minutes,
    };
  }

  const premiere = lignes[0] ?? null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Programme
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              MB.{(premiere?.date_jour ?? "").slice(0, 4) || "----"}.{numeroProgramme}
            </h1>
            {premiere ? (
              <p className="mt-1 text-sm text-slate-600">{formatDate(premiere.date_jour)}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/production/programme" label="Retour" />
            <Link
              href={`/production/programme/${numeroProgramme}/stock`}
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              Verifier stock
            </Link>
            <Link
              href={`/production/programme/${numeroProgramme}/dispatch`}
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              Voir dispatch
            </Link>
            {canWrite ? (
              <form action={copyProgrammeAction}>
                <input type="hidden" name="numero_programme" value={numeroProgramme} />
                <button
                  type="submit"
                  className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  Copier ce programme
                </button>
              </form>
            ) : null}
            {canWrite ? (
              <form action={dispatchProgrammeAction}>
                <input type="hidden" name="numero_programme" value={numeroProgramme} />
                <button
                  type="submit"
                  className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Dispatch
                </button>
              </form>
            ) : null}
            <RefreshButton />
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error.message}
          </p>
        ) : (
          <>
            <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                Remarque et statut
              </h2>
              <form action={updateProgrammeGroupeAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="numero_programme" value={numeroProgramme} />
                <label className="grid min-w-[240px] flex-1 gap-1 text-xs font-semibold text-slate-500">
                  Remarque
                  <input
                    type="text"
                    name="remarque"
                    defaultValue={premiere?.remarque ?? ""}
                    placeholder="Optionnel"
                    disabled={!canWrite}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none disabled:bg-slate-50"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Statut
                  <select
                    name="statut"
                    defaultValue={premiere?.statut ?? STATUT_PROGRAMME_OPTIONS[0]}
                    disabled={!canWrite}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none disabled:bg-slate-50"
                  >
                    {STATUT_PROGRAMME_OPTIONS.map((statut) => (
                      <option key={statut} value={statut}>
                        {statut}
                      </option>
                    ))}
                  </select>
                </label>
                {canWrite ? (
                  <button
                    type="submit"
                    className="rounded-full bg-slate-900 px-5 py-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    Enregistrer
                  </button>
                ) : null}
              </form>
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Article</th>
                      <th className="px-6 py-4 font-semibold">Vrac</th>
                      <th className="px-6 py-4 font-semibold">Machine Fabrication</th>
                      <th className="px-6 py-4 font-semibold">Machine Conditionnement</th>
                      <th className="px-6 py-4 font-semibold">Duree (min)</th>
                      <th className="px-6 py-4 font-semibold">Plateforme</th>
                      <th className="px-6 py-4 font-semibold">Qt carton</th>
                      <th className="px-6 py-4 font-semibold">Qt vrac</th>
                      <th className="px-6 py-4 font-semibold"></th>
                      <th className="px-6 py-4 font-semibold">Saisi par</th>
                      {canWrite ? <th className="px-6 py-4 font-semibold"></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((ligne) => (
                      <tr key={ligne.id} className="border-t border-slate-100 align-top">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {articleById.get(ligne.article_id)?.nom_article || `#${ligne.article_id}`}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {ligne.vrac_article_id ? articleById.get(ligne.vrac_article_id)?.nom_article || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {ligne.machine_fabrication_id ? machineNomById.get(ligne.machine_fabrication_id) || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {ligne.machine_conditionnement_id
                            ? machineNomById.get(ligne.machine_conditionnement_id) || "-"
                            : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{ligne.duree_minutes ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {ligne.plateforme === "A" ? "Auto" : "Manuel"}
                        </td>
                        {canWrite ? (
                          <>
                            <td className="px-6 py-4">
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                name="qt_carton"
                                form={`ligne-${ligne.id}`}
                                defaultValue={ligne.qt_carton}
                                className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                name="qt_vrac"
                                form={`ligne-${ligne.id}`}
                                defaultValue={ligne.qt_vrac}
                                className="w-28 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <form id={`ligne-${ligne.id}`} action={updateProgrammeLigneAction}>
                                <input type="hidden" name="programme_id" value={ligne.id} />
                                <input type="hidden" name="numero_programme" value={numeroProgramme} />
                                <button
                                  type="submit"
                                  className="whitespace-nowrap rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                                >
                                  Enregistrer
                                </button>
                              </form>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4 text-slate-600">{formatNumber(ligne.qt_carton)}</td>
                            <td className="px-6 py-4 text-slate-600">{formatNumber(ligne.qt_vrac)}</td>
                            <td className="px-6 py-4"></td>
                          </>
                        )}
                        <td className="px-6 py-4 text-slate-600">{ligne.utilisateur || "-"}</td>
                        {canWrite ? (
                          <td className="px-6 py-4">
                            <form action={deleteProgrammeAction}>
                              <input type="hidden" name="programme_id" value={ligne.id} />
                              <input type="hidden" name="numero_programme" value={numeroProgramme} />
                              <button
                                type="submit"
                                className="whitespace-nowrap rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
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
            </section>

            {canWrite ? (
              <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                  Ajouter des articles a ce programme
                </h2>
                {ajoutError ? (
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {ajoutError.message}
                  </p>
                ) : (
                  <form action={addLignesProgrammeAction} className="grid gap-6">
                    <input type="hidden" name="numero_programme" value={numeroProgramme} />
                    <ProgrammeFormulaire
                      articles={articleOptions}
                      machinesFabrication={machinesFabrication}
                      machinesConditionnement={machinesConditionnement}
                      capaciteParMachineArticle={capaciteParMachineArticle}
                    />
                    <div>
                      <button
                        type="submit"
                        className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                      >
                        Ajouter au programme
                      </button>
                    </div>
                  </form>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
