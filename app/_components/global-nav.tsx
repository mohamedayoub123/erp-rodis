"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  pageKey?: string;
  adminOnly?: boolean;
  // Prefixes utilises seulement pour determiner le badge "Page : X" affiche
  // dans l'en-tete quand on est sur une sous-page qui n'a plus son propre
  // onglet (ex: /articles/produit-fini reste sous "Gestion Stock PF"). Le
  // plus long prefixe qui matche gagne, meme principe que PAGE_REGISTRY.
  matchPrefixes?: string[];
};

const navItems: NavItem[] = [
  { href: "/", label: "Accueil" },
  {
    href: "/gestion-stock-pf",
    label: "Gestion Stock PF",
    pageKey: "gestionStockPf",
    matchPrefixes: [
      "/gestion-stock-pf",
      "/stock",
      "/articles",
      "/mouvements",
      "/commandes",
      "/tableau-commandes",
      "/stock-dormant",
      "/stock-dormant-sans-commande",
      "/clients",
      "/statistique",
      "/statistique-livraison",
      "/statistique-livraison-client",
    ],
  },
  {
    href: "/stock/matiere-premiere",
    label: "Gestion Stock MP",
    pageKey: "stockMatierePremiere",
    matchPrefixes: [
      "/stock/matiere-premiere",
      "/mouvements/matiere-premiere",
      "/articles/matiere-premiere",
    ],
  },
  {
    href: "/production",
    label: "Production",
    pageKey: "productionHub",
    matchPrefixes: [
      "/production",
      "/programe-par-ligne",
      "/historique-programme",
      "/historique-programme-dispatcher",
      "/ravitailleur-par-ligne",
      "/code-par-article",
    ],
  },
  { href: "/admin", label: "Admin", adminOnly: true },
];

function prefixMatchLength(prefixes: string[], pathname: string): number {
  let best = -1;
  for (const prefix of prefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (prefix.length > best) best = prefix.length;
    }
  }
  return best;
}

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
    visibleItems.reduce<{ item: NavItem; length: number } | null>((bestMatch, item) => {
      const length =
        item.href === "/"
          ? pathname === "/"
            ? 1
            : -1
          : prefixMatchLength(item.matchPrefixes ?? [item.href], pathname);

      if (length > (bestMatch?.length ?? -1)) return { item, length };
      return bestMatch;
    }, null)?.item ?? visibleItems[0];
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
                  FluxPilote
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
            const isActive = item === currentItem;

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
