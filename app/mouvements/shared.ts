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
  created_at: string | null;
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
  source_import: string | null;
  utilisateur: string | null;
  created_at: string | null;
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
  "id, article_id, numero_lot, code_normalise, date_fabrication, date_peremption, date_jour, qte_entree, qte_sortie, chambre, code_pays, note, source_import, mouvement_groupe_id, utilisateur, created_at, articles(nom_article)";

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
        source_import: row.source_import,
        utilisateur: row.utilisateur,
        created_at: row.created_at,
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

export type LotBatchOption = {
  id: number;
  dateFabrication: string;
};

export type AvailableLotOption = {
  id: number;
  articleId: number;
  articleLabel: string;
  numeroLot: string;
  chambre: string;
  codePays: string;
  datePeremption: string;
  stock: number;
  // Plusieurs entrees peuvent partager le meme numero de lot mais des dates
  // de fabrication differentes (lots produits des jours differents, meme
  // code commercial) - une par date DISTINCTE rencontree, la plus recente en
  // premier, pour que la Sortie puisse demander laquelle sortir au lieu de
  // toujours prendre la plus recente sans le dire.
  batches: LotBatchOption[];
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

    const sorted = sortChrono(list);
    const representative = sorted[sorted.length - 1];

    const batchByDate = new Map<string, MouvementSourceRow>();
    for (const row of sorted) {
      if (Number(row.qte_entree ?? 0) <= 0 || !row.date_fabrication) continue;
      if (!batchByDate.has(row.date_fabrication)) {
        batchByDate.set(row.date_fabrication, row);
      }
    }
    const batches = [...batchByDate.values()]
      .sort((a, b) => b.id - a.id)
      .map((row) => ({ id: row.id, dateFabrication: row.date_fabrication as string }));

    result.push({
      id: batches[0]?.id ?? representative.id,
      articleId: representative.article_id as number,
      articleLabel: representative.articles?.nom_article || "-",
      numeroLot: representative.numero_lot || representative.code_normalise || "",
      chambre: representative.chambre || "",
      codePays: representative.code_pays || "",
      datePeremption: representative.date_peremption || "",
      stock: remaining,
      batches,
    });
  }

  return result;
}

export function parseSortieMeta(note: string | null, sourceImport?: string | null) {
  const empty = {
    code_sortie: null,
    livre_pour: null,
    numero_bl: null,
    preparateur: null,
    remarque: null,
    numero_proforma: null,
  };

  if (!note) {
    return empty;
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
    let numeroBl = parts[4] || "";
    const preparateur = parts.length >= 7 ? parts[5] || "" : "";
    const remarque = parts.length >= 8 ? parts[7] || "" : "";
    let numeroProforma = parts.length >= 9 ? parts[8] || "" : "";

    // Anciennes livraisons de commande (avant le 2026-08-11) : le numero de
    // proforma etait glisse par erreur dans le champ BL, faute d'avoir son
    // propre emplacement dans la ligne SORTIEWEB. Uniquement pour ces
    // lignes historiques de livraison (jamais les sorties manuelles, dont
    // le BL est un vrai numero de BL), on recupere quand meme le numero de
    // proforma depuis ce champ, et on vide le faux "BL".
    if (!numeroProforma && sourceImport === "web:sortie-commande" && numeroBl && numeroBl !== "-") {
      numeroProforma = numeroBl;
      numeroBl = "";
    }

    return {
      code_sortie: code && code !== "-" ? code : null,
      livre_pour: livrePour && livrePour !== "-" ? livrePour : null,
      numero_bl: numeroBl && numeroBl !== "-" ? numeroBl : null,
      preparateur: preparateur && preparateur !== "-" ? preparateur : null,
      remarque: remarque && remarque !== "-" ? remarque : null,
      numero_proforma: numeroProforma && numeroProforma !== "-" ? numeroProforma : null,
    };
  }

  return empty;
}

export type TraceEntreeProduction = { entree: true; label: string; href: string } | { entree: false };

export type TraceSortie = {
  label: string;
  href: string;
  quantite: number;
  proforma: string | null;
  livrePour: string | null;
};

// Index unique {ligne lots_stock -> code TE/TS/"Entree Production" + lien}
// pour tout un lot de mouvements web deja charges - calcule une seule fois
// (fetchWebMouvementSourceRows + buildEntreeRows/buildSortieRows), reutilise
// pour tracer plusieurs codes/articles sans refaire tourner la numerotation
// a chaque fois (voir traceProduitFiniPourCode).
export function buildMouvementInfoByRowId(rows: MouvementSourceRow[]): Map<number, { code: string; groupeId: number }> {
  const map = new Map<number, { code: string; groupeId: number }>();
  for (const group of [...buildEntreeRows(rows), ...buildSortieRows(rows)]) {
    for (const ligne of group.lignes) {
      map.set(ligne.id, { code: group.code, groupeId: group.groupe_id });
    }
  }
  return map;
}

// Retrouve l'entree stock reelle (TE/Entree Production) et les sorties/
// livraisons deja faites du produit fini issu d'un code de production
// precis - jamais via ecritures_comptables.source_id (voir le commentaire
// dans app/depots/transfer-order/flux.ts sur le bug du mauvais groupe_id),
// toujours par correspondance directe sur lots_stock (article_id +
// numero_lot = le code de dispatch, meme convention que
// createEntreeProductionBatchAction). Partagee entre le Flux TO/TI et le
// Rapport "Flux par Code" pour ne jamais desynchroniser les deux.
export function traceProduitFiniPourCode(
  webRows: MouvementSourceRow[],
  mouvementInfoByRowId: Map<number, { code: string; groupeId: number }>,
  articleId: number | null | undefined,
  code: string
): { entreeProduction: TraceEntreeProduction; sorties: TraceSortie[] } {
  if (!articleId) return { entreeProduction: { entree: false }, sorties: [] };
  const codeNorm = code.trim().toUpperCase();
  const rows = webRows.filter(
    (r) => r.article_id === articleId && (r.numero_lot || "").trim().toUpperCase() === codeNorm
  );

  const entreeRow = rows.find((r) => Number(r.qte_entree ?? 0) > 0);
  const entreeInfo = entreeRow ? mouvementInfoByRowId.get(entreeRow.id) : undefined;

  const sorties: TraceSortie[] = rows
    .filter((r) => Number(r.qte_sortie ?? 0) > 0)
    .map((r) => {
      const meta = parseSortieMeta(r.note, r.source_import);
      const info = mouvementInfoByRowId.get(r.id);
      return {
        label: info?.code ?? "-",
        href: info ? `/mouvements/sorties/${info.groupeId}` : "/mouvements/produit-fini",
        quantite: Number(r.qte_sortie ?? 0),
        proforma: meta.numero_proforma,
        livrePour: meta.livre_pour,
      };
    });

  return {
    entreeProduction: entreeInfo
      ? { entree: true, label: entreeInfo.code, href: `/mouvements/entrees/${entreeInfo.groupeId}` }
      : { entree: false },
    sorties,
  };
}

export function formatMouvementDate(value: string | null) {
  return formatDate(value);
}

// Distinct de formatMouvementDate : date_jour est une date CHOISIE par
// l'utilisateur (peut etre dans le passe, sans heure reelle), alors que
// created_at est l'horodatage reel de l'enregistrement en base - c'est ce
// qu'on veut pour "quand exactement cette saisie a-t-elle ete faite".
export function formatMouvementDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}
