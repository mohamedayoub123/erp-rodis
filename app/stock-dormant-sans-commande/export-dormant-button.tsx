"use client";

import type { DonneesDormant } from "@/lib/classeur-dormant";

// Bouton Excel de la page Stock dormant sans commande : exporte les lots affiches (memes filtres, toutes les pages) avec la forme et les couleurs de
// l'ecran, voir lib/classeur-dormant.ts (bibliotheque chargee seulement au clic).
export function ExportDormantButton({ donnees, nomFichier }: { donnees: DonneesDormant; nomFichier: string }) {
  async function exporter() {
    const { telechargerClasseurDormant } = await import("@/lib/classeur-dormant");
    await telechargerClasseurDormant(donnees, nomFichier);
  }

  return (
    <button
      type="button"
      onClick={exporter}
      aria-label="Exporter en Excel"
      title="Exporter en Excel (meme forme et memes couleurs que l'ecran)"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:border-slate-400"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#1D6F42" />
        <path d="M7 7.5 10.6 12 7 16.5h2.1L11.6 13l2.5 3.5h2.1L12.6 12l3.6-4.5h-2.1l-2.5 3.4-2.5-3.4H7Z" fill="#ffffff" />
      </svg>
    </button>
  );
}
