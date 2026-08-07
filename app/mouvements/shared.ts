import { supabaseServer } from "@/lib/supabase-server";
import { formatDate } from "@/lib/format-date";

export type MouvementSourceRow = {
  id: number;
  article_id: number | null;
  numero_lot: string | null;
  code_normalise: string | null;
  date_fabrication: string | null;
  date_peremption: string | null;
  date_jour: string | null;
  qte_entree: number;
  qte_sortie: number;
  chambre: string | null;
  code_pays: string | null;
  note: string | null;
  source_import: string | null;
  mouvement_groupe_id: number | null;
  utilisateur: string | null;
  articles: { nom_article: string } | null;
};

export type MouvementLigne = {
  id: number;
  article_label: string;
  numero_lot: string | null;
  quantite: number;
  qte_entree: number;
  qte_sortie: number;
  chambre: string | null;
  code_pays: string | null;
  date_fabrication: string | null;
  note: string | null;
  utilisateur: string | null;
};

export type MouvementGroup = {
  groupe_id: number;
  code: string;
  mouvement_type: "entree" | "sortie";
  date_jour: string | null;
  quantite_totale: number;
  lignes: MouvementLigne[];
};

const SOURCE_COLUMNS =
  "id, article_id, numero_lot, code_normalise, date_fabrication, date_peremption, date_jour, qte_entree, qte_sortie, chambre, code_pays, note, source_import, mouvement_groupe_id, utilisateur, articles(nom_article)";

export async function fetchMouvementSourceRows() {
  // PostgREST plafonne chaque requete a son max-rows interne (~1000) peu
  // importe le .range() demande - il faut paginer en boucle, sinon la
  // plupart des mouvements TE/TS et des lots disponibles pour une sortie
  // sont silencieusement absents.
  const rows: MouvementSourceRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select(SOURCE_COLUMNS)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = (data as unknown as MouvementSourceRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

const WEB_ONLY_SOURCES = ["web:entree", "web:entree-production", "web:sortie", "web:sortie-commande"];

// Version allegee de fetchMouvementSourceRows, filtree cote base de donnees
// aux seules lignes "web:*" (celles avec un code TE/TS/"Entree Production").
// La liste "Mouvements Produit Fini" n'a besoin que de celles-ci, jamais des
// dizaines de milliers de lignes d'import Excel en masse - le filtre evite
// de tout rapatrier juste pour les jeter ensuite.
export async function fetchWebMouvementSourceRows() {
  const rows: MouvementSourceRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select(SOURCE_COLUMNS)
      .in("source_import", WEB_ONLY_SOURCES)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = (data as unknown as MouvementSourceRow[] | null) ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function groupKey(row: MouvementSourceRow) {
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
function sortChrono(rows: MouvementSourceRow[]) {
  return [...rows].sort((a, b) => a.id - b.id);
}

// Seuls les mouvements crees depuis le web (saisie manuelle entree/sortie,
// livraison de commande, ou transfert automatique depuis Suivi Production)
// recoivent un code TE/TS/"Entree Production". Les lignes venant de l'import
// Excel en masse (source_import du style "entrer:1234") ne sont pas des
// mouvements "web" et restent en dehors de ces listes/numeros. L'entree
// manuelle (TE) et l'entree automatique (Entree Production) ont chacune leur
// propre compteur, jamais melange.
const MANUAL_ENTREE_SOURCES = new Set(["web:entree"]);
const PRODUCTION_ENTREE_SOURCES = new Set(["web:entree-production"]);
const SORTIE_SOURCES = new Set(["web:sortie", "web:sortie-commande"]);

function buildGroups(
  rows: MouvementSourceRow[],
  mouvementType: "entree" | "sortie",
  codePrefix: string,
  allowedSources: Set<string>
): MouvementGroup[] {
  const filtered = rows.filter(
    (row) =>
      allowedSources.has(row.source_import || "") &&
      (mouvementType === "entree" ? Number(row.qte_entree ?? 0) > 0 : Number(row.qte_sortie ?? 0) > 0)
  );

  const byGroup = new Map<number, MouvementSourceRow[]>();
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
        article_label: row.articles?.nom_article || "-",
        numero_lot: row.numero_lot,
        quantite: Number(mouvementType === "entree" ? row.qte_entree ?? 0 : row.qte_sortie ?? 0),
        qte_entree: Number(row.qte_entree ?? 0),
        qte_sortie: Number(row.qte_sortie ?? 0),
        chambre: row.chambre,
        code_pays: row.code_pays,
        date_fabrication: row.date_fabrication,
        note: row.note,
        utilisateur: row.utilisateur,
      })),
    };
  });
}

