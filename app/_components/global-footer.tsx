"use client";

import Link from "next/link";

const workflowLinks = [
  { href: "/operations", label: "Centre d'actions" },
  { href: "/admin", label: "1. Mettre a jour" },
  { href: "/stock", label: "2. Verifier stock" },
  { href: "/commandes#nouvelle-commande", label: "3. Saisir commande" },
  { href: "/fifo", label: "4. Controler FIFO" },
];

const actionLinks = [
  { href: "/operations", label: "Ouvrir operations" },
  { href: "/mouvements/produit-fini#entree-stock", label: "Entrer stock" },
  { href: "/mouvements/produit-fini#sortie-stock", label: "Sortir stock" },
  { href: "/stock-dormant", label: "Voir dormant" },
  { href: "/dashboard", label: "Ouvrir dashboard" },
];

export function GlobalFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-white/90">
      <div className="mx-auto grid w-full gap-6 px-4 py-6 lg:grid-cols-[1.2fr_1fr_1fr] lg:px-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
            ERP Rodis
          </p>
          <h2 className="text-lg font-black tracking-tight text-slate-950">
            Base web locale de travail
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            Adresse locale : <span className="font-semibold">http://localhost:3000</span>
          </p>
          <p className="text-sm leading-6 text-slate-600">
            Le site reste ouvert tant que le terminal du serveur local reste lance.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Parcours rapide
          </p>
          <div className="flex flex-wrap gap-2">
            {workflowLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Actions directes
          </p>
          <div className="flex flex-wrap gap-2">
            {actionLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

