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
  getCurrentStockUser,
  isAdminUser,
  updateUserPermissions,
  type PagePermissions,
} from "@/lib/stock-auth";
import { PAGE_REGISTRY } from "@/lib/page-registry";
import { resolveWorkbookPath, saveUploadedWorkbook } from "@/lib/workbook-path";

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

  if (!isAdminUser(currentUser)) {
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

  const created = createStockUser(username, password);

  if (!created) {
    redirect("/admin?user=exists");
  }

  revalidatePath("/admin");
  redirect("/admin?user=ok");
}

function readPermissionFlag(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim() === "on";
}

export async function deleteUserAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!isAdminUser(currentUser)) {
    redirect("/?user=forbidden");
  }

  const username = String(formData.get("username") || "").trim().toLowerCase();

  if (!username) {
    redirect("/admin?user=delete-empty");
  }

  const deleted = deleteStockUser(username);

  if (!deleted) {
    redirect("/admin?user=delete-error");
  }

  revalidatePath("/admin");
  redirect("/admin?user=delete-ok");
}

export async function updateUserPermissionsAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!isAdminUser(currentUser)) {
    redirect("/?user=forbidden");
  }

  const username = String(formData.get("username") || "").trim().toLowerCase();

  if (!username) {
    redirect("/admin?user=perm-empty");
  }

  const pages: PagePermissions = {};

  for (const page of PAGE_REGISTRY) {
    pages[page.key] = {
      view: readPermissionFlag(formData, `page__${page.key}__view`),
      write: page.hasWrite === false ? false : readPermissionFlag(formData, `page__${page.key}__write`),
    };
  }

  const nextPermissions = {
    pages,
    deleteCommandes: readPermissionFlag(formData, "deleteCommandes"),
    changeStatusCommandes: readPermissionFlag(formData, "changeStatusCommandes"),
    manageUsers: readPermissionFlag(formData, "manageUsers"),
  };

  const updated = updateUserPermissions(username, nextPermissions);

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
  const result = refreshArticlesImport(resolveWorkbookPath());
  revalidatePath("/");
  revalidatePath("/articles/produit-fini");
  revalidatePath("/data");
  revalidatePath("/commandes");
  revalidatePath("/mouvements/produit-fini");
  return result;
}

export async function refreshStockAction() {
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
  const workbookPath = resolveWorkbookPath();

  refreshArticlesImport(workbookPath);
  refreshLotsImport(workbookPath);

  revalidateAdminImports();

  return "Mise a jour Excel terminee.";
}

export async function refreshCommandesListAction() {
  const result = refreshCommandesListImport();
  revalidateAdminImports();
  return result;
}

export async function uploadWorkbookAction(formData: FormData) {
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
