import { supabaseServer } from "@/lib/supabase-server";

export type ProgrammeLigneRow = {
  id: number;
  groupe_id: number;
  zone: string;
  chaine: string;
  article_id: number | null;
  produit: string | null;
  qt_carton: number | null;
  vrac_a_fabriquer: number | null;
  plateforme: string | null;
  date_jour: string;
  created_at: string;
  vrac_termine: boolean;
  vrac_termine_date: string | null;
  carton_termine: boolean;
  carton_termine_date: string | null;
  emballage_termine: boolean;
  emballage_termine_date: string | null;
  numero_lot: string | null;
  numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
  programme_termine: boolean;
  programme_termine_date: string | null;
};

export type CartonEntryRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  quantite: number;
  date_jour: string;
};

export type VracEntryRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  quantite: number;
  date_jour: string;
};

export type EmballageEntryRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  quantite: number;
  date_jour: string;
};

// activeOnly: restreint a "programme_termine" false/NULL au niveau de la
// requete - le Dashboard et le Calendrier n'affichent jamais les lignes
// terminees (meme filtre applique cote JS depuis toujours), donc autant
// eviter de rapatrier des annees de lignes terminees a chaque chargement/
// auto-refresh. sinceDate: borne la fenetre a une date de debut - utilise
// par Rapport Ecarts en vue par defaut (sans recherche) pour eviter de
// rapatrier des annees d'historique a chaque chargement ; une recherche
// explicite (code/PD) repasse sans cette borne pour retrouver du vieux.
// confirmedOnly: n'affiche que les programmes valides via le Save de
// Ravitailleur par ligne (confirme_production=true) - un programme juste
// saisi depuis "Programme par ligne" reste visible/ajustable sur
// Ravitailleur mais ne doit pas encore apparaitre sur le Dashboard/
// Calendrier tant qu'il n'a pas ete confirme.
export async function fetchAllProgrammeLignes(options?: {
  activeOnly?: boolean;
  sinceDate?: string;
  confirmedOnly?: boolean;
}): Promise<{
  rows: ProgrammeLigneRow[];
  error: string | null;
}> {
  const rows: ProgrammeLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("programme_lignes")
      .select(
        "id, groupe_id, zone, chaine, article_id, produit, qt_carton, vrac_a_fabriquer, plateforme, date_jour, created_at, vrac_termine, vrac_termine_date, carton_termine, carton_termine_date, emballage_termine, emballage_termine_date, numero_lot, numero_lot_detail, programme_termine, programme_termine_date"
      );

    if (options?.activeOnly) {
      query = query.or("programme_termine.eq.false,programme_termine.is.null");
    }

    if (options?.confirmedOnly) {
      query = query.eq("confirme_production", true);
    }

    if (options?.sinceDate) {
      query = query.gte("date_jour", options.sinceDate);
    }

    const { data, error } = await query
      .order("date_jour", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { rows, error: error.message };

    const chunk = (data ?? []) as ProgrammeLigneRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

// ligneIds: restreint aux lignes de programme donnees (ex: seulement les
// lignes actives du Dashboard) - evite de rapatrier des annees d'entrees
// pour des lignes deja terminees et jamais affichees. Sans argument,
// comportement inchange (tout l'historique, utilise par Rapport Ecarts).
export async function fetchAllCartonEntries(ligneIds?: number[]): Promise<CartonEntryRow[]> {
  if (ligneIds && ligneIds.length === 0) return [];

  const rows: CartonEntryRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("production_carton_entries")
      .select("id, programme_ligne_id, code, quantite, date_jour");

    if (ligneIds) {
      query = query.in("programme_ligne_id", ligneIds);
    }

    const { data, error } = await query
      .order("date_jour", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as CartonEntryRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export async function fetchAllVracEntries(ligneIds?: number[]): Promise<VracEntryRow[]> {
  if (ligneIds && ligneIds.length === 0) return [];

  const rows: VracEntryRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("production_vrac_entries")
      .select("id, programme_ligne_id, code, quantite, date_jour");

    if (ligneIds) {
      query = query.in("programme_ligne_id", ligneIds);
    }

    const { data, error } = await query
      .order("date_jour", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as VracEntryRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export async function fetchAllEmballageEntries(ligneIds?: number[]): Promise<EmballageEntryRow[]> {
  if (ligneIds && ligneIds.length === 0) return [];

  const rows: EmballageEntryRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("production_emballage_entries")
      .select("id, programme_ligne_id, code, quantite, date_jour");

    if (ligneIds) {
      query = query.in("programme_ligne_id", ligneIds);
    }

    const { data, error } = await query
      .order("date_jour", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as EmballageEntryRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}


// Une ligne "Programme par ligne" decoupee en plusieurs lots stocke ses
// codes joints dans numero_lot ("MB5, MB6, MB7") avec le total combine, et
// leur repartition qt_vrac/qt_carton figee au moment du Save dans
// numero_lot_detail (voir performProgrammeLigneSave) - cette fonction
// retourne la ligne telle quelle si elle n'a qu'un seul lot, sinon la
// divise en une ligne d'affichage par lot (son propre code + sa propre
// quantite prevue). numero_lot_detail est fige au Save et ne depend donc
// PAS de l'etat courant de programme_dispatcher_lignes (qui n'est qu'un
// instantane de la production EN COURS, vide et reecrit des qu'un Save
// ulterieur touche la meme zone/chaine, meme pour une tout autre ligne) -
// l'eclatement reste donc fiable indefiniment, meme longtemps apres que le
// Dispatcher soit passe a autre chose.
// Le "deja produit" n'est suivi qu'au niveau de la ligne combinee (pas par
// lot) - produitTotal est donc reparti en cascade sur les lots dans leur
// ordre d'apparition (le lot 1 se remplit avant le lot 2, etc., comme sur
// la vraie chaine de production), pour que "Restant" par ligne d'affichage
// reste coherent avec la quantite prevue affichee sur cette meme ligne au
// lieu de reprendre le restant combine des 3 lots.
export function splitLigneIntoDisplayRows<
  T extends {
    id: number;
    numero_lot: string | null;
    numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
  },
>(
  ligne: T,
  quantityField: "qt_vrac" | "qt_carton",
  produitTotal: number
): (T & { displayCode: string; displayQuantite: number | null; displayRestant: number | null })[] {
  const codes = (ligne.numero_lot || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

  const detail = ligne.numero_lot_detail ?? [];

  // Sans detail fige (ligne enregistree avant l'ajout de numero_lot_detail,
  // ou lot unique) on revient a l'affichage combine plutot que d'afficher
  // une repartition fausse ou incomplete.
  if (codes.length <= 1 || detail.length !== codes.length) {
    return [{ ...ligne, displayCode: ligne.numero_lot || "-", displayQuantite: null, displayRestant: null }];
  }

  let remainingProduit = produitTotal;

  return detail.map((entry) => {
    const batchQuantite = Number(entry[quantityField] ?? 0);
    const consumed = Math.min(batchQuantite, Math.max(0, remainingProduit));
    remainingProduit -= consumed;

    return {
      ...ligne,
      displayCode: entry.code || "-",
      displayQuantite: entry[quantityField],
      displayRestant: batchQuantite - consumed,
    };
  });
}

export function groupCartonEntriesByLigne(
  entries: (CartonEntryRow | VracEntryRow | EmballageEntryRow)[]
): Map<number, (CartonEntryRow | VracEntryRow | EmballageEntryRow)[]> {
  const map = new Map<number, (CartonEntryRow | VracEntryRow | EmballageEntryRow)[]>();
  for (const entry of entries) {
    const list = map.get(entry.programme_ligne_id) ?? [];
    list.push(entry);
    map.set(entry.programme_ligne_id, list);
  }
  return map;
}

// Repartit le produit (carton ou emballage) d'une ligne ENTRE SES CODES -
// depuis que Conditionnement/Emballage scopent chaque saisie par code (voir
// upsertRapport), une entree recente porte deja le bon code et peut etre
// sommee directement par code. Une ligne jamais retouchee depuis cet ajout
// (toutes ses entrees encore en code "" partage) retombe sur l'ancienne
// repartition en cascade (le 1er code se remplit avant le 2eme, etc.) pour
// ne pas perdre l'affichage historique. Un melange (certains codes deja
// scopes, d'autres pas) ne devrait plus arriver pour une ligne donnee une
// fois qu'un premier Save par code a eu lieu, chaque code repassant alors
// par la case per-code definitivement.
export function computeProduitParCode(
  entries: { code: string; quantite: number }[],
  codes: string[],
  prevuParCode: (code: string) => number
): Map<string, number> {
  const result = new Map<string, number>();
  const hasCodeSpecificEntries = entries.some((entry) => entry.code);

  if (hasCodeSpecificEntries) {
    for (const code of codes) {
      const sum = entries
        .filter((entry) => entry.code === code)
        .reduce((total, entry) => total + Number(entry.quantite), 0);
      result.set(code, sum);
    }
    return result;
  }

  const total = entries.reduce((total, entry) => total + Number(entry.quantite), 0);
  let remaining = total;
  for (const code of codes) {
    const consumed = Math.min(prevuParCode(code), Math.max(0, remaining));
    result.set(code, consumed);
    remaining -= consumed;
  }
  return result;
}

// Associe chaque code deja enregistre dans "Historique Programme
// Dispatcher" au numero PD (PD1, PD2...) du groupe ou il a ete enregistre -
// meme principe de rang que sur la page historique elle-meme. Un code peut
// ne correspondre a aucun PD si sa zone n'a jamais ete "enregistree" depuis
// la page Ravitailleur/Programme Dispatcher.
export async function buildPdLabelByCode(): Promise<Map<string, string>> {
  type HistoryCodeRow = { groupe_id: number | null; code: string | null; created_at: string };
  const rows: HistoryCodeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("groupe_id, code, created_at")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as HistoryCodeRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const earliestByGroup = new Map<number, string>();
  for (const row of rows) {
    if (row.groupe_id === null) continue;
    const current = earliestByGroup.get(row.groupe_id);
    if (!current || new Date(row.created_at).getTime() < new Date(current).getTime()) {
      earliestByGroup.set(row.groupe_id, row.created_at);
    }
  }

  const orderedGroupIds = [...earliestByGroup.entries()]
    .sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime())
    .map(([groupeId]) => groupeId);

  const pdLabelByGroup = new Map<number, string>();
  orderedGroupIds.forEach((groupeId, index) => {
    pdLabelByGroup.set(groupeId, `PD${index + 1}`);
  });

  const pdLabelByCode = new Map<string, string>();
  for (const row of rows) {
    if (!row.code || row.groupe_id === null) continue;
    const label = pdLabelByGroup.get(row.groupe_id);
    if (label) pdLabelByCode.set(row.code, label);
  }

  return pdLabelByCode;
}

// "numero_lot" peut contenir plusieurs codes ("AA2366VI/E, AA2367VI/E") si
// la ligne a ete decoupee en plusieurs lots - on retourne le/les PD trouves.
export function pdLabelsForNumeroLot(
  numeroLot: string | null,
  pdLabelByCode: Map<string, string>
): string {
  if (!numeroLot) return "-";
  const codes = numeroLot.split(",").map((code) => code.trim()).filter(Boolean);
  const labels = [...new Set(codes.map((code) => pdLabelByCode.get(code)).filter(Boolean))] as string[];
  return labels.length > 0 ? labels.join(", ") : "-";
}

export function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatQty(value: number) {
  return Math.round(value * 100) / 100;
}
