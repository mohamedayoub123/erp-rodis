import { supabaseServer } from "@/lib/supabase-server";
import { lireStockDepot } from "@/app/depots/[id]/stock-depot";
import { SOURCE_VRAC_A_RECUPERER } from "@/lib/vrac-a-recuperer";

export type VracDepotB = { numeroLot: string; solde: number; libelle: string; articleId: number };

// Les lots de VRAC du Depot B (solde > 0) enregistres dans le module "Vrac a recuperer", quel que soit le produit : sert au champ
// "Code vrac recupere" de la Fabrication (liste a choisir, seuls ces codes sont acceptes). Un article "vrac" = l'article vrac d'un
// produit fini. Tout autre vrac au Depot B (ex : ancien vrac "mis de cote" par la Fabrication) n'est plus propose.
// Un code present sur plusieurs articles n'apparait qu'une fois (celui au plus gros solde).
export async function fetchVracDepotB(): Promise<VracDepotB[]> {
  const parCode = new Map<string, VracDepotB>();
  for (const lot of await fetchVracDepotBParArticle()) {
    const cle = lot.numeroLot.toUpperCase();
    const existant = parCode.get(cle);
    if (!existant || lot.solde > existant.solde) parCode.set(cle, lot);
  }
  return [...parCode.values()].sort((a, b) => a.numeroLot.localeCompare(b.numeroLot));
}

// Meme liste, une entree par (article, code) : l'action serveur s'en sert pour debiter le stock de l'article qui POSSEDE le lot choisi.
export async function fetchVracDepotBParArticle(): Promise<VracDepotB[]> {
  const { data: depotB } = await supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle();
  const depotBId = (depotB as { id: number } | null)?.id ?? null;
  if (!depotBId) return [];

  // Lots (article + code) enregistres par le module Vrac a recuperer
  const lotsModule = new Set<string>();
  for (let debut = 0; ; debut += 1000) {
    const { data } = await supabaseServer
      .from("lots_stock")
      .select("article_id, numero_lot")
      .eq("source_import", SOURCE_VRAC_A_RECUPERER)
      .eq("depot_id", depotBId)
      .range(debut, debut + 999);
    const page = (data ?? []) as { article_id: number; numero_lot: string | null }[];
    for (const ligne of page) lotsModule.add(`${ligne.article_id}::${(ligne.numero_lot ?? "").trim()}`);
    if (page.length < 1000) break;
  }
  if (lotsModule.size === 0) return [];

  const stock = await lireStockDepot(depotBId);
  const lots = stock.soldePf.filter(
    (lot) => lot.solde > 1e-9 && lot.numeroLot && lotsModule.has(`${lot.articleId}::${lot.numeroLot}`)
  );
  if (lots.length === 0) return [];

  const idsStock = [...new Set(lots.map((lot) => lot.articleId))];
  const idsVrac = new Set<number>();
  for (let debut = 0; debut < idsStock.length; debut += 150) {
    const { data } = await supabaseServer
      .from("articles")
      .select("vrac_article_id")
      .in("vrac_article_id", idsStock.slice(debut, debut + 150));
    for (const ligne of (data ?? []) as { vrac_article_id: number | null }[]) {
      if (ligne.vrac_article_id) idsVrac.add(ligne.vrac_article_id);
    }
  }

  const nomParArticle = new Map<number, string>();
  const idsVracListe = [...idsVrac];
  for (let debut = 0; debut < idsVracListe.length; debut += 150) {
    const { data } = await supabaseServer
      .from("articles")
      .select("id, nom_article")
      .in("id", idsVracListe.slice(debut, debut + 150));
    for (const ligne of (data ?? []) as { id: number; nom_article: string | null }[]) {
      nomParArticle.set(ligne.id, ligne.nom_article || "");
    }
  }

  return lots
    .filter((lot) => idsVrac.has(lot.articleId))
    .map((lot) => ({
      numeroLot: lot.numeroLot,
      solde: lot.solde,
      libelle: nomParArticle.get(lot.articleId) || "",
      articleId: lot.articleId,
    }))
    .sort((a, b) => a.numeroLot.localeCompare(b.numeroLot));
}
