"use client";

import type { DonneesManque } from "@/lib/classeur-manque-articles";

// Bouton Excel des tableaux de Manque Articles : colonne Manque en rouge, texte a la ligne pour les BC / imports, tout commence en haut a
// gauche des cellules - voir lib/classeur-manque-articles.ts (bibliotheque chargee seulement au clic).
export function ExportManqueButton({ donnees, nomFichier }: { donnees: DonneesManque; nomFichier: string }) {
  async function exporter() {
    const { telechargerClasseurManque } = await import("@/lib/classeur-manque-articles");
    await telechargerClasseurManque(donnees, nomFichier);
  }

  return (
    <button
      type="button"
      onClick={exporter}
      aria-label="Exporter en Excel"
      title="Exporter en Excel (manque en rouge, BC / imports a la ligne)"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:border-slate-400"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#1D6F42" />
        <path d="M7 7.5 10.6 12 7 16.5h2.1L11.6 13l2.5 3.5h2.1L12.6 12l3.6-4.5h-2.1l-2.5 3.4-2.5-3.4H7Z" fill="#ffffff" />
      </svg>
    </button>
  );
}
