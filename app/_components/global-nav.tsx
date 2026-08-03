"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  pageKey?: string;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "Accueil" },
  { href: "/articles", label: "Articles", pageKey: "articlesHub" },
  { href: "/stock", label: "Stock", pageKey: "stock" },
  { href: "/commandes", label: "Commandes", pageKey: "commandesListe" },
  { href: "/tableau-commandes", label: "Tableau cmd", pageKey: "tableauCommandes" },
  { href: "/stock-dormant", label: "Dormant", pageKey: "stockDormant" },
  {
    href: "/stock-dormant-sans-commande",
    label: "Dormant sans cmd",
    pageKey: "stockDormantSansCommande",
  },
  { href: "/production", label: "Production", pageKey: "productionHub" },
  { href: "/mouvements", label: "Mouvements", pageKey: "mouvementsHub" },
  { href: "/statistique", label: "Statistique", pageKey: "statistiqueHub" },
  { href: "/clients", label: "Client", pageKey: "clients" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

export function GlobalNav({
  pageViewMap,
  canManageUsers,
}: {
  pageViewMap: Record<string, boolean>;
  canManageUsers: boolean;
}) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly) return canManageUsers;
    if (!item.pageKey) return true;
    return pageViewMap[item.pageKey] ?? false;
  });
  const currentItem =
    visibleItems.find((item) =>
      item.href === "/"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`)
    ) ?? visibleItems[0];
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full flex-col gap-4 px-4 py-4 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-rodis.jpg"
              alt="Logo Rodis"
              className="h-12 w-12 shrink-0 object-contain"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-amber-700">
                ERP Rodis
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-lg font-black tracking-tight text-slate-950">
                  Gestion depot PF
                </h1>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">
                  Page : {currentItem.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Fait par Mohamed Ayoub
              </p>
            </div>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "bg-amber-500 text-white shadow-[0_10px_25px_rgba(245,158,11,0.28)]"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-900 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
