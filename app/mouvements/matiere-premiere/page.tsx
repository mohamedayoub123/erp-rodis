import Link from "next/link";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { deleteMouvementMpGroupAction } from "./actions";
import {
  buildEntreeMpRows,
  buildSortieMpRows,
  fetchWebMouvementMpSourceRows,
  formatMouvementMpDate,
  mouvementMpSourceLabel,
  type MouvementMpGroup,
} from "./shared";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";

export default async function MouvementsMatierePremierePage() {
  const currentStockUser = await getCurrentStockUser();
  const canDeleteStock = await canDeletePageUser(currentStockUser, "mouvementsMatierePremiere");
  const sourceRows = await fetchWebMouvementMpSourceRows();
  const entreeGroups = buildEntreeMpRows(sourceRows);
  const sortieGroups = buildSortieMpRows(sourceRows);
  const groups: MouvementMpGroup[] = [...entreeGroups, ...sortieGroups].sort((a, b) => {
    const dateA = a.date_jour ? new Date(a.date_jour).getTime() : 0;
    const dateB = b.date_jour ? new Date(b.date_jour).getTime() : 0;

    if (dateB !== dateA) return dateB - dateA;
    return b.groupe_id - a.groupe_id;
  });

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
                Mouvements Matiere Premiere
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                TE = entree, TS = sortie. Clique sur un code pour voir le detail.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BackButton href="/stock/matiere-premiere" label="Retour gestion stock MP" />
              <RefreshButton />
              <Link
                href="/mouvements/matiere-premiere/entree"
                className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white"
              >
                Entrer
              </Link>
              <Link
                href="/mouvements/matiere-premiere/sortie"
                className="rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white"
              >
                Sortie
              </Link>
              <Link
                href="/mouvements/matiere-premiere/sortie-admin"
                className="rounded-full bg-red-700 px-5 py-2 text-sm font-semibold text-white"
              >
                Sortie admin
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
            Nombre de TE :
            <span className="ml-2 font-bold text-emerald-900">{entreeGroups.length}</span>
          </div>
          <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm">
            Nombre de TS :
            <span className="ml-2 font-bold text-sky-900">{sortieGroups.length}</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {groups.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Aucun mouvement enregistre.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Nb articles</th>
                    <th className="px-4 py-3 font-semibold">Quantite totale</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 font-semibold">Doss. 4D</th>
                    <th className="px-4 py-3 font-semibold">Doss. ERP</th>
                    <th className="px-4 py-3 font-semibold">Saisi par</th>
                    {canDeleteStock ? <th className="px-4 py-3 font-semibold">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const first = group.lignes[0];

                    return (
                    <tr key={`${group.mouvement_type}-${group.groupe_id}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold">
                        <Link
                          href={
                            group.mouvement_type === "entree"
                              ? `/mouvements/matiere-premiere/entrees/${group.groupe_id}`
                              : `/mouvements/matiere-premiere/sorties/${group.groupe_id}`
                          }
                          className="text-sky-700 underline"
                        >
                          {group.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatMouvementMpDate(group.date_jour)}</td>
                      <td className="px-4 py-3 text-slate-600">{group.lignes.length}</td>
                      <td className="px-4 py-3 text-slate-900">{group.quantite_totale}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {mouvementMpSourceLabel(first?.source_import ?? null)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{first?.n_doss_4d || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{first?.n_doss_erp || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{first?.utilisateur || "-"}</td>
                      {canDeleteStock ? (
                        <td className="px-4 py-3">
                          <form action={deleteMouvementMpGroupAction}>
                            <input type="hidden" name="groupe_id" value={group.groupe_id} />
                            <DeleteIconButton />
                          </form>
                        </td>
                      ) : null}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
