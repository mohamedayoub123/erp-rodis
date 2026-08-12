import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { createDepotAction, deleteDepotAction } from "./actions";

type DepotRow = { id: number; nom: string };

async function fetchDepots(): Promise<{ rows: DepotRow[]; error: { message: string } | null }> {
  const { data, error } = await supabaseServer.from("depots").select("id, nom").order("nom", { ascending: true });
  if (error) return { rows: [], error };
  return { rows: (data ?? []) as DepotRow[], error: null };
}

// Nombre d'articles distincts par depot - compte directement le champ
// depot_id sur articles/articles_matiere_premiere (le modele courant, voir
// lib/depot-stock.ts), pas un ancien journal de mouvements.
async function fetchArticleCountByDepot(): Promise<Map<number, number>> {
  const map = new Map<number, number>();

  const [{ data: pfData }, { data: mpData }] = await Promise.all([
    supabaseServer.from("articles").select("depot_id").not("depot_id", "is", null),
    supabaseServer.from("articles_matiere_premiere").select("depot_id").not("depot_id", "is", null),
  ]);

  const rows = ((pfData ?? []) as { depot_id: number }[]).concat((mpData ?? []) as { depot_id: number }[]);
  for (const row of rows) {
    map.set(row.depot_id, (map.get(row.depot_id) ?? 0) + 1);
  }

  return map;
}

export default async function DepotsPage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "depots");
  const canDelete = await canDeletePageUser(currentUser, "depots");

  const [{ rows, error }, articleCountByDepot] = await Promise.all([fetchDepots(), fetchArticleCountByDepot()]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Entrepot</h1>
              <p className="mt-2 text-sm text-slate-600">
                Cree autant de depots que necessaire (matiere premiere, produit fini, ou les 2
                melanges), et transfere du stock de l&apos;un vers l&apos;autre.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {canEdit ? (
          <details className="group overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-sky-700 marker:content-none">
              + Nouveau depot
            </summary>
            <form action={createDepotAction} className="flex flex-wrap items-end gap-3 border-t border-slate-100 px-5 py-4">
              <label className="grid min-w-[240px] flex-1 gap-1 text-xs font-semibold text-slate-500">
                Nom du depot
                <input
                  type="text"
                  name="nom"
                  placeholder="Ex: Depot A"
                  required
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <button
                type="submit"
                className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                Creer
              </button>
            </form>
          </details>
        ) : null}

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucun depot pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Nom</th>
                    <th className="px-6 py-4 font-semibold">Articles distincts</th>
                    {canDelete ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((depot) => (
                    <tr key={depot.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <Link href={`/depots/${depot.id}`} className="text-sky-700 underline">
                          {depot.nom}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{articleCountByDepot.get(depot.id) ?? 0}</td>
                      {canDelete ? (
                        <td className="px-6 py-4">
                          <form action={deleteDepotAction}>
                            <input type="hidden" name="depot_id" value={depot.id} />
                            <DeleteIconButton label={`Supprimer ${depot.nom}`} />
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

        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/depots/transfer-order"
            className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-lg font-bold text-slate-900">Transfer Order</span>
            <p className="mt-1 text-sm text-slate-600">
              Demande de transfert entre 2 depots, avec choix automatique des lots.
            </p>
          </Link>
          <Link
            href="/depots/invoice-order"
            className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.12)]"
          >
            <span className="text-lg font-bold text-slate-900">Transfer Invoice</span>
            <p className="mt-1 text-sm text-slate-600">
              Valide un Transfer Order approuve - deplace reellement le stock.
            </p>
          </Link>
        </section>
      </div>
    </main>
  );
}