// Le numero 1 correspond toujours au mouvement le plus ancien (ordre
// chronologique croissant), meme si la page l'affiche ensuite du plus
// recent au plus ancien. Toutes les lignes creees dans le meme
// mouvement_groupe_id (un seul clic "Approuver entree"/"Approuver sortie"
// ou une seule livraison de commande) forment UN seul code.
export function buildEntreeRows(rows: MouvementSourceRow[]): MouvementGroup[] {
  return [
    ...buildGroups(rows, "entree", "TE", MANUAL_ENTREE_SOURCES),
    ...buildGroups(rows, "entree", "Entree Production ", PRODUCTION_ENTREE_SOURCES),
  ];
}

export function buildSortieRows(rows: MouvementSourceRow[]): MouvementGroup[] {
  return buildGroups(rows, "sortie", "TS", SORTIE_SOURCES);
}

export type AvailableLotOption = {
  id: number;
  articleLabel: string;
  numeroLot: string;
  chambre: string;
  codePays: string;
  datePeremption: string;
  stock: number;
};

// Le stock restant d'un lot est un agregat sur toutes les lignes
// lots_stock qui partagent le meme article_id + code_normalise/numero_lot
// (chaque ligne est un mouvement du grand livre, pas un solde), pas la
// valeur d'une seule ligne.
export function computeAvailableLots(rows: MouvementSourceRow[]): AvailableLotOption[] {
  const byKey = new Map<string, MouvementSourceRow[]>();

  for (const row of rows) {
    if (!row.article_id) continue;
    const key = `${row.article_id}::${String(row.code_normalise || row.numero_lot || "").trim().toUpperCase()}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const result: AvailableLotOption[] = [];

  for (const list of byKey.values()) {
    const remaining = list.reduce(
      (sum, row) => sum + Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0),
      0
    );

    if (remaining <= 0) continue;

    const representative = sortChrono(list)[list.length - 1];

    result.push({
      id: representative.id,
      articleLabel: representative.articles?.nom_article || "-",
      numeroLot: representative.numero_lot || representative.code_normalise || "",
      chambre: representative.chambre || "",
      codePays: representative.code_pays || "",
      datePeremption: representative.date_peremption || "",
      stock: remaining,
    });
  }

  return result;
}

export function parseSortieMeta(note: string | null) {
  if (!note) {
    return { code_sortie: null, livre_pour: null, numero_bl: null, preparateur: null };
  }

  const lines = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    if (!line.startsWith("SORTIEWEB|") && !line.startsWith("SORTIEIMPORT|")) {
      continue;
    }

    const parts = line.split("|");
    const code = parts[2] || "";
    const livrePour = parts[3] || "";
    const numeroBl = parts[4] || "";
    const preparateur = parts.length >= 7 ? parts[5] || "" : "";

    return {
      code_sortie: code && code !== "-" ? code : null,
      livre_pour: livrePour && livrePour !== "-" ? livrePour : null,
      numero_bl: numeroBl && numeroBl !== "-" ? numeroBl : null,
      preparateur: preparateur && preparateur !== "-" ? preparateur : null,
    };
  }

  return { code_sortie: null, livre_pour: null, numero_bl: null, preparateur: null };
}

export function formatMouvementDate(value: string | null) {
  return formatDate(value);
}
