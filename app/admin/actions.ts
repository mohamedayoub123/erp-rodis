"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  refreshArticlesImport,
  refreshClientsImport,
  refreshCommandesListImport,
  refreshLotsImport,
  startBackgroundFullImport,
} from "@/lib/import-jobs";
import {
  createStockUser,
  deleteStockUser,
  forceLogoutStockUser,
  getCurrentStockUser,
  getUserPermissions,
  isAdminUser,
  resetStockUserPassword,
  updateUserPermissions,
  type PagePermissions,
} from "@/lib/stock-auth";
import { PAGE_REGISTRY } from "@/lib/page-registry";
import { resolveWorkbookPath, saveUploadedWorkbook } from "@/lib/workbook-path";

// "Gerer utilisateurs" (case cochee par mayoub sur un autre compte) doit
// donner acces aux memes actions que mayoub sur la gestion des comptes -
// avant ce garde-fou, la case n'avait aucun effet reel : la page /admin et
// ces trois actions ne verifiaient que isAdminUser (mayoub uniquement),
// donc cocher "Gerer utilisateurs" pour quelqu'un d'autre ne changeait rien.
async function canManageUsers(username: string | null | undefined) {
  if (isAdminUser(username)) return true;
  const permissions = await getUserPermissions(username);
  return permissions.manageUsers;
}

function revalidateAdminImports() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/data");
  revalidatePath("/stock");
  revalidatePath("/stock-dormant");
  revalidatePath("/historique-mouvements");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/dashboard");
  revalidatePath("/commandes");
  revalidatePath("/clients");
}

function validateWorkbookFile(fileValue: FormDataEntryValue | null) {
  if (!(fileValue instanceof File) || fileValue.size === 0) {
    return "empty";
  }

  const fileName = fileValue.name.toLowerCase();
  if (!fileName.endsWith(".xlsm") && !fileName.endsWith(".xlsx")) {
    return "badtype";
  }

  return null;
}

function buildUploadErrorRedirect(message: string) {
  const detail = encodeURIComponent(message.slice(0, 500));
  return `/admin?upload=error&detail=${detail}`;
}

export async function createUserAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canManageUsers(currentUser))) {
    redirect("/?user=forbidden");
  }

  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const confirmPassword = String(formData.get("confirmPassword") || "").trim();

  if (!username) {
    redirect("/admin?user=empty");
  }

  if (password.length < 1) {
    redirect("/admin?user=short");
  }

  if (password !== confirmPassword) {
    redirect("/admin?user=confirm");
  }

  const created = await createStockUser(username, password);

  if (!created) {
    redirect("/admin?user=exists");
  }

  revalidatePath("/admin");
  redirect("/admin?user=ok");
}

export async function resetUserPasswordAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canManageUsers(currentUser))) {
    redirect("/?user=forbidden");
  }

  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const confirmPassword = String(formData.get("confirmPassword") || "").trim();

  if (!username) {
    redirect("/admin?user=reset-empty");
  }

  if (password.length < 1) {
    redirect("/admin?user=reset-short");
  }

  if (password !== confirmPassword) {
    redirect("/admin?user=reset-confirm");
  }

  const reset = await resetStockUserPassword(username, password);

  if (!reset) {
    redirect("/admin?user=reset-error");
  }

  revalidatePath("/admin");
  redirect("/admin?user=reset-ok");
}

function readPermissionFlag(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim() === "on";
}

export async function deleteUserAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canManageUsers(currentUser))) {
    redirect("/?user=forbidden");
  }

  const username = String(formData.get("username") || "").trim().toLowerCase();

  if (!username) {
    redirect("/admin?user=delete-empty");
  }

  const deleted = await deleteStockUser(username);

  if (!deleted) {
    redirect("/admin?user=delete-error");
  }

  revalidatePath("/admin");
  redirect("/admin?user=delete-ok");
}

export async function forceLogoutUserAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canManageUsers(currentUser))) {
    redirect("/?user=forbidden");
  }

  const username = String(formData.get("username") || "").trim().toLowerCase();

  if (!username) {
    redirect("/admin?user=logout-error");
  }

  await forceLogoutStockUser(username);

  revalidatePath("/admin");
  redirect("/admin?user=logout-ok");
}

