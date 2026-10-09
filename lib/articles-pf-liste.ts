import { supabaseServer } from "@/lib/supabase-server";
import { creerLecteurValide, lirePagesAvecLimite } from "@/lib/lecteur-valide";

// Liste des articles produit fini (id, nom, nature, triee par nom) pour les pages Depot et Transfer Order.
// ~1 000 articles, relus avant a chaque ouverture / filtre de ces pages ; maintenant relus seulement si un
// article a ete ajoute ou supprime (voir lib/lecteur-valide.ts) - un renommage d'article peut mettre jusqu'a
// 60 s a apparaitre dans ces pages. Meme principe que lib/articles-mp-liste.ts.
export type ArticlePfListe = { id: number; nom_article: string; nature: string | null };

async function empreinteArticlesPf(): Promise<string> {
  const [{ count, error: erreurCompte }, { data, error: erreurDernier }] = await Promise.all([
    supabaseServer.from("articles").select("id", { count: "exact", head: true }),
    supabaseServer.from("articles").select("id").order("id", { ascending: false }).limit(1),
  ]);
  if (erreurCompte) throw new Error(erreurCompte.message);
  if (erreurDernier) throw new Error(erreurDernier.message);
  return `${count ?? 0}:${(data as { id: number }[] | null)?.[0]?.id ?? 0}`;
}

// Tri par nom puis par id : sans second critere, deux articles de meme nom pouvaient sauter ou se repeter
// d'une page a l'autre (pagination instable).
async function lireArticlesPf(): Promise<ArticlePfListe[]> {
  return lirePagesAvecLimite<ArticlePfListe>(
    () => supabaseServer.from("articles").select("id", { count: "exact", head: true }),
    (debut, fin) =>
      supabaseServer
        .from("articles")
        .select("id, nom_article, nature")
        .order("nom_article", { ascending: true })
        .order("id", { ascending: true })
        .range(debut, fin) as unknown as PromiseLike<{
        data: ArticlePfListe[] | null;
        error: { message: string } | null;
      }>
  );
}

const lecteurArticlesPf = creerLecteurValide<ArticlePfListe>({
  lireEmpreinte: empreinteArticlesPf,
  lireTout: lireArticlesPf,
  dureeMaxMs: 60_000,
});

export async function lireArticlesPfListe(): Promise<ArticlePfListe[]> {
  return lecteurArticlesPf();
}
