import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { deleteProgrammeDispatcherHistoryGroupAction } from "./actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { matchesArticleSearch } from "@/lib/article-search";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

type HistoryRow = {
  id: number;
  groupe_id: number | null;
  zone: string;
  chaine: string | null;
  produit: string | null;
  code: string | null;
  date_jour: string;
  created_at: string;
  cree_par: string | null;
};

async function fetchAllHistoryRows(): Promise<HistoryRow[]> {
  const rows: HistoryRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("id, groupe_id, zone, chaine, produit, code, date_jour, created_at, cree_par")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as HistoryRow[];
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

type SearchParams = Promise<{ code?: string; produit?: string; pd?: string; cree_par?: string }>;

export default async function HistoriqueProgrammeDispatcherPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "historiqueProgrammeDispatcher");
  const codeFilter = (params.code || "").trim().toLowerCase();
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const pdFilter = (params.pd || "").trim().toLowerCase();
  const creeParFilter = (params.cree_par || "").trim().toLowerCase();

  const allRows = await fetchAllHistoryRows();
  const produitOptions = [...new Set(allRows.map((r) => r.produit).filter((p): p is string => !!p))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, index) => ({ id: index, label }));

  const groupsMap = new Map<number, HistoryRow[]>();
  for (const row of allRows) {
    if (row.groupe_id === null) continue;
    const existing = groupsMap.get(row.groupe_id);
    if (existing) {
      existing.push(row);
    } else {
      groupsMap.set(row.groupe_id, [row]);
    }
  }

  const groupsByAge = [...groupsMap.entries()]
    .map(([groupeId, rows]) => ({
      groupeId,
      zone: rows[0]?.zone,
      dateJour: rows[0]?.date_jour,
      createdAt: rows[0]?.created_at,
      count: rows.length,
      creePar: rows[0]?.cree_par ?? null,
      rows,
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const allGroups = groupsByAge.map((group, index) => ({ ...group, code: `PD${index + 1}` }));

  const groups = allGroups
    .filter((group) => {
      if (pdFilter && !group.code.toLowerCase().includes(pdFilter)) return false;
      if (codeFilter && !group.rows.some((row) => (row.code || "").toLowerCase().includes(codeFilter))) {
        return false;
      }
      if (produitFilter && !group.rows.some((row) => matchesArticleSearch(row.produit, produitFilter))) {
        return false;
      }
      if (creeParFilter && !(group.creePar || "").toLowerCase().includes(creeParFilter)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const hasFilters = Boolean(codeFilter || produitFilter || pdFilter || creeParFilter);

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
                Historique Programme Dispatcher
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Tous les enregistrements pris depuis les pages &quot;Programme Dispatcher&quot;.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
            <input
              type="text"
              name="pd"
              defaultValue={params.pd || ""}
              placeholder="N programme (PD1, PD2...)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <SearchableFilterInput
              name="produit"
              defaultValue={params.produit || ""}
              options={produitOptions}
              placeholder="Produit"
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
                href="/historique-programme-dispatcher"
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
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun enregistrement pour le moment."}
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.groupeId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-black/5 bg-white px-6 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.1)]"
              >
                <Link
                  href={`/historique-programme-dispatcher/${group.groupeId}`}
                  className="flex flex-1 flex-wrap items-center justify-between gap-3"
                >
                  <span className="text-lg font-bold text-slate-900">{group.code}</span>
                  <span className="text-sm text-slate-500">
                    {formatDate(group.dateJour)} - {group.count} ligne
                    {group.count > 1 ? "s" : ""}
                    {group.creePar ? ` - Cree par ${group.creePar}` : ""}
                  </span>
                </Link>
                {canDelete ? (
                  <form action={deleteProgrammeDispatcherHistoryGroupAction}>
                    <input type="hidden" name="groupe_id" value={group.groupeId} />
                    <DeleteIconButton />
                  </form>
                ) : null}
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