export async function updateUserPermissionsAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canManageUsers(currentUser))) {
    redirect("/?user=forbidden");
  }

  const username = String(formData.get("username") || "").trim().toLowerCase();

  if (!username) {
    redirect("/admin?user=perm-empty");
  }

  // Le formulaire peut avoir ete affiche AVANT qu'une nouvelle page soit
  // ajoutee au registre (deploiement en cours pendant que l'admin avait deja
  // l'onglet ouvert) - dans ce cas la case correspondante n'existait tout
  // simplement pas dans le formulaire soumis, ce qui est indistinguable
  // d'une case decochee. "known_page_keys" liste les pages qui existaient
  // reellement au moment de l'affichage, pour qu'on puisse garder l'ancienne
  // valeur des pages absentes au lieu de les repasser silencieusement a
  // false (bug signale : "les changements ne s'appliquent pas bien").
  const knownPageKeys = new Set(
    String(formData.get("known_page_keys") || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean)
  );
  const currentPermissions = await getUserPermissions(username);

  const pages: PagePermissions = {};

  for (const page of PAGE_REGISTRY) {
    if (!knownPageKeys.has(page.key)) {
      pages[page.key] = currentPermissions.pages[page.key] ?? { view: false, write: false, delete: false };
      continue;
    }

    pages[page.key] = {
      view: readPermissionFlag(formData, `page__${page.key}__view`),
      write: page.hasWrite === false ? false : readPermissionFlag(formData, `page__${page.key}__write`),
      delete: page.hasWrite === false ? false : readPermissionFlag(formData, `page__${page.key}__delete`),
    };
  }

  const nextPermissions = {
    pages,
    deleteCommandes: readPermissionFlag(formData, "deleteCommandes"),
    changeStatusCommandes: readPermissionFlag(formData, "changeStatusCommandes"),
    manageUsers: readPermissionFlag(formData, "manageUsers"),
    voirPrix: readPermissionFlag(formData, "voirPrix"),
    changerMachineConditionnement: readPermissionFlag(formData, "changerMachineConditionnement"),
  };

  const updated = await updateUserPermissions(username, nextPermissions);

  if (!updated) {
    redirect("/admin?user=perm-error");
  }

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/stock");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/commandes");
  revalidatePath("/tableau-commandes");
  revalidatePath("/planning");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/historique-mouvements");
  redirect("/admin?user=perm-ok");
}

export async function refreshArticlesAction() {
  if (!isAdminUser(await getCurrentStockUser())) {
    throw new Error("Cet utilisateur ne peut pas lancer une mise a jour.");
  }

  const result = refreshArticlesImport(resolveWorkbookPath());
  revalidatePath("/");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/data");
  revalidatePath("/commandes");
  revalidatePath("/mouvements/produit-fini");
  return result;
}

export async function refreshStockAction() {
  if (!isAdminUser(await getCurrentStockUser())) {
    throw new Error("Cet utilisateur ne peut pas lancer une mise a jour.");
  }

  const result = refreshLotsImport(resolveWorkbookPath());
  revalidatePath("/");
  revalidatePath("/stock");
  revalidatePath("/stock-dormant");
  revalidatePath("/historique-mouvements");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/dashboard");
  return result;
}

export async function refreshAllExcelAction() {
  if (!isAdminUser(await getCurrentStockUser())) {
    throw new Error("Cet utilisateur ne peut pas lancer une mise a jour.");
  }

  const workbookPath = resolveWorkbookPath();

  refreshArticlesImport(workbookPath);
  refreshLotsImport(workbookPath);

  revalidateAdminImports();

  return "Mise a jour Excel terminee.";
}

export async function refreshCommandesListAction() {
  if (!isAdminUser(await getCurrentStockUser())) {
    throw new Error("Cet utilisateur ne peut pas lancer une mise a jour.");
  }

  const result = refreshCommandesListImport();
  revalidateAdminImports();
  return result;
}

