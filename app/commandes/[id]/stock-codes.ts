import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRowsParallel } from "@/lib/fetch-all-rows-parallel";
import type { CodeOption } from "./fifo-code-picker";

// Codes (lots) avec un stock ACTUELLEMENT disponible pour un article -
// meme regroupement que stock_override_fifo_result cote SQL (code_normalise
// ou numero_lot, somme entree-sortie), MOINS ce que d'AUTRES commandes ont
// deja reserve dessus (fifo_resultats.quantite_chargee, commande_id
// different de celle-ci) - un code deja entierement pris par une autre
// commande ne doit pas apparaitre comme "disponible" ici, meme si son stock
// physique brut est encore positif. Reste > 0 uniquement.
export type StockGroup = { articleId: number; code: string; quantite: number; dateFabrication: string | null };

type LotsStockGroupRow = {
  article_id: number | null;
  numero_lot: string | null;
  code_normalise: string | null;
  date_fabrication: string | null;
  qte_entree: number | null;
  qte_sortie: number | null;
};

export async function fetchStockGroupsByArticle(articleIds: number[]): Promise<Map<string, StockGroup>> {
  const groups = new Map<string, StockGroup>();
  if (articleIds.length === 0) return groups;

  // Meme correctif d'ordre stable que partout ailleurs dans ce fichier :
  // sans .order("id"), la pagination range() peut sauter des lignes sur une
  // table active - c'est CE bug precis qui causait le "323 disponible" pour
  // AA3776 alors que le stock reel net etait 0 (les lignes de sortie
  // tombaient entre 2 pages).
  const rows = await fetchAllRowsParallel<LotsStockGroupRow>(
    () =>
      supabaseServer
        .from("lots_stock")
        .select("id", { count: "exact", head: true })
        .in("article_id", articleIds),
    (from, to) =>
      supabaseServer
        .from("lots_stock")
        .select("article_id, numero_lot, code_normalise, date_fabrication, qte_entree, qte_sortie")
        .in("article_id", articleIds)
        .order("id", { ascending: true })
        .range(from, to)
  );

  for (const row of rows) {
    const code = (row.code_normalise || row.numero_lot || "").trim();
    // Les codes purement numeriques ("1", "2", "3"...) sont d'anciens
    // compteurs de solde d'ouverture importes en vrac avant que le systeme
    // ne suive les vrais numeros de lot un par un (voir les lignes
    // "SORTIEIMPORT" dans lots_stock.note) - jamais un vrai code de lot
    // (qui contient toujours au moins une lettre), donc jamais selectionnable.
    if (!row.article_id || !code || /^\d+$/.test(code)) continue;

    const key = `${row.article_id}::${code.toUpperCase()}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        articleId: row.article_id,
        code: (row.numero_lot || code).trim(),
        quantite: 0,
        dateFabrication: null,
      };
      groups.set(key, group);
    }

    group.quantite += Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    if (!group.dateFabrication && Number(row.qte_entree ?? 0) > 0 && row.date_fabrication) {
      group.dateFabrication = row.date_fabrication;
    }
  }

  return groups;
}

type ReservedRow = {
  quantite_chargee: number | null;
  numero_lot: string | null;
  article_id: number | null;
};

// Reservations d'AUTRES commandes NON LIVREES sur ces articles, regroupees
// par le meme code que fetchStockGroupsByArticle - a deduire du stock brut.
// Le commentaire disait deja "non livrees" depuis toujours, mais rien ne le
// garantissait reellement (pas de filtre sur commandes.statut) :
// fifo_resultats n'est jamais nettoye apres une livraison (garde comme
// historique), donc une commande LIVREE continuait a compter comme
// "reservation en attente" ici - en plus de la vraie sortie deja deduite du
// stock brut (qte_sortie) au moment de la livraison. Ce double comptage
// faisait paraitre un code comme "epuise" (Code inconnu ou stock epuise.)
// alors qu'il restait du stock reel (ex: AA4070 : 88 net reellement
// disponible, affiche comme indisponible car une ancienne commande LIVREE
// avait encore sa reservation de 117 comptee en plus). Meme principe que
// getReservedByArticle plus haut dans actions.ts.
//
// Separee de la fusion avec stockGroups (buildAvailableCodesByArticle
// ci-dessous) expres : cette requete ne depend PAS du resultat de
// fetchStockGroupsByArticle, donc les deux peuvent tourner dans le meme
// Promise.all au lieu de s'attendre l'une l'autre.
export async function fetchReservedByKey(
  articleIds: number[],
  excludeCommandeId: number
): Promise<Map<string, number>> {
  const reservedByKey = new Map<string, number>();
  if (articleIds.length === 0) return reservedByKey;

  const rows = await fetchAllRowsParallel<ReservedRow>(
    () =>
      supabaseServer
        .from("fifo_resultats")
        .select("id, commandes!inner(statut)", { count: "exact", head: true })
        .in("article_id", articleIds)
        .neq("commande_id", excludeCommandeId)
        .neq("commandes.statut", "LIVREE"),
    (from, to) =>
      supabaseServer
        .from("fifo_resultats")
        .select("quantite_chargee, numero_lot, article_id, commandes!inner(statut)")
        .in("article_id", articleIds)
        .neq("commande_id", excludeCommandeId)
        .neq("commandes.statut", "LIVREE")
        // Meme correctif d'ordre stable que fetchStockGroupsByArticle -
        // sans ca, des reservations pouvaient etre ignorees entre 2 pages,
        // faisant apparaitre un code comme plus disponible qu'il ne l'est
        // reellement.
        .order("id", { ascending: true })
        .range(from, to)
  );

  for (const row of rows) {
    const code = (row.numero_lot || "").trim();
    if (!row.article_id || !code) continue;
    const key = `${row.article_id}::${code.toUpperCase()}`;
    reservedByKey.set(key, (reservedByKey.get(key) ?? 0) + Number(row.quantite_chargee ?? 0));
  }

  return reservedByKey;
}

export function buildAvailableCodesByArticle(
  stockGroups: Map<string, StockGroup>,
  reservedByKey: Map<string, number>
): Record<number, CodeOption[]> {
  const result: Record<number, CodeOption[]> = {};

  for (const [key, group] of stockGroups.entries()) {
    const disponible = group.quantite - (reservedByKey.get(key) ?? 0);
    if (disponible <= 0) continue;
    const list = result[group.articleId] ?? [];
    list.push({ code: group.code, quantite: disponible, dateFabrication: group.dateFabrication });
    result[group.articleId] = list;
  }

  return result;
}
