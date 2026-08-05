// Calcule le code PL1.2026, PL2.2026... (remis a 1 chaque nouvelle annee de
// date_jour, rang par ordre de creation du groupe) a partir de TOUTES les
// lignes programme_lignes - meme principe que TE1/TS1 dans Mouvements. Le
// code n'est pas stocke en base, il est toujours recalcule a la lecture.
export function computePlCodesByGroupeId(
  rows: { groupe_id: number | null; created_at: string; date_jour: string }[]
): Map<number, string> {
  const earliestByGroup = new Map<number, { createdAt: string; dateJourForYear: string }>();
  for (const row of rows) {
    if (row.groupe_id === null) continue;
    const current = earliestByGroup.get(row.groupe_id);
    if (!current || new Date(row.created_at).getTime() < new Date(current.createdAt).getTime()) {
      earliestByGroup.set(row.groupe_id, { createdAt: row.created_at, dateJourForYear: row.date_jour });
    }
  }

  const orderedGroupIds = [...earliestByGroup.entries()]
    .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
    .map(([groupeId, info]) => ({ groupeId, annee: new Date(info.dateJourForYear).getFullYear() }));

  const rankByYear = new Map<number, number>();
  const codeByGroupeId = new Map<number, string>();
  for (const entry of orderedGroupIds) {
    const rank = (rankByYear.get(entry.annee) ?? 0) + 1;
    rankByYear.set(entry.annee, rank);
    codeByGroupeId.set(entry.groupeId, `PL${rank}.${entry.annee}`);
  }
  return codeByGroupeId;
}
