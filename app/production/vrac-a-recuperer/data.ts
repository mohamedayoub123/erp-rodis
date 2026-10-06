import { supabaseServer } from "@/lib/supabase-server";
import {
  SOURCE_VRAC_A_RECUPERER,
  type ArticleVrac,
  type VracEnregistre,
} from "@/lib/vrac-a-recuperer";

export const LIGNES_AFFICHEES = 150;

// Meme recherche que le rapport Fabrication (suivi-production/actions.ts)
export async function lireIdDepotB(): Promise<number | null> {
  const { data } = await supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle();
  return (data as { id: number } | null)?.id ?? null;
}

export async function lireArticlesVrac(): Promise<ArticleVrac[]> {
  const { data, error } = await supabaseServer
    .from("articles")
    .select("id, nom_article")
    .eq("nature", "vrac")
    .order("nom_article", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);

  return ((data ?? []) as { id: number; nom_article: string | null }[]).map((a) => ({
    id: a.id,
    nom: a.nom_article ?? `Article #${a.id}`,
  }));
}

function morceaux<T>(liste: T[], taille: number): T[][] {
  const resultat: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) resultat.push(liste.slice(i, i + taille));
  return resultat;
}

// Stock actuel (entrees - sorties) de chaque (article, code) dans le Depot B.
// Pagination triee : PostgREST coupe a 1000 lignes.
export async function lireSoldesDepotB(depotBId: number, articleIds: number[]): Promise<Map<string, number>> {
  const soldes = new Map<string, number>();

  for (const lot of morceaux([...new Set(articleIds)], 100)) {
    let debut = 0;
    while (true) {
      const { data, error } = await supabaseServer
        .from("lots_stock")
        .select("article_id, numero_lot, qte_entree, qte_sortie")
        .eq("depot_id", depotBId)
        .in("article_id", lot)
        .order("id", { ascending: true })
        .range(debut, debut + 999);
      if (error) throw new Error(error.message);

      const lignes = (data ?? []) as {
        article_id: number;
        numero_lot: string | null;
        qte_entree: number | null;
        qte_sortie: number | null;
      }[];
      for (const l of lignes) {
        const cle = `${l.article_id}|${l.numero_lot ?? ""}`;
        soldes.set(cle, (soldes.get(cle) ?? 0) + Number(l.qte_entree ?? 0) - Number(l.qte_sortie ?? 0));
      }

      if (lignes.length < 1000) break;
      debut += 1000;
    }
  }

  return soldes;
}

export async function lireVracEnregistres(
  depotBId: number | null,
  tout: boolean
): Promise<{ lignes: VracEnregistre[]; total: number }> {
  let requete = supabaseServer
    .from("lots_stock")
    .select("id, article_id, numero_lot, qte_entree, date_jour, note, utilisateur", { count: "exact" })
    .eq("source_import", SOURCE_VRAC_A_RECUPERER)
    .order("id", { ascending: false });
  if (!tout) requete = requete.limit(LIGNES_AFFICHEES);

  const { data, count, error } = await requete;
  if (error) throw new Error(error.message);

  const brutes = (data ?? []) as {
    id: number;
    article_id: number;
    numero_lot: string | null;
    qte_entree: number | null;
    date_jour: string;
    note: string | null;
    utilisateur: string | null;
  }[];

  const articleIds = [...new Set(brutes.map((l) => l.article_id))];
  const noms = new Map<number, string>();
  for (const lot of morceaux(articleIds, 100)) {
    const { data: articles } = await supabaseServer.from("articles").select("id, nom_article").in("id", lot);
    for (const a of (articles ?? []) as { id: number; nom_article: string | null }[]) {
      noms.set(a.id, a.nom_article ?? `Article #${a.id}`);
    }
  }

  const soldes = depotBId ? await lireSoldesDepotB(depotBId, articleIds) : new Map<string, number>();

  const prefixe = "Vrac a recuperer";
  const lignes: VracEnregistre[] = brutes.map((l) => {
    const remarque = (l.note ?? "").replace(prefixe, "").replace(/^\s*-\s*/, "").trim();
    return {
      id: l.id,
      articleId: l.article_id,
      article: noms.get(l.article_id) ?? `Article #${l.article_id}`,
      code: l.numero_lot ?? "",
      quantite: Number(l.qte_entree ?? 0),
      solde: soldes.get(`${l.article_id}|${l.numero_lot ?? ""}`) ?? 0,
      date: l.date_jour,
      remarque: remarque || null,
      utilisateur: l.utilisateur,
    };
  });

  return { lignes, total: count ?? lignes.length };
}
