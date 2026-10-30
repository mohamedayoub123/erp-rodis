import { supabaseServer } from "@/lib/supabase-server";
import { creerLecteurValide } from "@/lib/lecteur-valide";

// Soldes de stock matiere premiere par article + lot (fonction SQL stock_mp_lot_balances).
// Cette fonction parcourt tout le stock : ~0,25 s par appel, et elle est lue par PAGES de 1000 lignes
// (une execution complete de la fonction par page). Les pages Sortie MP et Inventaire MP la relisaient
// plusieurs fois a chaque affichage (2 a 3 fois pour l'Inventaire), soit des dizaines de milliers
// d'executions par jour sur la base.
//
// Les soldes ne sont relus que si les mouvements de matiere premiere ont change (voir lib/lecteur-valide.ts) :
// a chaque affichage, une toute petite requete compte les lignes et lit le dernier numero. Une entree, une
// sortie ou une suppression, faite par n'importe qui, change cette empreinte : les soldes sont alors relus
// tout de suite (un solde n'est donc jamais en retard apres un enregistrement). Des affichages simultanes
// partagent UN SEUL calcul.
// Les actions de sortie re-verifient de toute facon le stock reel au moment d'enregistrer.

export type LotBalanceRow = { article_id: number; numero_lot: string; stock: number };

async function empreinteMouvementsMp(): Promise<string> {
  const [{ count, error: erreurCompte }, { data, error: erreurDernier }] = await Promise.all([
    supabaseServer.from("lots_stock_matiere_premiere").select("id", { count: "exact", head: true }),
    supabaseServer.from("lots_stock_matiere_premiere").select("id").order("id", { ascending: false }).limit(1),
  ]);
  if (erreurCompte) throw new Error(erreurCompte.message);
  if (erreurDernier) throw new Error(erreurDernier.message);
  return `${count ?? 0}:${(data as { id: number }[] | null)?.[0]?.id ?? 0}`;
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

const lecteurSoldes = creerLecteurValide<LotBalanceRow>({
  lireEmpreinte: empreinteMouvementsMp,
  lireTout: lireDepuisLaBase,
  // Garde de securite si une ligne etait modifiee sur place (sans ajout ni suppression) : rare.
  dureeMaxMs: 120_000,
});

export function invaliderSoldesLotsMp() {
  lecteurSoldes.invalider();
}

export async function lireSoldesLotsMp(): Promise<LotBalanceRow[]> {
  return lecteurSoldes();
}

// Stock matiere premiere du seul "Depot E", par article (fonction SQL stock_by_article_depot_mp : le depot d'un mouvement est
// son depot_id, sinon le depot par defaut de l'article - meme regle que la page du depot). C'est le seul stock utilisable pour
// conditionner : les articles plastique / cosmetique sont fabriques ou receptionnes ailleurs (Depot F, Depot B...) puis
// transferes au Depot E. Meme lecture validee par l'empreinte que les soldes ci-dessus : un transfert enregistre est visible
// tout de suite. Une erreur de lecture est levee (jamais un stock a 0 qui ferait croire a un manque).
export type StockMpDepotRow = { article_id: number; stock: number };

async function lireStockDepotEDepuisLaBase(): Promise<StockMpDepotRow[]> {
  const { data: depot, error: erreurDepot } = await supabaseServer.from("depots").select("id").eq("nom", "Depot E").maybeSingle();
  if (erreurDepot) throw new Error(erreurDepot.message);
  const depotEId = (depot as { id: number } | null)?.id;
  if (!depotEId) throw new Error('Depot "Depot E" introuvable');

  const lignes: StockMpDepotRow[] = [];
  const taillePage = 1000;
  for (let debut = 0; ; debut += taillePage) {
    // un seul article par ligne une fois filtre sur le depot : le tri par article rend la pagination stable
    const { data, error } = await supabaseServer
      .rpc("stock_by_article_depot_mp")
      .eq("depot_id", depotEId)
      .order("article_id", { ascending: true })
      .range(debut, debut + taillePage - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { article_id: number; stock: number | string | null }[];
    for (const ligne of page) lignes.push({ article_id: Number(ligne.article_id), stock: Number(ligne.stock ?? 0) });
    if (page.length < taillePage) break;
  }
  return lignes;
}

const lecteurStockDepotE = creerLecteurValide<StockMpDepotRow>({
  lireEmpreinte: empreinteMouvementsMp,
  lireTout: lireStockDepotEDepuisLaBase,
  // Seul un changement de depot par defaut d'un article (modification sur place, sans mouvement) peut attendre jusque-la.
  dureeMaxMs: 120_000,
});

export async function lireStockMpDepotE(): Promise<StockMpDepotRow[]> {
  return lecteurStockDepotE();
}
