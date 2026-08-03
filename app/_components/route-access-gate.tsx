"use client";

import { usePathname } from "next/navigation";
import { findPageForPath } from "@/lib/page-registry";

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
    allowed = page ? pageViewMap[page.key] ?? false : true;
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
