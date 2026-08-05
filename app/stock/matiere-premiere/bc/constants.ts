export const STATUT_BC_OPTIONS = ["Stand", "En cours", "Termine", "Receptionne"] as const;

export type StatutBc = (typeof STATUT_BC_OPTIONS)[number];

// Le statut se deduit UNIQUEMENT de la quantite deja importee par rapport a
// la quantite commandee - le statut "Receptionne" pose cote Import (bouton
// Reception sur un dossier Import) n'influence plus ce calcul, les 2 cotes
// sont volontairement independants. Seul le bouton "Termine" (marque a la
// main sur cette page) peut forcer le statut, meme s'il reste une quantite
// a importer.
export function computeStatutBc(
  quantite: number,
  quantiteImportee: number,
  dbStatut?: string | null
): StatutBc {
  if (dbStatut === "Termine") return "Termine";
  if (quantiteImportee <= 0) return "Stand";
  if (quantiteImportee >= quantite) return "Termine";
  return "En cours";
}

export function statutBcBadgeClass(statut: StatutBc) {
  switch (statut) {
    case "Stand":
      return "bg-slate-100 text-slate-800";
    case "En cours":
      return "bg-amber-100 text-amber-800";
    case "Termine":
      return "bg-emerald-100 text-emerald-800";
    case "Receptionne":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
}
