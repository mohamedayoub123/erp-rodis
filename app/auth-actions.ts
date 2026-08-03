"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkLoginLockout,
  clearFailedLogins,
  clearStockSession,
  createStockSession,
  getCurrentStockUser,
  recordFailedLogin,
  updateStockPassword,
  verifyStockPassword,
} from "@/lib/stock-auth";

const LOGIN_ERROR_COOKIE = "erp_login_error";
const PASSWORD_ERROR_COOKIE = "erp_password_error";
const PASSWORD_SUCCESS_COOKIE = "erp_password_success";

export async function loginSiteAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const cookieStore = await cookies();

  const lockout = checkLoginLockout(username);
  if (lockout.locked) {
    const minutes = Math.max(1, Math.ceil(lockout.retryAfterSeconds / 60));
    cookieStore.set(
      LOGIN_ERROR_COOKIE,
      `Trop d'essais incorrects. Reessaie dans ${minutes} minute(s).`,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 10,
      }
    );
    redirect("/");
  }

  if (!verifyStockPassword(username, password)) {
    recordFailedLogin(username);
    cookieStore.set(LOGIN_ERROR_COOKIE, "Utilisateur ou mot de passe incorrect.", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8,
    });
    redirect("/");
  }

  clearFailedLogins(username);
  cookieStore.delete(LOGIN_ERROR_COOKIE);
  await createStockSession(username);
  redirect("/");
}

export async function logoutSiteAction() {
  const cookieStore = await cookies();
  cookieStore.delete(LOGIN_ERROR_COOKIE);
  await clearStockSession();
  redirect("/");
}

export async function changePasswordAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  const cookieStore = await cookies();

  cookieStore.delete(PASSWORD_ERROR_COOKIE);
  cookieStore.delete(PASSWORD_SUCCESS_COOKIE);

  if (!currentUser) {
    redirect("/");
  }

  const oldPassword = String(formData.get("oldPassword") || "").trim();
  const newPassword = String(formData.get("newPassword") || "").trim();
  const confirmPassword = String(formData.get("confirmPassword") || "").trim();

  if (!verifyStockPassword(currentUser, oldPassword)) {
    cookieStore.set(PASSWORD_ERROR_COOKIE, "Ancien mot de passe incorrect.", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10,
    });
    redirect("/");
  }

  if (newPassword.length < 1) {
    cookieStore.set(PASSWORD_ERROR_COOKIE, "Ecris un nouveau mot de passe.", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10,
    });
    redirect("/");
  }

  if (newPassword !== confirmPassword) {
    cookieStore.set(PASSWORD_ERROR_COOKIE, "La confirmation ne correspond pas au nouveau mot de passe.", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10,
    });
    redirect("/");
  }

  updateStockPassword(currentUser, newPassword);

  cookieStore.set(PASSWORD_SUCCESS_COOKIE, "Mot de passe change avec succes.", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10,
  });

  redirect("/");
}
