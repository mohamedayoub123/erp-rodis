import { supabaseServer } from "@/lib/supabase-server";
import { calculerEauDuMois, familleSansEau, type EauDuMois } from "@/lib/cout-eau-fabrication";

type EntreeVrac = { id: number; programme_ligne_id: number; quantite: number | null };
type LigneProgramme = {
  id: number;
  produit: string | null;
  type_article: string | null;
  exclu_rapports: boolean | null;
};

function premierDuMois(annee: number, mois: number) {
  return `${annee}-${String(mois).padStart(2, "0")}-01`;
}

// Vrac fabrique (kg) dans le mois choisi, d'apres la date du jour de chaque
// entree de fabrication, puis eau utilisee = base avec eau x 60 %. Les lignes
// exclues des rapports ne comptent pas (comme dans les autres rapports de
// production). Lecture seule.
export async function lireEauDuMois(
  annee: number,
  mois: number
): Promise<{ eau: EauDuMois | null; erreur: string | null }> {
  const debut = premierDuMois(annee, mois);
  const fin = mois === 12 ? premierDuMois(annee + 1, 1) : premierDuMois(annee, mois + 1);

  const entrees: EntreeVrac[] = [];
  const taillePage = 1000;
  for (let depart = 0; ; depart += taillePage) {
    const { data, error } = await supabaseServer
      .from("production_vrac_entries")
      .select("id, programme_ligne_id, quantite")
      .gte("date_jour", debut)
      .lt("date_jour", fin)
      .order("id", { ascending: true })
      .range(depart, depart + taillePage - 1);

    if (error) return { eau: null, erreur: error.message };
    const page = (data ?? []) as EntreeVrac[];
    entrees.push(...page);
    if (page.length < taillePage) break;
  }

  const idsLignes = [...new Set(entrees.map((e) => e.programme_ligne_id))];
  const lignes = new Map<number, LigneProgramme>();
  const tailleLot = 200;
  for (let i = 0; i < idsLignes.length; i += tailleLot) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, produit, type_article, exclu_rapports")
      .in("id", idsLignes.slice(i, i + tailleLot));

    if (error) return { eau: null, erreur: error.message };
    for (const ligne of (data ?? []) as LigneProgramme[]) lignes.set(ligne.id, ligne);
  }

  const aCompter = entrees.flatMap((entree) => {
    const ligne = lignes.get(entree.programme_ligne_id);
    if (!ligne || ligne.exclu_rapports) return [];
    return [
      {
        quantite: Number(entree.quantite ?? 0),
        famille: familleSansEau(ligne.type_article, ligne.produit),
      },
    ];
  });

  return { eau: calculerEauDuMois(aCompter), erreur: null };
}
