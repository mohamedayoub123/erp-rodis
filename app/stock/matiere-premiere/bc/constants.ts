export const STATUT_BC_OPTIONS = ["Stand", "En cours", "Termine", "Receptionne"] as const;

export type StatutBc = (typeof STATUT_BC_OPTIONS)[number];

// Le statut se deduit normalement de la quantite deja importee par rapport
// a la quantite commandee - sauf si la ligne a ete marquee "Receptionne" a
// la main (bouton Reception sur le detail d'un dossier Import), auquel cas
// ce statut prime toujours, meme si la quantite recue est plus petite ou
// plus grande que la quantite commandee.
export function computeStatutBc(
  quantite: number,
  quantiteImportee: number,
  dbStatut?: string | null
): StatutBc {
  if (dbStatut === "Receptionne") return "Receptionne";
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
