import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { getCurrentStockUser, getUserPermissions, isAdminUser, listStockUsers } from "@/lib/stock-auth";
import { formatDateTime } from "@/lib/format-date";

type AuditRow = {
  id: number;
  created_at: string;
  utilisateur: string | null;
  module: string;
  action: "creation" | "modification" | "suppression";
  cible: string | null;
  resume: string;
};

const PAGE_SIZE = 100;
const MODULE_OPTIONS = ["Commandes", "Stock"];

type SearchParams = Promise<{
  utilisateur?: string;
  module?: string;
  action?: string;
  q?: string;
  date_debut?: string;
  date_fin?: string;
  page?: string;
}>;

function actionLabel(action: string) {
  if (action === "suppression") return "Suppression";
  if (action === "creation") return "Creation";
  return "Modification";
}

function ActionBadge({ action }: { action: string }) {
  const className =
    action === "suppression"
      ? "bg-red-100 text-red-800"
      : action === "creation"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-sky-100 text-sky-800";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{actionLabel(action)}</span>
  );
}

export default async function AdminHistoriquePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const currentUser = await getCurrentStockUser();
  // Meme garde-fou que /admin (voir app/admin/page.tsx) : "Gerer utilisateurs"
  // donne aussi acces a ce journal, pas seulement l'admin technique - ce
  // journal revele qui a fait quoi, meme sensibilite que la gestion des
  // comptes.
  const isAdmin = isAdminUser(currentUser);
  const canManageUsers = isAdmin || (await getUserPermissions(currentUser)).manageUsers;

  if (!canManageUsers) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#fbfdff_50%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <section className="rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Acces reserve</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Historique</h1>
            <p className="mt-3 text-sm text-slate-600">
              Seuls les comptes avec le droit &quot;Gerer utilisateurs&quot; peuvent consulter ce journal.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const utilisateurFilter = (params.utilisateur || "").trim();
  const moduleFilter = (params.module || "").trim();
  const actionFilter = (params.action || "").trim();
  const qFilter = (params.q || "").trim();
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const hasFilters = Boolean(
    utilisateurFilter || moduleFilter || actionFilter || qFilter || dateDebutFilter || dateFinFilter
  );
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  let query = supabaseServer
    .from("audit_log")
    .select("id, created_at, utilisateur, module, action, cible, resume", { count: "exact" })
    .order("created_at", { ascending: false });

  if (utilisateurFilter) query = query.eq("utilisateur", utilisateurFilter);
  if (moduleFilter) query = query.eq("module", moduleFilter);
  if (actionFilter) query = query.eq("action", actionFilter);
  if (qFilter) query = query.or(`resume.ilike.%${qFilter}%,cible.ilike.%${qFilter}%`);
  if (dateDebutFilter) query = query.gte("created_at", `${dateDebutFilter}T00:00:00`);
  if (dateFinFilter) query = query.lte("created_at", `${dateFinFilter}T23:59:59`);

  const from = (currentPage - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  // Table pas encore creee (SQL pas encore colle) - message clair plutot
  // qu'un crash generique.
  if (error) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#fbfdff_50%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <section className="rounded-[2rem] border border-amber-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Journal indisponible
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Historique</h1>
            <p className="mt-3 text-sm text-slate-600">
              Le journal n&apos;est pas encore actif (table absente sur Supabase). Erreur : {error.message}
            </p>
          </section>
        </div>
      </main>
    );
  }

  const rows = (data as AuditRow[] | null) ?? [];
  const totalRows = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const usersList = await listStockUsers();

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.utilisateur) qs.set("utilisateur", params.utilisateur);
    if (params.module) qs.set("module", params.module);
    if (params.action) qs.set("action", params.action);
    if (params.q) qs.set("q", params.q);
    if (params.date_debut) qs.set("date_debut", params.date_debut);
    if (params.date_fin) qs.set("date_fin", params.date_fin);
    return `/admin/historique?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#fbfdff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Historique</h1>
              <p className="mt-2 text-sm text-slate-600">
                Qui a cree, modifie ou supprime quoi - commandes et stock, dans l&apos;ordre.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/admin" label="Retour admin" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1.4fr_1fr_1fr_auto_auto]">
            <select
              name="utilisateur"
              defaultValue={params.utilisateur || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Tous les utilisateurs</option>
              {usersList.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.username}
                </option>
              ))}
            </select>
            <select
              name="module"
              defaultValue={params.module || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Tous les modules</option>
              {MODULE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              name="action"
              defaultValue={params.action || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Toutes les actions</option>
              <option value="creation">Creation</option>
              <option value="modification">Modification</option>
              <option value="suppression">Suppression</option>
            </select>
            <input
              type="text"
              name="q"
              placeholder="Recherche (proforma, lot...)"
              defaultValue={params.q || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="date"
              name="date_debut"
              defaultValue={params.date_debut || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="date"
              name="date_fin"
              defaultValue={params.date_fin || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/admin/historique"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucune entree dans le journal pour le moment."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date / heure</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Utilisateur</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Module</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Action</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.utilisateur || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.module}</td>
                      <td className="px-4 py-3">
                        <ActionBadge action={row.action} />
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.resume}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {totalRows > 0 ? (
          <div className="flex items-center justify-between rounded-[1.75rem] border border-black/5 bg-white px-6 py-4 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-slate-500">
              Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows}
            </p>
            <div className="flex gap-3">
              <Link
                href={buildPageHref(Math.max(1, currentPage - 1))}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage === 1 ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-slate-950 text-white"
                }`}
              >
                Precedent
              </Link>
              <Link
                href={buildPageHref(Math.min(totalPages, currentPage + 1))}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage === totalPages
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
