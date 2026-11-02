import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import {
  SQL_EQUIPEMENTS_PLASTIQUE,
  SQL_TON_SECTION_EQUIPEMENTS_PLASTIQUE,
  fetchEquipementsPlastique,
  fetchMachinesParArticle,
} from "@/lib/equipements-plastique";
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

  const { pret, colonnesPret, equipements } = await fetchEquipementsPlastique();
  // Nombre d'articles de E3 par machine : un article peut avoir plusieurs machines (table article_machines_plastique) ; tant que
  // cette table n'existe pas, la machine unique enregistree sur l'article
  const machinesResult = pret ? await fetchMachinesParArticle(equipements) : { pret: false, parArticle: new Map() };
  let articlesParMachine = new Map<string, number>();
  if (machinesResult.pret) {
    for (const machines of machinesResult.parArticle.values()) {
      for (const machine of machines) articlesParMachine.set(machine.nom, (articlesParMachine.get(machine.nom) ?? 0) + 1);
    }
  } else if (pret) {
    articlesParMachine = await compterArticlesParMachine();
  }
  // Sections deja utilisees (INJ, SOUFF...) proposees quand on tape
  const sectionsExistantes = [...new Set(equipements.map((e) => e.section).filter((s): s is string => Boolean(s)))].sort();

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
            {!colonnesPret ? (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                TON et SECTION ne sont pas encore actifs : lance d&apos;abord le script SQL{" "}
                {SQL_TON_SECTION_EQUIPEMENTS_PLASTIQUE.replace("scripts/sql/", "")} dans Supabase (SQL Editor).
              </p>
            ) : null}
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
                  {colonnesPret ? (
                    <>
                      <label className="grid gap-1 text-xs font-semibold text-slate-500">
                        TON
                        <input
                          type="text"
                          name="ton"
                          maxLength={50}
                          placeholder="320 ou 4 TETE"
                          className="w-36 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-slate-500">
                        SECTION
                        <input
                          type="text"
                          name="section"
                          maxLength={50}
                          list="sections-equipements"
                          placeholder="INJ, SOUFF..."
                          className="w-40 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                        />
                      </label>
                    </>
                  ) : null}
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
                        {colonnesPret ? <th className="px-6 py-4 font-semibold">TON</th> : null}
                        {colonnesPret ? <th className="px-6 py-4 font-semibold">SECTION</th> : null}
                        <th className="px-6 py-4 font-semibold">Articles dans E3</th>
                        {canDelete ? <th className="px-6 py-4 font-semibold">Action</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {equipements.map((equipement) => {
                        const formId = `equipement-${equipement.id}`;
                        return (
                        // key : la ligne se remet a jour apres OK
                        <tr
                          key={`${equipement.id}-${equipement.nom}-${equipement.ton ?? ""}-${equipement.section ?? ""}`}
                          className="border-t border-slate-100"
                        >
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {canEdit ? (
                              // Un seul formulaire par ligne : TON et SECTION (autres cellules) y sont rattaches par l'attribut form
                              <form id={formId} action={renameEquipementPlastiqueAction} className="flex items-center gap-2">
                                <input type="hidden" name="id" value={equipement.id} />
                                <input
                                  type="text"
                                  name="nom"
                                  required
                                  maxLength={100}
                                  defaultValue={equipement.nom}
                                  className="w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
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
                          {colonnesPret ? (
                            <td className="px-6 py-4 text-slate-600">
                              {canEdit ? (
                                <input
                                  type="text"
                                  name="ton"
                                  form={formId}
                                  maxLength={50}
                                  defaultValue={equipement.ton ?? ""}
                                  aria-label={`TON de ${equipement.nom}`}
                                  className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                                />
                              ) : (
                                equipement.ton || "-"
                              )}
                            </td>
                          ) : null}
                          {colonnesPret ? (
                            <td className="px-6 py-4 text-slate-600">
                              {canEdit ? (
                                <input
                                  type="text"
                                  name="section"
                                  form={formId}
                                  maxLength={50}
                                  list="sections-equipements"
                                  defaultValue={equipement.section ?? ""}
                                  aria-label={`SECTION de ${equipement.nom}`}
                                  className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                                />
                              ) : (
                                equipement.section || "-"
                              )}
                            </td>
                          ) : null}
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
                        );
                      })}
                    </tbody>
                  </table>
                  <datalist id="sections-equipements">
                    {sectionsExistantes.map((section) => (
                      <option key={section} value={section} />
                    ))}
                  </datalist>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
