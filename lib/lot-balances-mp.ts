import { supabaseServer } from "@/lib/supabase-server";

// Soldes de stock matiere premiere par article + lot (fonction SQL stock_mp_lot_balances).
// Cette fonction parcourt tout le stock : ~0,25 s par appel, et elle est lue par PAGES de 1000 lignes
// (une execution complete de la fonction par page). Les pages Sortie MP et Inventaire MP la relisaient
// plusieurs fois a chaque affichage (2 a 3 fois pour l'Inventaire), soit des dizaines de milliers
// d'executions par jour sur la base.
//
// - le meme resultat est reutilise pendant 10 s (par instance du serveur) ;
// - des affichages simultanes partagent UN SEUL appel a la base ;
// - les actions qui modifient le stock MP appellent invaliderSoldesLotsMp() (resultat refait aussitot).
// Les actions de sortie re-verifient le stock reel au moment d'enregistrer : un solde affiche avec
// quelques secondes de retard ne peut jamais permettre une sortie impossible.

export type LotBalanceRow = { article_id: number; numero_lot: string; stock: number };

const DUREE_CACHE_MS = 10_000;
let resultat: { jusqua: number; lignes: LotBalanceRow[] } | null = null;
let appelEnCours: Promise<LotBalanceRow[]> | null = null;

export function invaliderSoldesLotsMp() {
  resultat = null;
}

async function lireDepuisLaBase(): Promise<LotBalanceRow[]> {
  // Deduplique par (article_id, numero_lot) - filet de securite en plus de l'ORDER BY cote SQL : sans
  // ordre stable, une pagination en plusieurs appels peut renvoyer la meme ligne deux fois (bug reel
  // confirme sur l'equivalent PF, voir scripts/sql/fix_lot_balances_pagination_order.sql).
  const parCle = new Map<string, LotBalanceRow>();
  const taillePage = 1000;
  for (let debut = 0; ; debut += taillePage) {
    const { data, error } = await supabaseServer.rpc("stock_mp_lot_balances").range(debut, debut + taillePage - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as LotBalanceRow[];
    for (const ligne of page) parCle.set(`${ligne.article_id}::${ligne.numero_lot}`, ligne);
    if (page.length < taillePage) break;
  }
  return [...parCle.values()];
}

export async function lireSoldesLotsMp(): Promise<LotBalanceRow[]> {
  if (resultat && resultat.jusqua > Date.now()) return resultat.lignes;
  if (appelEnCours) return appelEnCours;

  appelEnCours = lireDepuisLaBase()
    .then((lignes) => {
      resultat = { jusqua: Date.now() + DUREE_CACHE_MS, lignes };
      return lignes;
    })
    .finally(() => {
      appelEnCours = null;
    });

  return appelEnCours;
}
