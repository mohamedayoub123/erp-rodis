import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRowsParallel } from "@/lib/fetch-all-rows-parallel";

// Nb carton fabrique par mois = cartons entres au Depot A par "Entree Production" (page Mouvements >
// Produit fini > Entree Production), mois par mois selon la DATE DE FABRICATION du lot (pas la date de
// saisie : une entree saisie le 2 octobre pour une fabrication du 29 septembre compte en septembre ;
// repli sur la date du mouvement si la date de fabrication est vide ou impossible). Les entrees manuelles (TE) et les
// imports Excel n'en font pas partie : seulement ce qui vient de l'Entree Production.
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
  date_fabrication: string | null;
  date_jour: string | null;
};

// Mois de la date de fabrication. Une date de fabrication impossible (APRES la date du mouvement, ou plus
// de 93 jours avant : faute de frappe sur le mois ou l'annee, constate sur quelques entrees : 2027, 2029,
// 2031, 2025) ne doit pas envoyer les cartons dans un mois qui n'existe pas -> on garde alors le mois du
// mouvement. Normalement l'ecart est de 0 a 7 jours.
function moisDeFabrication(ligne: LigneEntree): string {
  const jour = ligne.date_jour || "";
  const fabrication = ligne.date_fabrication || "";
  if (!fabrication) return jour.slice(0, 7);
  if (!jour) return fabrication.slice(0, 7);

  const ecartJours = (Date.parse(jour) - Date.parse(fabrication)) / 86_400_000;
  return ecartJours >= 0 && ecartJours <= 93 ? fabrication.slice(0, 7) : jour.slice(0, 7);
}

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
          .select("article_id, depot_id, qte_entree, date_fabrication, date_jour")
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
    const mois = moisDeFabrication(ligne);
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
