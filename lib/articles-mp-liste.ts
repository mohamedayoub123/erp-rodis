import { supabaseServer } from "@/lib/supabase-server";
import { creerLecteurValide, lirePagesAvecLimite } from "@/lib/lecteur-valide";

// Liste des articles matiere premiere (id, nom, unite, triee par nom) des formulaires Entree / Sortie /
// Sortie Admin. ~2 700 articles, lus avant en 3 requetes d'affilee a chaque ouverture ; maintenant relue
// seulement si un article a ete ajoute ou supprime (voir lib/lecteur-valide.ts) - un renommage d'article peut
// mettre jusqu'a 60 s a apparaitre dans ces formulaires.
export type ArticleMpListe = { id: number; nom_article: string; unite: string | null };

async function empreinteArticlesMp(): Promise<string> {
  const [{ count, error: erreurCompte }, { data, error: erreurDernier }] = await Promise.all([
    supabaseServer.from("articles_matiere_premiere").select("id", { count: "exact", head: true }),
    supabaseServer.from("articles_matiere_premiere").select("id").order("id", { ascending: false }).limit(1),
  ]);
  if (erreurCompte) throw new Error(erreurCompte.message);
  if (erreurDernier) throw new Error(erreurDernier.message);
  return `${count ?? 0}:${(data as { id: number }[] | null)?.[0]?.id ?? 0}`;
}

// Tri par nom puis par id : sans second critere, deux articles de meme nom pouvaient sauter ou se repeter
// d'une page a l'autre (pagination instable).
async function lireArticlesMp(): Promise<ArticleMpListe[]> {
  return lirePagesAvecLimite<ArticleMpListe>(
    () => supabaseServer.from("articles_matiere_premiere").select("id", { count: "exact", head: true }),
    (debut, fin) =>
      supabaseServer
        .from("articles_matiere_premiere")
        .select("id, nom_article, unite")
        .order("nom_article", { ascending: true })
        .order("id", { ascending: true })
        .range(debut, fin) as unknown as PromiseLike<{
        data: ArticleMpListe[] | null;
        error: { message: string } | null;
      }>
  );
}

const lecteurArticles = creerLecteurValide<ArticleMpListe>({
  lireEmpreinte: empreinteArticlesMp,
  lireTout: lireArticlesMp,
  dureeMaxMs: 60_000,
});

export async function lireArticlesMpPourFormulaires(): Promise<ArticleMpListe[]> {
  return lecteurArticles();
}
