"use client";

import type { DonneesAlerte } from "@/lib/stock-alert-excel-donnees";

// Bouton Excel des pages Stock Alert : le fichier reprend les couleurs de l'ecran (lignes colorees, BC / imports en bleu), texte a la ligne,
// tout en haut a gauche des cellules - voir lib/classeur-stock-alert.ts (bibliotheque chargee seulement au clic).
export function ExportAlerteButton({ donnees, nomFichier }: { donnees: DonneesAlerte; nomFichier: string }) {
  async function exporter() {
    const { telechargerClasseurAlerte } = await import("@/lib/classeur-stock-alert");
    await telechargerClasseurAlerte(donnees, nomFichier);
  }

  return (
    <button
      type="button"
      onClick={exporter}
      aria-label="Exporter en Excel"
      title="Exporter en Excel (couleurs de l'ERP)"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:border-slate-400"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#1D6F42" />
        <path d="M7 7.5 10.6 12 7 16.5h2.1L11.6 13l2.5 3.5h2.1L12.6 12l3.6-4.5h-2.1l-2.5 3.4-2.5-3.4H7Z" fill="#ffffff" />
      </svg>
    </button>
  );
}
