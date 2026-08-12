import { supabaseServer } from "@/lib/supabase-server";

// Calcule les codes PL1.2026, PL2.2026... et PD1, PD2... UNE SEULE FOIS ici,
// partages par les pages liste ET detail de "Historique programme" et
// "Historique Programme Dispatcher" - avant, chaque page recalculait le
// rang independamment, et la page liste prenait a tort la ligne la PLUS
// RECENTE de chaque groupe (rows[0] d'un fetch trie created_at DESC) comme
// representative, alors que la page detail prenait la ligne la PLUS
// ANCIENNE (vrai MIN) - un groupe dont les lignes n'ont pas exactement le
// meme created_at pouvait donc afficher un numero different entre la liste
// et le detail. Une seule fonction de calcul (prenant des lignes deja
// chargees, pour eviter un aller-retour DB en double quand l'appelant les a
// deja), plus de divergence possible.

export type PlGroupRow = { id: number; groupe_id: number | null; date_jour: string; created_at: string };

// Les lignes sans groupe_id (jamais rattachees a un lot) sont chacune leur
// propre groupe solo via leur propre id - meme principe partout (voir
// app/historique-programme/page.tsx) pour ne jamais les fusionner a tort
// ensemble juste parce qu'elles partagent toutes la valeur JS "null".
function plGroupKey(row: { groupe_id: number | null; id: number }): number {
  return row.groupe_id ?? row.id;
}

// Calcule groupeId -> "PLn.annee" a partir de lignes DEJA chargees (evite un
// 2eme aller-retour DB quand l'appelant a deja tout programme_lignes).
export function computePlCodesFromRows(rows: PlGroupRow[]): Map<number, string> {
  const earliestByGroup = new Map<number, { createdAt: string; dateJour: string }>();
  for (const row of rows) {
    const key = plGroupKey(row);
    const current = earliestByGroup.get(key);
    if (!current || new Date(row.created_at).getTime() < new Date(current.createdAt).getTime()) {
      earliestByGroup.set(key, { createdAt: row.created_at, dateJour: row.date_jour });
    }
  }

  const orderedGroups = [...earliestByGroup.entries()].sort(
    (a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime()
  );

  const rankByYear = new Map<number, number>();
  const codeByGroupId = new Map<number, string>();
  for (const [groupeId, info] of orderedGroups) {
    const annee = new Date(info.dateJour).getFullYear();
    const rank = (rankByYear.get(annee) ?? 0) + 1;
    rankByYear.set(annee, rank);
    codeByGroupId.set(groupeId, `PL${rank}.${annee}`);
  }

  return codeByGroupId;
}

async function fetchAllPlGroupRows(): Promise<PlGroupRow[]> {
  const rows: PlGroupRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, groupe_id, date_jour, created_at")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as PlGroupRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Retourne groupeId -> "PLn.annee" pour TOUS les groupes programme_lignes -
// pour un appelant qui n'a pas deja charge les lignes lui-meme.
export async function fetchPlCodeByGroupeId(): Promise<Map<number, string>> {
  return computePlCodesFromRows(await fetchAllPlGroupRows());
}

export type PdGroupRow = { id: number; groupe_id: number | null; created_at: string };

// Calcule groupeId -> "PDn" a partir de lignes DEJA chargees.
export function computePdCodesFromRows(rows: PdGroupRow[]): Map<number, string> {
  const earliestByGroup = new Map<number, string>();
  for (const row of rows) {
    if (row.groupe_id === null) continue;
    const current = earliestByGroup.get(row.groupe_id);
    if (!current || new Date(row.created_at).getTime() < new Date(current).getTime()) {
      earliestByGroup.set(row.groupe_id, row.created_at);
    }
  }

  const orderedGroupIds = [...earliestByGroup.entries()].sort(
    (a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime()
  );

  const codeByGroupId = new Map<number, string>();
  orderedGroupIds.forEach(([groupeId], index) => {
    codeByGroupId.set(groupeId, `PD${index + 1}`);
  });

  return codeByGroupId;
}

async function fetchAllPdGroupRows(): Promise<(PdGroupRow & { source_groupe_id: number | null })[]> {
  const rows: (PdGroupRow & { source_groupe_id: number | null })[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("id, groupe_id, source_groupe_id, created_at")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as (PdGroupRow & { source_groupe_id: number | null })[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Retourne groupeId -> "PDn" pour TOUS les groupes programme_dispatcher_history.
export async function fetchPdCodeByGroupeId(): Promise<Map<number, string>> {
  return computePdCodesFromRows(await fetchAllPdGroupRows());
}

export type PdRef = { code: string; groupeId: number };

// Retourne source_groupe_id (le groupe_id programme_lignes d'origine) ->
// liste des PD dans lesquels ce programme a ete dispatche (un programme
// redispatche plusieurs fois peut avoir plusieurs PD) - pour la colonne "PD"
// sur Historique programme.
export async function fetchPdRefsBySourceGroupeId(): Promise<Map<number, PdRef[]>> {
  const rows = await fetchAllPdGroupRows();
  const pdCodeByGroupeId = computePdCodesFromRows(rows);

  const result = new Map<number, PdRef[]>();
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.groupe_id === null || row.source_groupe_id === null) continue;
    const code = pdCodeByGroupeId.get(row.groupe_id);
    if (!code) continue;

    const dedupeKey = `${row.source_groupe_id}::${row.groupe_id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const list = result.get(row.source_groupe_id) ?? [];
    list.push({ code, groupeId: row.groupe_id });
    result.set(row.source_groupe_id, list);
  }

  for (const list of result.values()) {
    list.sort((a, b) => a.groupeId - b.groupeId);
  }

  return result;
}
