import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRowsParallel } from "@/lib/fetch-all-rows-parallel";

// Nb carton fabrique par mois = cartons entres au Depot A par "Entree Production" (page Mouvements >
// Produit fini > Entree Production), mois par mois selon la date du mouvement. Les entrees manuelles
// (TE) et les imports Excel n'en font pas partie : seulement ce qui vient de l'Entree Production.
// Une entree sans depot propre (cas de l'Entree Production) est dans le depot PAR DEFAUT de son article,
// meme regle que lib/depot-stock.ts.
//
// Resultat garde 30 s (par instance du serveur) et partage entre affichages simultanes : la lecture
// parcourt toutes les entrees production du stock.
const SOURCE_ENTREE_PRODUCTION = "web:entree-production";
const DUREE_CACHE_MS = 30_000;

let resultat: { jusqua: number; parMois: Map<string, number> } | null = null;
let appelEnCours: Promise<Map<string, number>> | null = null;

type LigneEntree = {
  article_id: number | null;
  depot_id: number | null;
  qte_entree: number | null;
  date_jour: string | null;
};

async function lireDepuisLaBase(): Promise<Map<string, number>> {
  const { data: depots, error: depotsError } = await supabaseServer.from("depots").select("id, nom");
  if (depotsError) throw new Error(depotsError.message);

  const depotA = ((depots ?? []) as { id: number; nom: string }[]).find(
    (depot) => (depot.nom || "").trim().toLowerCase() === "depot a"
  );
  if (!depotA) return new Map();

  const [entrees, articlesDepotA] = await Promise.all([
    fetchAllRowsParallel<LigneEntree>(
      () =>
        supabaseServer
          .from("lots_stock")
          .select("id", { count: "exact", head: true })
          .eq("source_import", SOURCE_ENTREE_PRODUCTION)
          .gt("qte_entree", 0),
      (from, to) =>
        supabaseServer
          .from("lots_stock")
          .select("article_id, depot_id, qte_entree, date_jour")
          .eq("source_import", SOURCE_ENTREE_PRODUCTION)
          .gt("qte_entree", 0)
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: LigneEntree[] | null; error: { message: string } | null }>
    ),
    fetchAllRowsParallel<{ id: number }>(
      () => supabaseServer.from("articles").select("id", { count: "exact", head: true }).eq("depot_id", depotA.id),
      (from, to) =>
        supabaseServer
          .from("articles")
          .select("id")
          .eq("depot_id", depotA.id)
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: { id: number }[] | null; error: { message: string } | null }>
    ),
  ]);

  const articlesParDefautDepotA = new Set(articlesDepotA.map((article) => article.id));
  const parMois = new Map<string, number>();

  for (const ligne of entrees) {
    const mois = (ligne.date_jour || "").slice(0, 7);
    if (mois.length !== 7) continue;

    const auDepotA =
      ligne.depot_id === depotA.id ||
      (ligne.depot_id === null && ligne.article_id !== null && articlesParDefautDepotA.has(ligne.article_id));
    if (!auDepotA) continue;

    parMois.set(mois, (parMois.get(mois) ?? 0) + Number(ligne.qte_entree ?? 0));
  }

  return parMois;
}

// Cle "AAAA-MM" -> cartons entres au Depot A par Entree Production ce mois-la.
export async function lireCartonEntreeProductionParMois(): Promise<Map<string, number>> {
  if (resultat && resultat.jusqua > Date.now()) return resultat.parMois;
  if (appelEnCours) return appelEnCours;

  appelEnCours = lireDepuisLaBase()
    .then((parMois) => {
      resultat = { jusqua: Date.now() + DUREE_CACHE_MS, parMois };
      return parMois;
    })
    .finally(() => {
      appelEnCours = null;
    });

  return appelEnCours;
}
