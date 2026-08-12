import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteProgrammeLigneGroupAction } from "../programe-par-ligne/actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { formatDateTime } from "@/lib/format-date";
import { computePlCodesFromRows, fetchPdRefsBySourceGroupeId } from "@/lib/programme-numbering";

type ProgrammeLigneRow = {
  id: number;
  groupe_id: number | null;
  date_jour: string;
  created_at: string;
  programe: string | null;
  cree_par: string | null;
  remarque: string | null;
};

async function fetchAllProgrammeLignes(): Promise<ProgrammeLigneRow[]> {
  const rows: ProgrammeLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, groupe_id, date_jour, created_at, programe, cree_par, remarque")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ProgrammeLigneRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function formatDate(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

const PAGE_SIZE = 200;

type SearchParams = Promise<{ page?: string; code?: string; date?: string; cree_par?: string }>;

export default async function HistoriqueProgrammePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, Number(params.page || "1") || 1);
  const codeFilter = (params.code || "").trim().toLowerCase();
  const dateFilter = (params.date || "").trim();
  const creeParFilter = (params.cree_par || "").trim().toLowerCase();
  const hasFilters = Boolean(codeFilter || dateFilter || creeParFilter);
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "historiqueProgramme");
  const canRelaunch = await canWritePageUser(currentUser, "programeParLigne");

  const allLignes = await fetchAllProgrammeLignes();

  // Meme calcul que la page detail (voir lib/programme-numbering.ts) - avant,
  // chaque page recalculait son propre rang independamment (la liste
  // prenait a tort la ligne la plus RECENTE de chaque groupe comme
  // representative au lieu de la plus ANCIENNE), ce qui pouvait afficher un
  // code PL different entre la liste et le detail pour le meme groupe.
  const plCodeByGroupeId = computePlCodesFromRows(allLignes);
  const pdRefsBySourceGroupeId = await fetchPdRefsBySourceGroupeId();

  // Les lignes sans groupe_id (jamais rattachees a un lot au moment de leur
  // creation) ne doivent jamais etre fusionnees ensemble juste parce
  // qu'elles partagent toutes la valeur JS "null" - chacune devient son
  // propre groupe solo via son propre id (unique, jamais en collision avec
  // un vrai groupe_id puisque ceux-ci sont eux-memes toujours l'id d'une
  // ligne programme_lignes - voir assignDispatcherCodesAndInsert).
  const groupsMap = new Map<number, ProgrammeLigneRow[]>();
  for (const ligne of allLignes) {
    const key = ligne.groupe_id ?? ligne.id;
    const existing = groupsMap.get(key);
    if (existing) {
      existing.push(ligne);
    } else {
      groupsMap.set(key, [ligne]);
    }
  }

  // La colonne "programe" reste un champ libre tape par l'utilisateur,
  // independant du code PL calcule ci-dessus.
  const groups = [...groupsMap.entries()]
    .map(([groupeId, lignes]) => ({
      groupeId,
      dateJour: lignes[0]?.date_jour,
      createdAt: lignes[0]?.created_at,
      count: lignes.length,
      creePar: lignes[0]?.cree_par ?? null,
      remarque: lignes[0]?.remarque ?? null,
      code: plCodeByGroupeId.get(groupeId) ?? `PL-${groupeId}`,
      pdRefs: pdRefsBySourceGroupeId.get(groupeId) ?? [],
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Reutilise les groupes deja calcules (allLignes couvre toute la table)
  // pour construire les listes d'options des menus de recherche, plutot que
  // de refaire des requetes DB dediees.
  const codeOptions = groups.map((group, index) => ({ id: index, label: group.code }));
  const creeParOptions = [
    ...new Set(groups.map((group) => (group.creePar || "").trim()).filter(Boolean)),
  ].map((label, index) => ({ id: index, label }));

  // Le code PLn.annee est calcule sur TOUS les groupes (rang par age dans
  // leur annee), mais on n'affiche/ne rend qu'une page a la fois - avec des
  // milliers de groupes, tout rendre d'un coup fait exploser le temps de
  // rendu et la memoire.
  const filteredGroups = groups.filter((group) => {
    if (codeFilter && !group.code.toLowerCase().includes(codeFilter)) return false;
    if (dateFilter && group.dateJour !== dateFilter) return false;
    if (creeParFilter && !(group.creePar || "").toLowerCase().includes(creeParFilter)) return false;
    return true;
  });

  const totalGroups = filteredGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pagedGroups = filteredGroups.slice(from, from + PAGE_SIZE);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Historique programme
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Tous les programmes enregistres depuis &quot;Programme par ligne&quot;.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="code"
              defaultValue={params.code || ""}
              options={codeOptions}
              placeholder="Code PL (ex: PL1.2026)"
            />
            <input
              type="date"
              name="date"
              defaultValue={params.date || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <SearchableFilterInput
              name="cree_par"
              defaultValue={params.cree_par || ""}
              options={creeParOptions}
              placeholder="Cree par"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/historique-programme"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <section className="space-y-3">
          {groups.length === 0 ? (
            <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              Aucun programme enregistre pour le moment.
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              Aucun resultat pour ce filtre.
            </div>
          ) : (
            pagedGroups.map((group) => (
              <div
                key={group.groupeId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-black/5 bg-white px-6 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.1)]"
              >
                <Link
                  href={`/historique-programme/${group.groupeId}`}
                  className="flex flex-1 flex-wrap items-center justify-between gap-3"
                >
                  <span className="text-lg font-bold text-slate-900">{group.code}</span>
                  {group.remarque ? (
                    <span className="text-center text-base font-semibold text-sky-700">
                      {group.remarque}
                    </span>
                  ) : null}
                  <span className="text-sm text-slate-500">
                    {formatDate(group.dateJour)} - {group.count} ligne
                    {group.count > 1 ? "s" : ""}
                    {group.creePar ? ` - Cree par ${group.creePar}` : ""}
                    {group.creePar ? ` (${formatDateTime(group.createdAt)})` : ""}
                  </span>
                </Link>
                <div className="flex items-center gap-2">
                  {group.pdRefs.length > 0 ? (
                    <span className="flex flex-wrap items-center gap-1">
                      {group.pdRefs.map((ref) => (
                        <Link
                          key={ref.groupeId}
                          href={`/historique-programme-dispatcher/${ref.groupeId}`}
                          className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                        >
                          {ref.code}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Pas encore dispatche</span>
                  )}
                  {canRelaunch ? (
                    <Link
                      href={`/programe-par-ligne?groupe_id=${group.groupeId}`}
                      className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
                    >
                      Charger
                    </Link>
                  ) : null}
                  {canDelete ? (
                    <form action={deleteProgrammeLigneGroupAction}>
                      <input type="hidden" name="groupe_id" value={group.groupeId} />
                      <DeleteIconButton />
                    </form>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </section>

        {totalGroups > 0 ? (
          <div className="flex items-center justify-between rounded-[1.75rem] border border-black/5 bg-white px-6 py-4 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-slate-500">
              Programmes {from + 1} a {Math.min(from + PAGE_SIZE, totalGroups)} sur {totalGroups}
            </p>

            <div className="flex gap-3">
              <Link
                href={`/historique-programme?page=${Math.max(1, currentPage - 1)}&code=${encodeURIComponent(params.code || "")}&date=${encodeURIComponent(params.date || "")}&cree_par=${encodeURIComponent(params.cree_par || "")}`}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage === 1
                    ? "pointer-events-none bg-slate-100 text-slate-400"
                    : "bg-slate-950 text-white"
                }`}
              >
                Precedent
              </Link>
              <Link
                href={`/historique-programme?page=${Math.min(totalPages, currentPage + 1)}&code=${encodeURIComponent(params.code || "")}&date=${encodeURIComponent(params.date || "")}&cree_par=${encodeURIComponent(params.cree_par || "")}`}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage >= totalPages
                    ? "pointer-events-none bg-slate-100 text-slate-400"
                    : "bg-slate-950 text-white"
                }`}
              >
                Suivant
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
