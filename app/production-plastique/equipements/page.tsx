import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { SQL_EQUIPEMENTS_PLASTIQUE, fetchEquipementsPlastique } from "@/lib/equipements-plastique";
import { CATEGORIE_PLASTIQUE } from "../shared";
import {
  createEquipementPlastiqueAction,
  deleteEquipementPlastiqueAction,
  renameEquipementPlastiqueAction,
} from "./actions";

// Nombre d'articles de E3 qui ont chaque machine (colonne "Machine en cours")
async function compterArticlesParMachine(): Promise<Map<string, number>> {
  const compte = new Map<string, number>();
  const { data } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("machine_plastique")
    .eq("categorie", CATEGORIE_PLASTIQUE)
    .not("machine_plastique", "is", null);
  for (const ligne of (data ?? []) as { machine_plastique: string | null }[]) {
    const nom = (ligne.machine_plastique ?? "").trim();
    if (nom) compte.set(nom, (compte.get(nom) ?? 0) + 1);
  }
  return compte;
}

export default async function EquipementsPlastiquePage() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "productionPlastiqueEquipements");
  const canDelete = await canDeletePageUser(currentUser, "productionPlastiqueEquipements");

  const [{ pret, equipements }, articlesParMachine] = await Promise.all([
    fetchEquipementsPlastique(),
    compterArticlesParMachine(),
  ]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Production Plastique</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Equipements</h1>
              <p className="mt-2 text-sm text-slate-600">
                Machines de la production plastique. Cette liste est a part de celle de la production cosmetique : c&apos;est
                elle qui est proposee dans la colonne Machine en cours de Statistique Article Plastique (E3).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {!pret ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Les equipements ne sont pas encore actifs : lance d&apos;abord le script SQL{" "}
            {SQL_EQUIPEMENTS_PLASTIQUE.replace("scripts/sql/", "")} dans Supabase (SQL Editor).
          </p>
        ) : (
          <>
            {canEdit ? (
              <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <form action={createEquipementPlastiqueAction} className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1 text-xs font-semibold text-slate-500">
                    Nouvel equipement
                    <input
                      type="text"
                      name="nom"
                      required
                      maxLength={100}
                      placeholder="Nom de la machine"
                      className="w-72 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                    />
                  </label>
                  <SubmitButton
                    pendingLabel="Ajout..."
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Ajouter
                  </SubmitButton>
                </form>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              {equipements.length === 0 ? (
                <p className="px-6 py-8 text-sm text-slate-500">Aucun equipement pour le moment.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Equipement</th>
                        <th className="px-6 py-4 font-semibold">Articles dans E3</th>
                        {canDelete ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {equipements.map((equipement) => (
                        <tr key={equipement.id} className="border-t border-slate-100">
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {canEdit ? (
                              // key : le champ se remet a jour apres OK
                              <form
                                key={`equipement-${equipement.id}-${equipement.nom}`}
                                action={renameEquipementPlastiqueAction}
                                className="flex items-center gap-2"
                              >
                                <input type="hidden" name="id" value={equipement.id} />
                                <input
                                  type="text"
                                  name="nom"
                                  required
                                  maxLength={100}
                                  defaultValue={equipement.nom}
                                  className="w-64 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                                />
                                <SubmitButton
                                  pendingLabel="..."
                                  className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                                >
                                  OK
                                </SubmitButton>
                              </form>
                            ) : (
                              equipement.nom
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-600">{articlesParMachine.get(equipement.nom) ?? 0}</td>
                          {canDelete ? (
                            <td className="px-6 py-4">
                              <form action={deleteEquipementPlastiqueAction}>
                                <input type="hidden" name="id" value={equipement.id} />
                                <DeleteIconButton label={`Supprimer ${equipement.nom}`} />
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
          </>
        )}
      </div>
    </main>
  );
}
