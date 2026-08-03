import { readImportStatus } from "@/lib/import-status";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import {
  getCurrentStockUser,
  isAdminUser,
  listStockUsers,
} from "@/lib/stock-auth";
import { MODULE_LABELS, PAGE_REGISTRY, type ModuleKey } from "@/lib/page-registry";
import { getWorkbookSourceLabel, resolveWorkbookPath } from "@/lib/workbook-path";
import { ModuleViewToggle } from "./module-view-toggle";
import {
  createUserAction,
  deleteUserAction,
  updateUserPermissionsAction,
  uploadClientsWorkbookAction,
  uploadCommandeWorkbookAction,
  uploadDataWorkbookAction,
  uploadEntrerWorkbookAction,
  uploadWorkbookAction,
} from "./actions";

type SearchParams = Promise<{
  upload?: string;
  detail?: string;
  user?: string;
}>;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const uploadState = (params.upload || "").trim();
  const uploadDetail = (params.detail || "").trim();
  const userState = (params.user || "").trim();
  const workbookPath = resolveWorkbookPath();
  const workbookSource = getWorkbookSourceLabel();
  const importStatus = readImportStatus();
  const currentUser = await getCurrentStockUser();

  if (!isAdminUser(currentUser)) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#fbfdff_50%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <section className="rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
              Acces reserve
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Admin visible seulement pour mayoub
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Cet espace est reserve a l&apos;utilisateur admin principal.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const stockUsers = listStockUsers();

  const modulesInOrder = [...new Set(PAGE_REGISTRY.map((page) => page.module))] as ModuleKey[];
  const pagesByModule = new Map<ModuleKey, typeof PAGE_REGISTRY>();
  for (const page of PAGE_REGISTRY) {
    const list = pagesByModule.get(page.module) ?? [];
    list.push(page);
    pagesByModule.set(page.module, list);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#fbfdff_50%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Administration rapide
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                Page legere pour envoyer le fichier Excel principal, la feuille Data,
                la feuille entrer, ou le fichier des commandes.
              </p>
            </div>
          </div>
        </section>

        <section>
          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-900">Fichier Excel de mise a jour</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Envoie ici ton fichier Excel principal. Ensuite le systeme prendra ce
              fichier pour recharger <span className="font-semibold">Data</span> et{" "}
              <span className="font-semibold">entrer</span>.
            </p>

            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <p>
                <span className="font-semibold text-slate-900">Source actuelle :</span>{" "}
                {workbookSource}
              </p>
              <p className="mt-2 break-all">
                <span className="font-semibold text-slate-900">Chemin utilise :</span>{" "}
                {workbookPath}
              </p>
            </div>

            {uploadState === "ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Fichier Excel envoye avec succes.
              </p>
            ) : null}
            {uploadState === "replaced" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Stock remplace avec succes par le fichier Excel envoye.
              </p>
            ) : null}
            {uploadState === "queued" ? (
              <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
                Fichier envoye. L&apos;import tourne maintenant en arriere-plan.
              </p>
            ) : null}
            {uploadState === "stockonly" ? (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Le stock a bien ete remplace avec le fichier Excel, mais la feuille Data
                est absente du fichier envoye.
              </p>
            ) : null}
            {uploadState === "empty" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Choisis un fichier Excel avant d&apos;envoyer.
              </p>
            ) : null}
            {uploadState === "badtype" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Utilise un fichier `.xlsm` ou `.xlsx`.
              </p>
            ) : null}
            {uploadState === "error" ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <p>L&apos;envoi du fichier a marche, mais l&apos;import Excel a echoue.</p>
                {uploadDetail ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-red-800">
                    Detail : {uploadDetail}
                  </p>
                ) : null}
              </div>
            ) : null}
            {uploadState === "sheet" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Le fichier envoye n&apos;a pas la feuille <span className="font-semibold">entrer</span>.
                Ton fichier actuel contient d&apos;autres feuilles, donc il ne peut pas remplacer le stock.
              </p>
            ) : null}

            <form action={uploadWorkbookAction} className="mt-5 space-y-4">
              <input
                type="file"
                name="workbook"
                accept=".xlsm,.xlsx"
                className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Envoyer le fichier Excel
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm">
              <p className="font-semibold text-slate-900">Statut import</p>
              <p className="mt-2 text-slate-700">{importStatus.message}</p>
              {importStatus.updatedAt ? (
                <p className="mt-1 text-xs text-slate-500">Maj : {importStatus.updatedAt}</p>
              ) : null}
              {importStatus.details ? (
                <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-white px-3 py-3 text-xs text-slate-700">
                  {importStatus.details}
                </pre>
              ) : null}
            </div>
          </article>
        </section>

        <section>
          <article className="rounded-[2rem] border border-amber-200 bg-white p-6 shadow-[0_18px_40px_rgba(245,158,11,0.08)]">
            <h2 className="text-xl font-bold text-slate-900">Gestion utilisateurs</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ici, <span className="font-semibold">mayoub</span> peut creer de nouveaux
              utilisateurs pour ouvrir le systeme.
            </p>

            {userState === "ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Nouvel utilisateur cree avec succes.
              </p>
            ) : null}
            {userState === "empty" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Ecris un nom utilisateur.
              </p>
            ) : null}
            {userState === "short" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Ecris au moins 1 caractere pour le mot de passe.
              </p>
            ) : null}
            {userState === "confirm" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                La confirmation du mot de passe ne correspond pas.
              </p>
            ) : null}
            {userState === "exists" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Cet utilisateur existe deja.
              </p>
            ) : null}
            {userState === "delete-ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Utilisateur supprime avec succes.
              </p>
            ) : null}
            {userState === "delete-error" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Suppression impossible pour cet utilisateur.
              </p>
            ) : null}
            {userState === "perm-ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Permissions utilisateur mises a jour.
              </p>
            ) : null}
            {userState === "perm-error" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Impossible de mettre a jour les permissions.
              </p>
            ) : null}

            <form action={createUserAction} className="mt-5 grid gap-4 md:grid-cols-3">
              <input
                type="text"
                name="username"
                placeholder="Utilisateur"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                required
              />
              <input
                type="password"
                name="password"
                placeholder="Mot de passe"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                required
              />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirmer mot de passe"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                required
              />
              <div className="md:col-span-3">
                <button
                  type="submit"
                  className="rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-400"
                >
                  Creer utilisateur
                </button>
              </div>
            </form>

            <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Utilisateurs actuels</p>
              <div className="space-y-4">
                {stockUsers.map((user) => (
                  <article
                    key={user.username}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-lg font-bold text-slate-900">
                          {user.username} {user.isAdmin ? "- admin principal" : ""}
                        </p>
                        <p className="text-sm text-slate-500">
                          Voire quoi et modifier quoi pour cet utilisateur.
                        </p>
                      </div>

                      {!user.isAdmin ? (
                        <form action={deleteUserAction}>
                          <input type="hidden" name="username" value={user.username} />
                          <DeleteIconButton label="Effacer utilisateur" />
                        </form>
                      ) : null}
                    </div>

                    <form action={updateUserPermissionsAction} className="mt-4 space-y-3">
                      <input type="hidden" name="username" value={user.username} />

                      <div className="space-y-2">
                        {modulesInOrder.map((moduleKey) => {
                          const pages = pagesByModule.get(moduleKey) ?? [];
                          const moduleHasAnyView = pages.some(
                            (page) => user.permissions.pages[page.key]?.view
                          );

                          return (
                            <details
                              key={moduleKey}
                              className="group rounded-2xl border border-slate-200 bg-white"
                            >
                              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800">
                                {!user.isAdmin ? (
                                  <ModuleViewToggle defaultChecked={moduleHasAnyView} />
                                ) : null}
                                <span className="flex-1">{MODULE_LABELS[moduleKey]}</span>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-400 transition-transform group-open:rotate-90"
                                >
                                  &#9656;
                                </span>
                              </summary>

                              <div className="overflow-x-auto border-t border-slate-200">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-slate-100 text-slate-700">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-semibold">Page</th>
                                      <th className="px-4 py-2 text-center font-semibold">Voir</th>
                                      <th className="px-4 py-2 text-center font-semibold">Modifier</th>
                                      {moduleKey === "Commandes" ? (
                                        <>
                                          <th className="px-4 py-2 text-center font-semibold">Supprimer</th>
                                          <th className="px-4 py-2 text-center font-semibold">Changer statut</th>
                                        </>
                                      ) : null}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pages.map((page) => (
                                      <tr key={page.key} className="border-t border-slate-200">
                                        <td className="px-4 py-2 font-medium text-slate-800">{page.label}</td>
                                        <td className="px-4 py-2 text-center">
                                          <input
                                            type="checkbox"
                                            name={`page__${page.key}__view`}
                                            defaultChecked={user.permissions.pages[page.key]?.view ?? false}
                                            disabled={user.isAdmin}
                                            className="perm-checkbox h-4 w-4 rounded border-slate-300"
                                          />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          {page.hasWrite === false ? (
                                            "-"
                                          ) : (
                                            <input
                                              type="checkbox"
                                              name={`page__${page.key}__write`}
                                              defaultChecked={user.permissions.pages[page.key]?.write ?? false}
                                              disabled={user.isAdmin}
                                              className="perm-checkbox h-4 w-4 rounded border-slate-300"
                                            />
                                          )}
                                        </td>
                                        {moduleKey === "Commandes" ? (
                                          page.key === "commandesDetail" ? (
                                            <>
                                              <td className="px-4 py-2 text-center">
                                                <input
                                                  type="checkbox"
                                                  name="deleteCommandes"
                                                  defaultChecked={user.permissions.deleteCommandes}
                                                  disabled={user.isAdmin}
                                                  className="perm-checkbox h-4 w-4 rounded border-slate-300"
                                                />
                                              </td>
                                              <td className="px-4 py-2 text-center">
                                                <input
                                                  type="checkbox"
                                                  name="changeStatusCommandes"
                                                  defaultChecked={user.permissions.changeStatusCommandes}
                                                  disabled={user.isAdmin}
                                                  className="perm-checkbox h-4 w-4 rounded border-slate-300"
                                                />
                                              </td>
                                            </>
                                          ) : (
                                            <>
                                              <td className="px-4 py-2 text-center">-</td>
                                              <td className="px-4 py-2 text-center">-</td>
                                            </>
                                          )
                                        ) : null}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          );
                        })}

                        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">Gerer utilisateurs</p>
                          <input
                            type="checkbox"
                            name="manageUsers"
                            defaultChecked={user.permissions.manageUsers}
                            disabled={user.isAdmin}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </div>
                      </div>

                      {!user.isAdmin ? (
                        <button
                          type="submit"
                          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Enregistrer permissions
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-emerald-700">
                          Mayoub garde tous les droits.
                        </p>
                      )}
                    </form>
                  </article>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-[2rem] border border-violet-200 bg-white p-6 shadow-[0_18px_40px_rgba(139,92,246,0.08)]">
            <h2 className="text-xl font-bold text-violet-950">Import Data</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Envoie ici un fichier qui contient la feuille <span className="font-semibold">Data</span>.
            </p>

            {uploadState === "data-ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                La feuille Data a ete importee avec succes.
              </p>
            ) : null}
            {uploadState === "data-empty" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Choisis un fichier pour Data.
              </p>
            ) : null}
            {uploadState === "data-badtype" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Utilise un fichier `.xlsm` ou `.xlsx`.
              </p>
            ) : null}
            {uploadState === "data-sheet" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Le fichier n&apos;a pas la feuille Data.
              </p>
            ) : null}
            {uploadState === "data-error" ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <p>L&apos;import Data a echoue.</p>
                {uploadDetail ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-red-800">
                    Detail : {uploadDetail}
                  </p>
                ) : null}
              </div>
            ) : null}

            <form action={uploadDataWorkbookAction} className="mt-5 space-y-4">
              <input
                type="file"
                name="workbook"
                accept=".xlsm,.xlsx"
                className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-violet-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-600"
              >
                Envoyer Data
              </button>
            </form>
          </article>

          <article className="rounded-[2rem] border border-emerald-200 bg-white p-6 shadow-[0_18px_40px_rgba(16,185,129,0.08)]">
            <h2 className="text-xl font-bold text-emerald-950">Import Entrer</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Envoie ici un fichier qui contient la feuille <span className="font-semibold">entrer</span>.
            </p>

            {uploadState === "entrer-ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                La feuille entrer a ete importee avec succes.
              </p>
            ) : null}
            {uploadState === "entrer-empty" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Choisis un fichier pour entrer.
              </p>
            ) : null}
            {uploadState === "entrer-badtype" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Utilise un fichier `.xlsm` ou `.xlsx`.
              </p>
            ) : null}
            {uploadState === "entrer-sheet" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Le fichier n&apos;a pas la feuille entrer.
              </p>
            ) : null}
            {uploadState === "entrer-error" ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <p>L&apos;import entrer a echoue.</p>
                {uploadDetail ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-red-800">
                    Detail : {uploadDetail}
                  </p>
                ) : null}
              </div>
            ) : null}

            <form action={uploadEntrerWorkbookAction} className="mt-5 space-y-4">
              <input
                type="file"
                name="workbook"
                accept=".xlsm,.xlsx"
                className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                Envoyer Entrer
              </button>
            </form>
          </article>

          <article className="rounded-[2rem] border border-sky-200 bg-white p-6 shadow-[0_18px_40px_rgba(14,165,233,0.08)]">
            <h2 className="text-xl font-bold text-sky-950">Import Commande</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Envoie ici le fichier des commandes Excel. Si la <span className="font-semibold">proforma</span> existe deja, elle sera remplacee.
            </p>

            {uploadState === "commande-ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Les commandes ont ete importees avec succes.
              </p>
            ) : null}
            {uploadState === "commande-empty" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Choisis un fichier pour les commandes.
              </p>
            ) : null}
            {uploadState === "commande-badtype" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Utilise un fichier `.xlsm` ou `.xlsx`.
              </p>
            ) : null}
            {uploadState === "commande-error" ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <p>L&apos;import commandes a echoue.</p>
                {uploadDetail ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-red-800">
                    Detail : {uploadDetail}
                  </p>
                ) : null}
              </div>
            ) : null}

            <form action={uploadCommandeWorkbookAction} className="mt-5 space-y-4">
              <input
                type="file"
                name="workbook"
                accept=".xlsm,.xlsx"
                className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Envoyer Commande
              </button>
            </form>
          </article>

          <article className="rounded-[2rem] border border-lime-200 bg-white p-6 shadow-[0_18px_40px_rgba(101,163,13,0.08)]">
            <h2 className="text-xl font-bold text-lime-950">Import Clients</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Envoie ici le fichier des clients (Client / Pays / type). Si le client existe deja, il sera mis a jour.
            </p>

            {uploadState === "clients-ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Les clients ont ete importes avec succes.
              </p>
            ) : null}
            {uploadState === "clients-empty" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Choisis un fichier pour les clients.
              </p>
            ) : null}
            {uploadState === "clients-badtype" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Utilise un fichier `.xlsm` ou `.xlsx`.
              </p>
            ) : null}
            {uploadState === "clients-error" ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <p>L&apos;import clients a echoue.</p>
                {uploadDetail ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-red-800">
                    Detail : {uploadDetail}
                  </p>
                ) : null}
              </div>
            ) : null}

            <form action={uploadClientsWorkbookAction} className="mt-5 space-y-4">
              <input
                type="file"
                name="workbook"
                accept=".xlsm,.xlsx"
                className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-lime-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-lime-600"
              >
                Envoyer Clients
              </button>
            </form>
          </article>
        </section>
      </div>
    </main>
  );
}
