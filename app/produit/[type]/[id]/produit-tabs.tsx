"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProduitTabs({ type, id }: { type: string; id: number }) {
  const pathname = usePathname();
  const base = `/produit/${type}/${id}`;
  const tabs = [
    { href: base, label: "Stock" },
    { href: `${base}/statistique`, label: "Statistique" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              isActive
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
