import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import {
  changePasswordAction,
  loginSiteAction,
  logoutSiteAction,
} from "@/app/auth-actions";
import {
  getCurrentStockUser,
  getPageViewMap,
  getUserPermissions,
} from "@/lib/stock-auth";
import { GlobalFooter } from "./_components/global-footer";
import { GlobalNav } from "./_components/global-nav";
import { RouteAccessGate } from "./_components/route-access-gate";
import { ServiceWorkerRegister } from "./_components/service-worker-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ERP Rodis",
  description: "Gestion web du stock depot PF, commandes, FIFO et stock dormant",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ERP Rodis",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0c4a6e",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentStockUser();
  const cookieStore = await cookies();
  const loginErrorRaw = cookieStore.get("erp_login_error")?.value || "";
  const loginError = loginErrorRaw === "1" ? "Utilisateur ou mot de passe incorrect." : loginErrorRaw;
  const passwordError = cookieStore.get("erp_password_error")?.value || "";
  const passwordSuccess = cookieStore.get("erp_password_success")?.value || "";
  const pageViewMap = await getPageViewMap(currentUser);
  const canManageUsers = (await getUserPermissions(currentUser)).manageUsers;

  if (!currentUser) {
    return (
      <html
        lang="fr"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_48%,#ffffff_100%)] text-slate-900">
          <ServiceWorkerRegister />
          <main className="flex min-h-screen items-center justify-center px-6 py-10">
            <section className="w-full max-w-md rounded-[2rem] border border-black/5 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
              <p className="inline-flex rounded-full bg-amber-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-900">
                ERP Rodis
              </p>

              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950">
                Connexion
              </h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Quand tu ouvres le systeme, tout reste ferme ici. Ecris ton
                utilisateur et ton mot de passe pour ouvrir tout le site.
              </p>

              {loginError ? (
                <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {loginError}
                </p>
              ) : null}

              <form action={loginSiteAction} className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Utilisateur
                  </label>
                  <input
                    type="text"
                    name="username"
                    placeholder="Exemple : mayoub"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    autoComplete="username"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Ton mot de passe"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Ouvrir le systeme
                </button>
              </form>
            </section>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#f7f3ea] pb-24 text-slate-900 md:pb-0">
        <ServiceWorkerRegister />
        <div className="min-h-full">
          <GlobalNav pageViewMap={pageViewMap} canManageUsers={canManageUsers} />
          <div className="flex min-h-[calc(100vh-132px)] flex-col">
            <div className="no-print mx-auto flex w-full flex-wrap items-center justify-between gap-3 px-4 pt-5 lg:px-8">
              <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                Utilisateur : {currentUser}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <details className="group relative">
                  <summary className="list-none rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
                    Changer mot de passe
                  </summary>

                  <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.16)]">
                    <p className="text-sm font-bold text-slate-900">
                      Changer mot de passe
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Ecris l&apos;ancien mot de passe, puis le nouveau.
                    </p>

                    {passwordError ? (
                      <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                        {passwordError}
                      </p>
                    ) : null}

                    {passwordSuccess ? (
                      <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                        {passwordSuccess}
                      </p>
                    ) : null}

                    <form action={changePasswordAction} className="mt-3 space-y-3">
                      <input
                        type="password"
                        name="oldPassword"
                        placeholder="Ancien mot de passe"
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
                        required
                      />
                      <input
                        type="password"
                        name="newPassword"
                        placeholder="Nouveau mot de passe"
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
                        required
                      />
                      <input
                        type="password"
                        name="confirmPassword"
                        placeholder="Confirmer le mot de passe"
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
                        required
                      />
                      <button
                        type="submit"
                        className="w-full rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Confirmer
                      </button>
                    </form>
                  </div>
                </details>
                <form action={logoutSiteAction}>
                  <button
                    type="submit"
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Deconnexion
                  </button>
                </form>
              </div>
            </div>
            <RouteAccessGate
              currentUser={currentUser}
              pageViewMap={pageViewMap}
              canManageUsers={canManageUsers}
            >
              <div className="flex-1">{children}</div>
            </RouteAccessGate>
            <GlobalFooter />
          </div>
        </div>
      </body>
    </html>
  );
}

