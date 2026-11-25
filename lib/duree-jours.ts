// Une duree en jours ecrite en mois + jours, avec 1 mois = 30 jours : 40 jours -> "1 mois et 10 j", 133 -> "4 mois et 13 j",
// 30 -> "1 mois", 10 -> "10 j". Les jours sont arrondis au jour le plus proche ; une valeur absente ou impossible donne "-".
export const JOURS_PAR_MOIS = 30;

export function joursEnMoisEtJours(jours: number | null | undefined): string {
  if (jours === null || jours === undefined || !Number.isFinite(jours)) return "-";
  const total = Math.max(0, Math.round(jours));
  const mois = Math.floor(total / JOURS_PAR_MOIS);
  const reste = total % JOURS_PAR_MOIS;
  if (mois === 0) return `${reste} j`;
  if (reste === 0) return `${mois} mois`;
  return `${mois} mois et ${reste} j`;
}
