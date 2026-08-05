import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteProgrammeLigneGroupAction, relaunchProgrammeLigneGroupAction } from "../programe-par-ligne/actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";

type ProgrammeLigneRow = {
  id: number;
  groupe_id: number;
  date_jour: string;
  created_at: string;
  programe: string | null;
  cree_par: string | null;
};

async function fetchAllProgrammeLignes(): Promise<ProgrammeLigneRow[]> {
  const rows: ProgrammeLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, groupe_id, date_jour, created_at, programe, cree_par")
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

  const groupsMap = new Map<number, ProgrammeLigneRow[]>();
  for (const ligne of allLignes) {
    const existing = groupsMap.get(ligne.groupe_id);
    if (existing) {
      existing.push(ligne);
    } else {
      groupsMap.set(ligne.groupe_id, [ligne]);
    }
  }

  // Le code PL1.2026, PL2.2026... n'est pas stocke en base - il est
  // recalcule ici selon le rang du groupe PARMI CEUX DE LA MEME ANNEE (le
  // plus ancien de l'annee = PL1.<annee>), remis a 1 a chaque nouvelle
  // annee de date_jour - meme principe que TE1/TS1 dans Mouvements. La
  // colonne "programe" reste un champ libre tape par l'utilisateur,
  // independant de ce code.
  const groupsByAge = [...groupsMap.entries()]
    .map(([groupeId, lignes]) => ({
      groupeId,
      dateJour: lignes[0]?.date_jour,
      createdAt: lignes[0]?.created_at,
      count: lignes.length,
      creePar: lignes[0]?.cree_par ?? null,
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const rankByYear = new Map<number, number>();
  const groups = groupsByAge
    .map((group) => {
      const annee = new Date(group.dateJour).getFullYear();
      const rank = (rankByYear.get(annee) ?? 0) + 1;
      rankByYear.set(annee, rank);
      return { ...group, annee, code: `PL${rank}.${annee}` };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code PL (ex: PL1.2026)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="date"
              name="date"
              defaultValue={params.date || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="cree_par"
              defaultValue={params.cree_par || ""}
              placeholder="Cree par"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
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
                  <span className="text-sm text-slate-500">
                    {formatDate(group.dateJour)} - {group.count} ligne
                    {group.count > 1 ? "s" : ""}
                    {group.creePar ? ` - Cree par ${group.creePar}` : ""}
                  </span>
                </Link>
                <div className="flex items-center gap-2">
                  {canRelaunch ? (
                    <Link
                      href={`/programe-par-ligne?groupe_id=${group.groupeId}`}
                      className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
                    >
                      Charger
                    </Link>
                  ) : null}
                  {canRelaunch ? (
                    <form action={relaunchProgrammeLigneGroupAction}>
                      <input type="hidden" name="groupe_id" value={group.groupeId} />
                      <button
                        type="submit"
                        className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600"
                      >
                        Relancer
                      </button>
                    </form>
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