export async function uploadWorkbookAction(formData: FormData) {
  if (!isAdminUser(await getCurrentStockUser())) {
    redirect("/?user=forbidden");
  }

  const fileValue = formData.get("workbook");
  const fileError = validateWorkbookFile(fileValue);
  if (fileError) redirect(`/admin?upload=${fileError}`);
  const workbookFile = fileValue as File;

  try {
    const workbookPath = await saveUploadedWorkbook(workbookFile);
    startBackgroundFullImport(workbookPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("Worksheet Data does not exist")) {
      redirect("/admin?upload=stockonly");
    }

    if (message.includes("Worksheet entrer does not exist")) {
      redirect("/admin?upload=sheet");
    }

    redirect(buildUploadErrorRedirect(message || "Erreur inconnue."));
  }

  revalidateAdminImports();
  redirect("/admin?upload=queued");
}

export async function uploadDataWorkbookAction(formData: FormData) {
  if (!isAdminUser(await getCurrentStockUser())) {
    redirect("/?user=forbidden");
  }

  const fileValue = formData.get("workbook");
  const fileError = validateWorkbookFile(fileValue);
  if (fileError) redirect(`/admin?upload=data-${fileError}`);
  const workbookFile = fileValue as File;

  try {
    const workbookPath = await saveUploadedWorkbook(workbookFile, "upload-data.xlsm");
    refreshArticlesImport(workbookPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Worksheet Data does not exist")) {
      redirect("/admin?upload=data-sheet");
    }
    redirect(`/admin?upload=data-error&detail=${encodeURIComponent((message || "Import Data inconnu.").slice(0, 500))}`);
  }

  revalidateAdminImports();
  redirect("/admin?upload=data-ok");
}

export async function uploadEntrerWorkbookAction(formData: FormData) {
  if (!isAdminUser(await getCurrentStockUser())) {
    redirect("/?user=forbidden");
  }

  const fileValue = formData.get("workbook");
  const fileError = validateWorkbookFile(fileValue);
  if (fileError) redirect(`/admin?upload=entrer-${fileError}`);
  const workbookFile = fileValue as File;

  try {
    const workbookPath = await saveUploadedWorkbook(workbookFile, "upload-entrer.xlsm");
    try {
      refreshArticlesImport(workbookPath);
    } catch {
      // Continue: stock-only files may not include a Data sheet.
    }
    refreshLotsImport(workbookPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Worksheet entrer does not exist")) {
      redirect("/admin?upload=entrer-sheet");
    }
    redirect(`/admin?upload=entrer-error&detail=${encodeURIComponent((message || "Import entrer inconnu.").slice(0, 500))}`);
  }

  revalidateAdminImports();
  redirect("/admin?upload=entrer-ok");
}

export async function uploadCommandeWorkbookAction(formData: FormData) {
  if (!isAdminUser(await getCurrentStockUser())) {
    redirect("/?user=forbidden");
  }

  const fileValue = formData.get("workbook");
  const fileError = validateWorkbookFile(fileValue);
  if (fileError) redirect(`/admin?upload=commande-${fileError}`);
  const workbookFile = fileValue as File;

  try {
    const workbookPath = await saveUploadedWorkbook(workbookFile, "upload-commande.xlsm");
    refreshCommandesListImport(workbookPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    redirect(`/admin?upload=commande-error&detail=${encodeURIComponent((message || "Import commandes inconnu.").slice(0, 500))}`);
  }

  revalidateAdminImports();
  redirect("/admin?upload=commande-ok");
}

export async function uploadClientsWorkbookAction(formData: FormData) {
  if (!isAdminUser(await getCurrentStockUser())) {
    redirect("/?user=forbidden");
  }

  const fileValue = formData.get("workbook");
  const fileError = validateWorkbookFile(fileValue);
  if (fileError) redirect(`/admin?upload=clients-${fileError}`);
  const workbookFile = fileValue as File;

  try {
    const workbookPath = await saveUploadedWorkbook(workbookFile, "upload-clients.xlsx");
    refreshClientsImport(workbookPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    redirect(`/admin?upload=clients-error&detail=${encodeURIComponent((message || "Import clients inconnu.").slice(0, 500))}`);
  }

  revalidateAdminImports();
  redirect("/admin?upload=clients-ok");
}
