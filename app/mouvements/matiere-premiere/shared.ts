import { supabaseServer } from "@/lib/supabase-server";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { convertirEnFcfa } from "@/lib/prix-devise";

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
  created_at: string | null;
  prix_unitaire: number | null;
  devise: string | null;
  taux_change: number | null;
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
  created_at: string | null;
  prixUnitaireFcfa: number | null;
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
  "id, article_id, numero_lot, code_normalise, date_reception, date_fabrication, date_expiration, date_jour, qte_entree, qte_sortie, unite, fournisseur, client, n_doss_erp, n_doss_4d, emplacement, utilisateur, note, source_import, mouvement_groupe_id, created_at, prix_unitaire, devise, taux_change, articles_matiere_premiere(nom_article)";

const ENTREE_SOURCE = "web:entree-mp";
const RECEPTION_SOURCE = "web:reception-mp";
const SORTIE_SOURCE = "web:sortie-mp";
const SORTIE_SOURCE_ADMIN = "web:sortie-mp-admin";
const PROGRAMME_PLASTIQUE_SOURCE = "web:programme-plastique";
const ENTREE_SOURCES = [ENTREE_SOURCE, RECEPTION_SOURCE, PROGRAMME_PLASTIQUE_SOURCE];
const WEB_SOURCES = [ENTREE_SOURCE, RECEPTION_SOURCE, SORTIE_SOURCE, SORTIE_SOURCE_ADMIN, PROGRAMME_PLASTIQUE_SOURCE];

// Libelle affichable de la provenance d'une ligne - "Import" venu d'une
// Reception depuis le detail d'un dossier Import, "Manuel" saisi
// directement depuis Entrer/Sortie stock, "Manuel Admin" saisi depuis
// Sortie Admin (bypasse le controle de stock disponible), "Plastique" venu
// du Programme Plastique (article fabrique en interne, jamais achete).
export function mouvementMpSourceLabel(sourceImport: string | null) {
  if (sourceImport === RECEPTION_SOURCE) return "Import";
  if (sourceImport === ENTREE_SOURCE) return "Manuel";
  if (sourceImport === SORTIE_SOURCE) return "Manuel";
  if (sourceImport === SORTIE_SOURCE_ADMIN) return "Manuel Admin";
  if (sourceImport === PROGRAMME_PLASTIQUE_SOURCE) return "Plastique";
  return "-";
}

// PostgREST plafonne chaque requete a ~1000 lignes quel que soit le .range()
// demande. Les pages sont lues EN PARALLELE (Promise.all) plutot qu'une a
// la fois - meme volume de donnees, mais sans attendre chaque aller-retour
// reseau l'un apres l'autre (cette fonction est appelee par la plupart des
// pages Mouvements/Stock MP, un aller simple ici ralentissait tout le
// module).
export async function fetchWebMouvementMpSourceRows() {
  const pageSize = 1000;

  const { count, error: countError } = await supabaseServer
    .from("lots_stock_matiere_premiere")
    .select("id", { count: "exact", head: true })
    .in("source_import", WEB_SOURCES);

  if (countError) {
    throw new Error(countError.message);
  }

  const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => {
      const from = index * pageSize;
      return supabaseServer
        .from("lots_stock_matiere_premiere")
        .select(SOURCE_COLUMNS)
        .in("source_import", WEB_SOURCES)
        .range(from, from + pageSize - 1);
    })
  );

  const rows: MouvementMpSourceRow[] = [];
  for (const page of pages) {
    if (page.error) {
      throw new Error(page.error.message);
    }
    rows.push(...((page.data as unknown as MouvementMpSourceRow[] | null) ?? []));
  }

  return rows;
}

function groupKey(row: MouvementMpSourceRow) {
  return row.mouvement_groupe_id ?? row.id;
}

// Trie par ordre de creation (id auto-incremente), jamais par date_jour -
// date_jour est une date CHOISIE par l'utilisateur (peut etre saisie dans
// le passe), pas le moment reel de l'enregistrement. Trier par date_jour
// faisait "sauter" les numeros TE/TS deja attribues : une nouvelle saisie
// avec une date_jour anterieure a un mouvement existant se glissait avant
// lui et decalait tous les numeros suivants. Le numero d'un mouvement doit
// rester fixe une fois attribue, quelle que soit la date choisie sur une
// saisie ulterieure.
function sortChrono(rows: MouvementMpSourceRow[]) {
  return [...rows].sort((a, b) => a.id - b.id);
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

  // Meme principe que sortChrono : le numero attribue a un groupe (TE1,
  // TS1...) suit l'ordre de creation (minId), jamais date_jour.
  groupList.sort((a, b) => a.minId - b.minId);

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
        created_at: row.created_at,
        // Le prix vient toujours de la ligne d'ENTREE qui a cree ce lot -
        // jamais sur une sortie, meme lot (voir stock-lots.ts). Demande
        // explicite : le voir directement sur Stock MP sans devoir
        // recouper la base a la main.
        prixUnitaireFcfa:
          mouvementType === "entree" && row.prix_unitaire != null
            ? convertirEnFcfa(row.prix_unitaire, row.devise, row.taux_change)
            : null,
      })),
    };
  });
}

// Le numero 1 correspond toujours au mouvement le plus ancien, meme
// convention que app/mouvements/shared.ts (PF).
export function buildEntreeMpRows(rows: MouvementMpSourceRow[]): MouvementMpGroup[] {
  return buildGroups(rows, "entree", "TE", ENTREE_SOURCES);
}

// Sortie normale (TS) et Sortie Admin (TSA) sont 2 compteurs separes, une
// sortie admin ne doit jamais se glisser dans la numerotation TS normale.
export function buildSortieMpRows(rows: MouvementMpSourceRow[]): MouvementMpGroup[] {
  return [
    ...buildGroups(rows, "sortie", "TS", [SORTIE_SOURCE]),
    ...buildGroups(rows, "sortie", "TSA", [SORTIE_SOURCE_ADMIN]),
  ];
}

export function formatMouvementMpDate(value: string | null) {
  return formatDate(value);
}

export function formatMouvementMpDateTime(value: string | null) {
  return formatDateTime(value);
}
