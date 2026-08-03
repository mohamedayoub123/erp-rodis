export const STATUT_DOSSIER_MP_OPTIONS = [
  "Fabrication",
  "Import",
  "Receptionne au port",
  "Receptionne Rodis",
] as const;

export type StatutDossierMp = (typeof STATUT_DOSSIER_MP_OPTIONS)[number];

export function statutDossierMpBadgeClass(statut: string) {
  switch (statut) {
    case "Fabrication":
      return "bg-slate-100 text-slate-800";
    case "Import":
      return "bg-amber-100 text-amber-800";
    case "Receptionne au port":
      return "bg-sky-100 text-sky-800";
    case "Receptionne Rodis":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
}
