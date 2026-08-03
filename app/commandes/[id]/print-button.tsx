"use client";

import { useEffect } from "react";

export function PrintButton({
  mode,
  label,
}: {
  mode: "commande" | "dispatch";
  label: string;
}) {
  useEffect(() => {
    function clearPrintMode() {
      document.documentElement.removeAttribute("data-print-mode");
    }

    window.addEventListener("afterprint", clearPrintMode);
    return () => window.removeEventListener("afterprint", clearPrintMode);
  }, []);

  function handlePrint() {
    document.documentElement.setAttribute("data-print-mode", mode);
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
    >
      {label}
    </button>
  );
}
