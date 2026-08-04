"use client";

import { usePathname } from "next/navigation";
import { findPageForPath } from "@/lib/page-registry";
import { isSectionVisible } from "@/lib/nav-sections";

export function RouteAccessGate({
  children,
  currentUser,
  pageViewMap,
  canManageUsers,
}: {
  children: React.ReactNode;
  currentUser: string;
  pageViewMap: Record<string, boolean>;
  canManageUsers: boolean;
}) {
  const pathname = usePathname();

  let allowed: boolean;

  if (pathname === "/" || pathname.startsWith("/test-supabase")) {
    allowed = true;
  } else if (pathname.startsWith("/admin")) {
    allowed = canManageUsers;
  } else {
    const page = findPageForPath(pathname);
    // Meme regle que la nav/l'accueil : un hub (ex: gestionStockPf) reste
    // accessible si l'utilisateur voit le hub LUI-MEME ou au moins une page
    // a l'interieur - sinon un acces donne uniquement sur une sous-page
    // (ex: Articles Produit Fini) bloquait completement le hub avec "Cette
    // page n'est pas visible", alors que la page hub elle-meme filtre deja
    // ses propres tuiles selon ce que l'utilisateur peut voir.
    allowed = page ? isSectionVisible(page.key, pageViewMap) : true;
  }

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <main className="px-6 py-10 lg:px-10">
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">
          Acces non autorise
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          Cette page n&apos;est pas visible pour {currentUser}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Mayoub peut regler dans Admin ce que chaque utilisateur peut voir ou modifier.
        </p>
      </section>
    </main>
  );
}
