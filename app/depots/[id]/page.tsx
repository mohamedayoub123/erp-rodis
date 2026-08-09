import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DepotArticlePicker } from "../depot-article-picker";
import { addDepotStockAction, transferDepotStockAction } from "../actions";

type DepotRow = { id: number; nom: string };
type MouvementRow = { depot_id: number; article_type: string; article_id: number; type: string; quantite: number };

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

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

export default async function DepotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  noStore();
  const { id } = await params;
  const depotId = Number(id);
  if (!depotId) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "depots");

  const [
    { data: depotData },
    { rows: mouvements, error: mouvementsError },
    { rows: autresDepots },
    { rows: articlesMpRows },
    { rows: articlesPfRows },
  ] = await Promise.all([
    supabaseServer.from("depots").select("id, nom").eq("id", depotId).maybeSingle(),
    fetchAll<MouvementRow>("depot_mouvements", "depot_id, article_type, article_id, type, quantite"),
    fetchAll<DepotRow>("depots", "id, nom"),
    fetchAll<{ id: number; nom_article: string }>("articles_matiere_premiere", "id, nom_article"),
    fetchAll<{ id: number; nom_article: string }>("articles", "id, nom_article"),
  ]);

  const depot = depotData as DepotRow | null;
  if (!depot) {
    notFound();
  }

  const articlesMp = articlesMpRows
    .map((a) => ({ id: a.id, label: a.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const articlesPf = articlesPfRows
    .map((a) => ({ id: a.id, label: a.nom_article }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  const nomById = new Map<string, string>([
    ...articlesMpRows.map((a): [string, string] => [`MP::${a.id}`, a.nom_article]),
    ...articlesPfRows.map((a): [string, string] => [`PF::${a.id}`, a.nom_article]),
  ]);

  // Filtre sur CE depot (le fetch ci-dessus ramene toute la table, filtree
  // ici plutot que via .eq() pour reutiliser fetchAll<T> tel quel).
  const mouvementsDuDepot = mouvements.filter((row) => row.depot_id === depotId);

  const soldeParArticle = new Map<string, number>();
  for (const row of mouvementsDuDepot) {
    const key = `${row.article_type}::${row.article_id}`;
    const current = soldeParArticle.get(key) ?? 0;
    soldeParArticle.set(key, current + (row.type === "entree" ? row.quantite : -row.quantite));
  }

  const stockRows = [...soldeParArticle.entries()]
    .map(([key, solde]) => {
      const [articleType, articleIdRaw] = key.split("::");
      return {
        key,
        articleType,
        articleId: Number(articleIdRaw),
        nom: nomById.get(key) ?? `#${articleIdRaw}`,
        solde,
      };
    })
    .filter((row) => Math.abs(row.solde) > 1e-6)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  const autresDepotsOptions = autresDepots.filter((d) => d.id !== depotId);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Depot
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{depot.nom}</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/depots" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <h2 className="border-b border-slate-100 px-6 py-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Stock actuel
          </h2>
          {mouvementsError ? (
            <p className="px-6 py-6 text-sm font-medium text-red-700">{mouvementsError.message}</p>
          ) : stockRows.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-500">Aucun stock dans ce depot pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Quantite</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.nom}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.articleType === "MP" ? "Matiere premiere" : "Produit fini"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatNumber(row.solde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {canEdit ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                Ajouter du stock
              </h2>
              <form action={addDepotStockAction} className="grid gap-4">
                <input type="hidden" name="depot_id" value={depotId} />
                <DepotArticlePicker articlesMp={articlesMp} articlesPf={articlesPf} />
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Quantite
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    name="quantite"
                    required
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Note
                  <input
                    type="text"
                    name="note"
                    placeholder="Optionnel"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                >
                  Ajouter
                </button>
              </form>
            </section>

            <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                Transferer vers un autre depot
              </h2>
              {autresDepotsOptions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Cree au moins un autre depot pour pouvoir y transferer du stock.
                </p>
              ) : (
                <form action={transferDepotStockAction} className="grid gap-4">
                  <input type="hidden" name="depot_id" value={depotId} />
                  <DepotArticlePicker articlesMp={articlesMp} articlesPf={articlesPf} />
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Vers le depot
                    <select
                      name="depot_destination_id"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                    >
                      {autresDepotsOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Quantite
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      name="quantite"
                      required
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Note
                    <input
                      type="text"
                      name="note"
                      placeholder="Optionnel"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Transferer
                  </button>
                </form>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
