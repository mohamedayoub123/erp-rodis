import { supabaseServer } from "@/lib/supabase-server";

// Sommes par article des mouvements de matiere premiere, calculees
// directement par la base (voir scripts/sql/create_mp_agregats_par_article.sql).
// Avant, chaque page de rapport telechargeait les ~63 000 mouvements, 1000 a la
// fois, pour les additionner cote serveur (~20 s et une forte charge sur la
// base). Les noms de champs suivent les anciens calculs des pages.
export type AgregatMpArticle = {
  article_id: number;
  // somme entree - sortie, tous mouvements
  stock: number;
  entree_3_mois: number;
  entree_12_mois: number;
  sortie_1_mois: number;
  sortie_3_mois: number;
  sortie_6_mois: number;
  sortie_12_mois: number;
  // idem sortie_N_mois mais uniquement les mouvements de sortie > 0
  sortie_pos_3_mois: number;
  sortie_pos_6_mois: number;
  sortie_pos_12_mois: number;
  derniere_sortie: string | null;
  premiere_entree: string | null;
  // 12 valeurs (janvier..decembre) : sorties des 12 derniers mois par mois calendaire
  sortie_par_mois: number[];
};

// Date "AAAA-MM-JJ" d'il y a N mois (meme convention que le reste de l'appli :
// comparaison directe avec date_jour).
export function isoMoisAvant(mois: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - mois);
  return date.toISOString().slice(0, 10);
}

export async function fetchAgregatsMpParArticle() {
  const appel = () =>
    supabaseServer.rpc("mp_agregats_par_article", {
      p_debut_1_mois: isoMoisAvant(1),
      p_debut_3_mois: isoMoisAvant(3),
      p_debut_6_mois: isoMoisAvant(6),
      p_debut_12_mois: isoMoisAvant(12),
    });
  // 2e essai apres une courte pause si la base, tres sollicitee, depasse son
  // delai maximum (la requete suivante passe en general sans probleme).
  let { data, error } = await appel();
  if (error) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    ({ data, error } = await appel());
  }

  return { rows: (data as AgregatMpArticle[] | null) ?? [], error };
}
