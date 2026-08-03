export const STATUT_BC_OPTIONS = ["Stand", "En cours", "Termine"] as const;

export type StatutBc = (typeof STATUT_BC_OPTIONS)[number];

// Le statut n'est jamais saisi a la main - il se deduit toujours de la
// quantite deja importee par rapport a la quantite commandee.
export function computeStatutBc(quantite: number, quantiteImportee: number): StatutBc {
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
    default:
      return "bg-slate-100 text-slate-800";
  }
}
