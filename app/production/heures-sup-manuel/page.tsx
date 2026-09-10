import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { SelectWithAddOption } from "@/app/_components/select-with-add-option";
import { formatDate } from "@/lib/format-date";
import { createHeureSupManuelAction, deleteHeureSupManuelAction } from "./actions";

type ActiviteRow = { id: number; nom: string };
type EntreeRow = {
  id: number;
  date_jour: string;
  nb_journaliers: number;
  nb_heures: number;
  remarque: string | null;
  heures_sup_activites: ActiviteRow | ActiviteRow[] | null;
};

function firstActivite(value: ActiviteRow | ActiviteRow[] | null): ActiviteRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function estSamedi(dateJour: string): boolean {
  return new Date(`${dateJour}T00:00:00`).getDay() === 6;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { fromIso: from.toISOString().slice(0, 10), toIso: now.toISOString().slice(0, 10) };
}

type SearchParams = Promise<{ date_from?: string; date_to?: string; avertissement?: string }>;

export default async function HeuresSupManuelPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "productionHeuresSupManuel");
  const canDelete = await canDeletePageUser(currentUser, "productionHeuresSupManuel");

  const defaultRange = currentMonthRange();
  const dateFrom = (params.date_from || defaultRange.fromIso).trim();
  const dateTo = (params.date_to || defaultRange.toIso).trim();

  const [{ data: activitesData }, { data: entreesData, error }] = await Promise.all([
    supabaseServer.from("heures_sup_activites").select("id, nom").order("nom", { ascending: true }),
    supabaseServer
      .from("heures_sup_manuel")
      .select("id, date_jour, nb_journaliers, nb_heures, remarque, heures_sup_activites(id, nom)")
      .gte("date_jour", dateFrom)
      .lte("date_jour", dateTo)
      .order("date_jour", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  const activites = (activitesData ?? []) as ActiviteRow[];
  const entrees = ((entreesData ?? []) as unknown as EntreeRow[]).map((row) => {
    const activite = firstActivite(row.heures_sup_activites);
    const samedi = estSamedi(row.date_jour);
    const totalHeures = Number(row.nb_journaliers) * Number(row.nb_heures);
    return {
      id: row.id,
      dateJour: row.date_jour,
      activiteNom: activite?.nom || "-",
      nbJournaliers: Number(row.nb_journaliers),
      nbHeures: Number(row.nb_heures),
      remarque: row.remarque,
      samedi,
      totalHeures,
    };
  });

  const totalHeuresSup = entrees.filter((e) => !e.samedi).reduce((sum, e) => sum + e.totalHeures, 0);
  const totalJourSup = entrees.filter((e) => e.samedi).reduce((sum, e) => sum + e.totalHeures, 0);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-5">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Heures Sup Manuel</h1>
              <p className="mt-2 text-sm text-slate-600">
                Saisie manuelle des heures sup pour une activite hors suivi automatique (Sleevage,
                Impression, Recuperation...). Chaque ligne saisie ici compte directement en heure sup
                (jour sup si la date est un samedi).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {params.avertissement ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm font-medium text-amber-800">
            {params.avertissement}
          </div>
        ) : null}

        {canEdit ? (
          <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-sky-700 marker:content-none">
              + Ajouter une ligne
            </summary>
            <form
              action={createHeureSupManuelAction}
              className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-5"
            >
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Date
                <input
                  type="date"
                  name="date_jour"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Activite
                <SelectWithAddOption
                  name="activite"
                  options={activites.map((a) => a.nom)}
                  addLabel="+ Nouvelle activite"
                  addPlaceholder="Nom de la nouvelle activite"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Nb journaliers
                <input
                  type="number"
                  step="1"
                  min="1"
                  name="nb_journaliers"
                  required
                  placeholder="0"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Nb heures (par personne)
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  name="nb_heures"
                  required
                  placeholder="0"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Remarque (optionnel)
                <input
                  type="text"
                  name="remarque"
                  placeholder="-"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-5">
                <SubmitButton pendingLabel="Ajout..." className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white">
                  Ajouter
                </SubmitButton>
              </div>
            </form>
          </details>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Du
              <input
                type="date"
                name="date_from"
                defaultValue={dateFrom}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Au
              <input
                type="date"
                name="date_to"
                defaultValue={dateTo}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
              />
            </label>
            <div className="flex items-end gap-3">
              <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                Filtrer
              </button>
              <Link
                href="/production/heures-sup-manuel"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            </div>
          </form>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm">
            Heures sup (semaine) :
            <span className="ml-2 font-bold text-amber-900">{totalHeuresSup.toLocaleString("fr-FR")} h</span>
          </div>
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm">
            Jour sup (samedi) :
            <span className="ml-2 font-bold text-red-900">{totalJourSup.toLocaleString("fr-FR")} h</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error.message}</p>
            </div>
          ) : entrees.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucune ligne sur cette periode.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Activite</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Nb personnes</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Heures / personne</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Total heures</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Jour sup</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Remarque</th>
                    {canDelete ? <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {entrees.map((entree) => (
                    <tr key={entree.id} className={`border-t border-slate-100 ${entree.samedi ? "bg-red-50/40" : ""}`}>
                      <td className="px-4 py-3 text-slate-600">{formatDate(entree.dateJour)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{entree.activiteNom}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{entree.nbJournaliers}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{entree.nbHeures}</td>
                      <td className="px-4 py-3 font-semibold text-amber-700">
                        {entree.totalHeures.toLocaleString("fr-FR")} h
                      </td>
                      <td className="px-4 py-3">
                        {entree.samedi ? (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">Oui</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{entree.remarque || "-"}</td>
                      {canDelete ? (
                        <td className="px-4 py-3">
                          <form action={deleteHeureSupManuelAction}>
                            <input type="hidden" name="id" value={entree.id} />
                            <DeleteIconButton label="Supprimer cette ligne" />
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
