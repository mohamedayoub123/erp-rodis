import Link from "next/link";
import { readImportStatus } from "@/lib/import-status";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SubmitButton } from "@/app/_components/submit-button";
import {
  getCurrentStockUser,
  getUserPermissions,
  isAdminUser,
  listStockUsers,
} from "@/lib/stock-auth";
import {
  ADMIN_SECTION_LABELS,
  ADMIN_SECTION_ORDER,
  MODULE_LABELS,
  PAGE_REGISTRY,
  sectionForPage,
  type AdminSection,
  type ModuleKey,
} from "@/lib/page-registry";
import { getWorkbookSourceLabel, resolveWorkbookPath } from "@/lib/workbook-path";
import { ModuleViewToggle } from "./module-view-toggle";
import {
  createUserAction,
  deleteUserAction,
  forceLogoutUserAction,
  updateUserPermissionsAction,
  uploadClientsWorkbookAction,
  uploadCommandeWorkbookAction,
  uploadDataWorkbookAction,
  uploadEntrerWorkbookAction,
  uploadWorkbookAction,
} from "./actions";

function formatConnectedSince(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}-${month} a ${hours}h${minutes}`;
}

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
  // "Gerer utilisateurs" doit donner acces a cette page comme mayoub -
  // avant ce garde-fou, la page ne verifiait que isAdminUser (mayoub
  // uniquement), donc cocher "Gerer utilisateurs" pour quelqu'un d'autre ne
  // le laissait jamais entrer sur /admin (voir aussi actions.ts, meme
  // correction sur les 3 actions de gestion des comptes).
  const isAdmin = isAdminUser(currentUser);
  const canManageUsers = isAdmin || (await getUserPermissions(currentUser)).manageUsers;

  if (!canManageUsers) {
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

  const stockUsers = await listStockUsers();

  const pagesByModule = new Map<ModuleKey, typeof PAGE_REGISTRY>();
  for (const page of PAGE_REGISTRY) {
    const list = pagesByModule.get(page.module) ?? [];
    list.push(page);
    pagesByModule.set(page.module, list);
  }

  // Modules regroupes par section admin (Gestion Stock PF / Gestion Stock
  // MP / Production / Autre) - une page "matiere premiere" peut faire
  // basculer tout son module dans une section differente de celle des
  // autres pages du meme module (ex: Articles a des pages en PF et en MP).
  const modulesBySection = new Map<AdminSection, ModuleKey[]>();
  for (const page of PAGE_REGISTRY) {
    const section = sectionForPage(page);
    const modules = modulesBySection.get(section) ?? [];
    if (!modules.includes(page.module)) modules.push(page.module);
    modulesBySection.set(section, modules);
  }

  // Modules qui apparaissent dans plusieurs sections (Stock/Articles/
  // Mouvements ont chacun des pages PF et des pages MP) - sans suffixe, ces
  // modules s'affichaient deux fois avec exactement le meme nom "Stock",
  // "Articles" ou "Mouvements" sous deux titres differents, ce qui a fait
  // cocher la mauvaise case a l'utilisateur (Stock MP au lieu de Stock PF).
  const modulesInMultipleSections = new Set<ModuleKey>();
  for (const modules of modulesBySection.values()) {
    for (const moduleKey of modules) {
      let sectionsForModule = 0;
      for (const otherModules of modulesBySection.values()) {
        if (otherModules.includes(moduleKey)) sectionsForModule += 1;
      }
      if (sectionsForModule > 1) modulesInMultipleSections.add(moduleKey);
    }
  }

  function moduleLabelForSection(moduleKey: ModuleKey, section: AdminSection) {
    if (!modulesInMultipleSections.has(moduleKey)) return MODULE_LABELS[moduleKey];
    const suffix = section === "GestionStockMp" ? "Matiere Premiere" : "Produit Fini";
    return `${MODULE_LABELS[moduleKey]} (${suffix})`;
  }

  // Un module peut apparaitre dans plusieurs sections (ex: "Articles" a des
  // pages en Gestion Stock PF et d'autres en Gestion Stock MP) - on ne
  // montre, dans chaque section, que les pages qui appartiennent vraiment a
  // cette section, pas tout le module. Les pages "reservees" (defaultView
  // false - Entrepot/Produit/Charges Usine...) remontent en tete de liste,
  // sinon elles se perdent dans un module de 30+ pages (demande explicite,
  // l'admin ne les trouvait pas).
  function pagesForModuleInSection(moduleKey: ModuleKey, section: AdminSection) {
    return (pagesByModule.get(moduleKey) ?? [])
      .filter((page) => sectionForPage(page) === section)
      .sort((a, b) => Number(a.defaultView === false ? 0 : 1) - Number(b.defaultView === false ? 0 : 1));
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#fbfdff_50%,#ffffff_100%)] px-6 py-8 text-slate-900 lg:px-10">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

            <div className="flex items-center gap-3">
              <Link
                href="/admin/historique"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
              >
                Historique
              </Link>
              <BackButton href="/" label="Retour accueil" />
              <RefreshButton />
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
              <SubmitButton
                pendingLabel="Envoi..."
                className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Envoyer le fichier Excel
              </SubmitButton>
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
            {userState === "logout-ok" ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Utilisateur deconnecte. Il peut se reconnecter ailleurs.
              </p>
            ) : null}
            {userState === "logout-error" ? (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Impossible de deconnecter cet utilisateur.
              </p>
            ) : null}

            <details className="mt-5 group rounded-2xl border border-slate-200 bg-slate-50">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900">
                <span className="flex-1">Qui est connecte</span>
                <span
                  aria-hidden="true"
                  className="text-slate-400 transition-transform group-open:rotate-90"
                >
                  &#9656;
                </span>
              </summary>

              <div className="space-y-2 border-t border-slate-200 p-3">
                {stockUsers.map((user) => (
                  <div
                    key={`session-${user.username}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 rounded-full ${user.connected ? "bg-emerald-500" : "bg-slate-300"}`}
                      />
                      <span className="text-sm font-semibold text-slate-900">{user.username}</span>
                      {user.connected ? (
                        <span className="text-xs text-slate-500">
                          Connecte depuis {formatConnectedSince(user.connectedSince)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Deconnecte</span>
                      )}
                    </div>

                    {user.connected ? (
                      <form action={forceLogoutUserAction}>
                        <input type="hidden" name="username" value={user.username} />
                        <SubmitButton
                          pendingLabel="Deconnexion..."
                          className="rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          Deconnecter
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>

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
                <SubmitButton
                  pendingLabel="Creation..."
                  className="rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-400"
                >
                  Creer utilisateur
                </SubmitButton>
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
                      <input
                        type="hidden"
                        name="known_page_keys"
                        value={PAGE_REGISTRY.map((page) => page.key).join(",")}
                      />

                      <div className="space-y-3">
                        {ADMIN_SECTION_ORDER.filter(
                          (section) => (modulesBySection.get(section) ?? []).length > 0
                        ).map((section) => {
                          const modulesInSection = modulesBySection.get(section) ?? [];

                          return (
                            <details
                              key={section}
                              className="group rounded-2xl border border-slate-300 bg-slate-50"
                            >
                              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-900">
                                <span className="flex-1">{ADMIN_SECTION_LABELS[section]}</span>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-400 transition-transform group-open:rotate-90"
                                >
                                  &#9656;
                                </span>
                              </summary>

                              <div className="space-y-2 border-t border-slate-200 p-3">
                                {modulesInSection.map((moduleKey) => {
                                  const pages = pagesForModuleInSection(moduleKey, section);
                                  const moduleHasAnyView = pages.some(
                                    (page) => user.permissions.pages[page.key]?.view
                                  );

                                  return (
                                    <details
                                      key={`${section}-${moduleKey}`}
                                      // Un seul module dans cette section (Entrepot/Produit/Charges
                                      // Usine) : ouvert par defaut pour donner l'acces en un clic
                                      // (celui de la section), sans sous-menu a ouvrir en plus.
                                      open={modulesInSection.length === 1}
                                      className="group rounded-2xl border border-slate-200 bg-white"
                                    >
                                      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800">
                                        {!user.isAdmin ? (
                                          <ModuleViewToggle defaultChecked={moduleHasAnyView} />
                                        ) : null}
                                        <span className="flex-1">{moduleLabelForSection(moduleKey, section)}</span>
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
                                              <th className="px-4 py-2 text-center font-semibold">Supprimer</th>
                                              {moduleKey === "Commandes" ? (
                                                <th className="px-4 py-2 text-center font-semibold">Changer statut</th>
                                              ) : null}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {pages.map((page) => (
                                              <tr
                                                key={page.key}
                                                className={`border-t border-slate-200 ${
                                                  page.defaultView === false ? "bg-amber-50/60" : ""
                                                }`}
                                              >
                                                <td className="px-4 py-2 font-medium text-slate-800">
                                                  {page.label}
                                                  {page.defaultView === false ? (
                                                    <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                                      Reserve
                                                    </span>
                                                  ) : null}
                                                </td>
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
                                                <td className="px-4 py-2 text-center">
                                                  {moduleKey === "Commandes" ? (
                                                    page.key === "commandesDetail" ? (
                                                      <input
                                                        type="checkbox"
                                                        name="deleteCommandes"
                                                        defaultChecked={user.permissions.deleteCommandes}
                                                        disabled={user.isAdmin}
                                                        className="perm-checkbox h-4 w-4 rounded border-slate-300"
                                                      />
                                                    ) : (
                                                      "-"
                                                    )
                                                  ) : page.hasWrite === false ? (
                                                    "-"
                                                  ) : (
                                                    <input
                                                      type="checkbox"
                                                      name={`page__${page.key}__delete`}
                                                      defaultChecked={user.permissions.pages[page.key]?.delete ?? false}
                                                      disabled={user.isAdmin}
                                                      className="perm-checkbox h-4 w-4 rounded border-slate-300"
                                                    />
                                                  )}
                                                </td>
                                                {moduleKey === "Commandes" ? (
                                                  <td className="px-4 py-2 text-center">
                                                    {page.key === "commandesDetail" ? (
                                                      <input
                                                        type="checkbox"
                                                        name="changeStatusCommandes"
                                                        defaultChecked={user.permissions.changeStatusCommandes}
                                                        disabled={user.isAdmin}
                                                        className="perm-checkbox h-4 w-4 rounded border-slate-300"
                                                      />
                                                    ) : (
                                                      "-"
                                                    )}
                                                  </td>
                                                ) : null}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </details>
                                  );
                                })}
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

                        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">
                            Voir les prix (BC MP, lots, recettes, commandes)
                          </p>
                          <input
                            type="checkbox"
                            name="voirPrix"
                            defaultChecked={user.permissions.voirPrix}
                            disabled={user.isAdmin}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </div>

                        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">
                            Changer la Machine Conditionnement (Programme par ligne)
                          </p>
                          <input
                            type="checkbox"
                            name="changerMachineConditionnement"
                            defaultChecked={user.permissions.changerMachineConditionnement}
                            disabled={user.isAdmin}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </div>
                      </div>

                      {!user.isAdmin ? (
                        <SubmitButton
                          pendingLabel="Enregistrement..."
                          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Enregistrer permissions
                        </SubmitButton>
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
              <SubmitButton
                pendingLabel="Envoi..."
                className="rounded-full bg-violet-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-600"
              >
                Envoyer Data
              </SubmitButton>
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
              <SubmitButton
                pendingLabel="Envoi..."
                className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                Envoyer Entrer
              </SubmitButton>
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
              <SubmitButton
                pendingLabel="Envoi..."
                className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Envoyer Commande
              </SubmitButton>
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
              <SubmitButton
                pendingLabel="Envoi..."
                className="rounded-full bg-lime-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-lime-600"
              >
                Envoyer Clients
              </SubmitButton>
            </form>
          </article>
        </section>
      </div>
    </main>
  );
}
