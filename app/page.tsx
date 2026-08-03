import Link from "next/link";
import { getCurrentStockUser, getPageViewMap, getUserPermissions } from "@/lib/stock-auth";

const mainButtons = [
  {
    label: "Accueil",
    href: "/",
    icon: "\u{1F3E0}",
    accent: "from-orange-400 to-amber-300",
    panel: "bg-orange-50 text-orange-950 border-orange-200",
  },
  {
    label: "Gestion Stock PF",
    href: "/stock",
    icon: "\u{1F4CA}",
    accent: "from-emerald-500 to-teal-400",
    panel: "bg-emerald-50 text-emerald-950 border-emerald-200",
    pageKey: "stock" as const,
  },
  {
    label: "Gestion Stock MP",
    href: "/stock/matiere-premiere",
    icon: "\u{1F9EA}",
    accent: "from-cyan-600 to-sky-500",
    panel: "bg-cyan-50 text-cyan-950 border-cyan-200",
    pageKey: "stockMatierePremiere" as const,
  },
  {
    label: "Production",
    href: "/production",
    icon: "\u{1F3ED}",
    accent: "from-blue-500 to-cyan-400",
    panel: "bg-blue-50 text-blue-950 border-blue-200",
    pageKey: "productionHub" as const,
  },
  {
    label: "Admin",
    href: "/admin",
    icon: "\u{1F6E0}\u{FE0F}",
    accent: "from-rose-500 to-pink-500",
    panel: "bg-rose-50 text-rose-950 border-rose-200",
    adminOnly: true as const,
  },

];

export default async function HomePage() {
  const currentUser = await getCurrentStockUser();
  const pageViewMap = await getPageViewMap(currentUser);
  const canManageUsers = (await getUserPermissions(currentUser)).manageUsers;
  const visibleButtons = mainButtons.filter((button) => {
    if ("adminOnly" in button) return canManageUsers;
    const pageKey = "pageKey" in button ? button.pageKey : undefined;
    if (!pageKey) return true;
    return pageViewMap[pageKey] ?? false;
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] text-slate-900">
      <section className="mx-auto flex w-full max-w-[1800px] flex-col gap-8 px-4 py-8 lg:px-6">
        <div className="rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="inline-flex rounded-full bg-amber-100 px-4 py-1 text-sm font-semibold uppercase tracking-[0.18em] text-amber-900">
            ERP Rodis
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Accueil
          </h1>
          <p className="mt-2 text-base text-slate-600">
            Choisis seulement le module principal que tu veux ouvrir.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {visibleButtons.map((button) => (
              <Link
                key={button.href}
                href={button.href}
                className={`group flex aspect-square flex-col overflow-hidden rounded-[1.8rem] border shadow-[0_16px_36px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.14)] ${button.panel}`}
              >
                <div className={`flex flex-1 items-center justify-center bg-gradient-to-br ${button.accent}`}>
                  <div className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-white/20 text-5xl shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-sm transition group-hover:scale-105">
                    <span aria-hidden="true">{button.icon}</span>
                  </div>
                </div>
                <div className="border-t border-black/5 bg-white/85 px-3 py-4 text-center backdrop-blur">
                  <span className="block text-base font-bold leading-tight">
                    {button.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
