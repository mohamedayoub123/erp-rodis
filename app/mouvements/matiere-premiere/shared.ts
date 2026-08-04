import { supabaseServer } from "@/lib/supabase-server";
import { formatDate } from "@/lib/format-date";

export type MouvementMpSourceRow = {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  code_normalise: string | null;
  date_reception: string | null;
  date_fabrication: string | null;
  date_expiration: string | null;
  date_jour: string | null;
  qte_entree: number;
  qte_sortie: number;
  unite: string | null;
  fournisseur: string | null;
  client: string | null;
  n_doss_erp: string | null;
  n_doss_4d: string | null;
  emplacement: string | null;
  utilisateur: string | null;
  note: string | null;
  source_import: string | null;
  mouvement_groupe_id: number | null;
  articles_matiere_premiere: { nom_article: string } | null;
};


export type MouvementMpLigne = {
  id: number;
  article_label: string;
  numero_lot: string | null;
  quantite: number;
  qte_entree: number;
  qte_sortie: number;
  unite: string | null;
  date_jour: string | null;
  date_reception: string | null;
  date_fabrication: string | null;
  date_expiration: string | null;
  fournisseur: string | null;
  client: string | null;
  n_doss_erp: string | null;
  n_doss_4d: string | null;
  emplacement: string | null;
  utilisateur: string | null;
  note: string | null;
  source_import: string | null;
};

export type MouvementMpGroup = {
  groupe_id: number;
  code: string;
  mouvement_type: "entree" | "sortie";
  date_jour: string | null;
  quantite_totale: number;
  lignes: MouvementMpLigne[];
};

const SOURCE_COLUMNS =
  "id, article_id, numero_lot, code_normalise, date_reception, date_fabrication, date_expiration, date_jour, qte_entree, qte_sortie, unite, fournisseur, client, n_doss_erp, n_doss_4d, emplacement, utilisateur, note, source_import, mouvement_groupe_id, articles_matiere_premiere(nom_article)";

const ENTREE_SOURCE = "web:entree-mp";
const RECEPTION_SOURCE = "web:reception-mp";
const SORTIE_SOURCE = "web:sortie-mp";
const ENTREE_SOURCES = [ENTREE_SOURCE, RECEPTION_SOURCE];
const WEB_SOURCES = [ENTREE_SOURCE, RECEPTION_SOURCE, SORTIE_SOURCE];

// Libelle affichable de la provenance d'une ligne - "TE manuel" saisi
// directement depuis Entrer stock, ou "TE import" venu d'une Reception
// depuis le detail d'un dossier Import.
export function mouvementMpSourceLabel(sourceImport: string | null) {
  if (sourceImport === RECEPTION_SOURCE) return "Import";
  if (sourceImport === ENTREE_SOURCE) return "Manuel";
  if (sourceImport === SORTIE_SOURCE) return "Manuel";
  return "-";
}

// PostgREST plafonne chaque requete a ~1000 lignes quel que soit le .range()
// demande - meme boucle de pagination que app/mouvements/shared.ts (PF).
export async function fetchWebMouvementMpSourceRows() {
  const rows: MouvementMpSourceRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .select(SOURCE_COLUMNS)
      .in("source_import", WEB_SOURCES)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = (data as unknown as MouvementMpSourceRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function groupKey(row: MouvementMpSourceRow) {
  return row.mouvement_groupe_id ?? row.id;
}

function sortChrono(rows: MouvementMpSourceRow[]) {
  return [...rows].sort((a, b) => {
    const dateA = a.date_jour ? new Date(a.date_jour).getTime() : 0;
    const dateB = b.date_jour ? new Date(b.date_jour).getTime() : 0;

    if (dateA !== dateB) return dateA - dateB;
    return a.id - b.id;
  });
}

function buildGroups(
  rows: MouvementMpSourceRow[],
  mouvementType: "entree" | "sortie",
  codePrefix: string,
  allowedSources: string[]
): MouvementMpGroup[] {
  const filtered = rows.filter(
    (row) =>
      allowedSources.includes(row.source_import ?? "") &&
      (mouvementType === "entree" ? Number(row.qte_entree ?? 0) > 0 : Number(row.qte_sortie ?? 0) > 0)
  );

  const byGroup = new Map<number, MouvementMpSourceRow[]>();
  for (const row of filtered) {
    const key = groupKey(row);
    const list = byGroup.get(key) ?? [];
    list.push(row);
    byGroup.set(key, list);
  }

  const groupList = [...byGroup.entries()].map(([groupeId, groupRows]) => {
    const sorted = sortChrono(groupRows);
    const first = sorted[0];

    return {
      groupeId,
      dateJour: first.date_jour,
      minId: Math.min(...groupRows.map((row) => row.id)),
      rows: groupRows,
    };
  });

  groupList.sort((a, b) => {
    const dateA = a.dateJour ? new Date(a.dateJour).getTime() : 0;
    const dateB = b.dateJour ? new Date(b.dateJour).getTime() : 0;

    if (dateA !== dateB) return dateA - dateB;
    return a.minId - b.minId;
  });

  return groupList.map((group, index) => {
    const quantiteTotale = group.rows.reduce(
      (sum, row) =>
        sum + Number(mouvementType === "entree" ? row.qte_entree ?? 0 : row.qte_sortie ?? 0),
      0
    );

    return {
      groupe_id: group.groupeId,
      code: `${codePrefix}${index + 1}`,
      mouvement_type: mouvementType,
      date_jour: group.dateJour,
      quantite_totale: quantiteTotale,
      lignes: group.rows.map((row) => ({
        id: row.id,
        article_label: row.articles_matiere_premiere?.nom_article || "-",
        numero_lot: row.numero_lot,
        quantite: Number(mouvementType === "entree" ? row.qte_entree ?? 0 : row.qte_sortie ?? 0),
        qte_entree: Number(row.qte_entree ?? 0),
        qte_sortie: Number(row.qte_sortie ?? 0),
        unite: row.unite,
        date_jour: row.date_jour,
        date_reception: row.date_reception,
        date_fabrication: row.date_fabrication,
        date_expiration: row.date_expiration,
        fournisseur: row.fournisseur,
        client: row.client,
        n_doss_erp: row.n_doss_erp,
        n_doss_4d: row.n_doss_4d,
        emplacement: row.emplacement,
        utilisateur: row.utilisateur,
        note: row.note,
        source_import: row.source_import,
      })),
    };
  });
}

// Le numero 1 correspond toujours au mouvement le plus ancien, meme
// convention que app/mouvements/shared.ts (PF).
export function buildEntreeMpRows(rows: MouvementMpSourceRow[]): MouvementMpGroup[] {
  return buildGroups(rows, "entree", "TE", ENTREE_SOURCES);
}

export function buildSortieMpRows(rows: MouvementMpSourceRow[]): MouvementMpGroup[] {
  return buildGroups(rows, "sortie", "TS", [SORTIE_SOURCE]);
}

export function formatMouvementMpDate(value: string | null) {
  return formatDate(value);
}
