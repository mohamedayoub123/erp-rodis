import { computePlCodesFromRows } from "@/lib/programme-numbering";

// Code PL1.2026, PL2.2026... d'un groupe de programme. Le numero est attribue
// une seule fois et enregistre (voir lib/document-numbers.ts) : supprimer un
// programme ne decale plus les autres. Les lignes sans groupe_id sont ignorees
// (jamais rattachees a un lot).
export async function computePlCodesByGroupeId(
  rows: { groupe_id: number | null; created_at: string; date_jour: string }[]
): Promise<Map<number, string>> {
  const lignes = rows
    .filter((row): row is { groupe_id: number; created_at: string; date_jour: string } => row.groupe_id !== null)
    .map((row) => ({
      id: row.groupe_id,
      groupe_id: row.groupe_id,
      created_at: row.created_at,
      date_jour: row.date_jour,
    }));

  return computePlCodesFromRows(lignes);
}
