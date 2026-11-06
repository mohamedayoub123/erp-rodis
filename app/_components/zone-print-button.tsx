"use client";

import { useEffect } from "react";

export function ZonePrintButton({ zone, iconOnly = false }: { zone: string; iconOnly?: boolean }) {
  useEffect(() => {
    function clearPrintMode() {
      document.documentElement.removeAttribute("data-print-mode");
      for (const bloc of document.querySelectorAll("[data-print-cible]")) bloc.removeAttribute("data-print-cible");
    }

    window.addEventListener("afterprint", clearPrintMode);
    return () => window.removeEventListener("afterprint", clearPrintMode);
  }, []);

  function handlePrint() {
    // Le bloc de CETTE zone est marque : l'impression (globals.css) cache tous les autres blocs [data-print-zone] et montre
    // celui-la, quelle que soit la zone (une zone ajoutee sur /production/machines s'imprime sans toucher au CSS).
    for (const bloc of document.querySelectorAll("[data-print-cible]")) bloc.removeAttribute("data-print-cible");
    for (const bloc of document.querySelectorAll("[data-print-zone]")) {
      if (bloc.getAttribute("data-print-zone") === zone) bloc.setAttribute("data-print-cible", "");
    }
    document.documentElement.setAttribute("data-print-mode", zone);
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      title={`Imprimer ${zone}`}
      aria-label={`Imprimer ${zone}`}
      className={`no-print inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 ${
        iconOnly ? "h-10 w-10 justify-center" : "px-4 py-2"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      {iconOnly ? null : `Imprimer ${zone}`}
    </button>
  );
}
