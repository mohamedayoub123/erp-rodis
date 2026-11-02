import { supabaseServer } from "@/lib/supabase-server";

// Equipements (machines) de la Production Plastique : liste a part de la page Equipements de la Production Cosmetique
// (table machines). Table creee par scripts/sql/create_equipements_plastique.sql ; tant qu'elle n'existe pas, "pret" est
// faux et l'ecran E3 garde la saisie libre de la machine. Les colonnes TON (tonnage, ou nombre de tetes pour le soufflage)
// et SECTION (INJ, SOUFF, PET SOUFF...) viennent de scripts/sql/add_ton_section_equipements_plastique.sql : tant qu'il n'est
// pas lance, "colonnesPret" est faux et la page ne les montre pas.
export const SQL_EQUIPEMENTS_PLASTIQUE = "scripts/sql/create_equipements_plastique.sql";
export const SQL_TON_SECTION_EQUIPEMENTS_PLASTIQUE = "scripts/sql/add_ton_section_equipements_plastique.sql";

// Machines d'un article dans Statistique Article Plastique (E3) : un article peut en avoir plusieurs en meme temps, chacune avec ses
// propres cavites. Table creee par scripts/sql/create_article_machines_plastique.sql ; tant qu'elle n'existe pas, E3 garde une seule
// machine (et un seul nombre de cavites) par article.
export const SQL_ARTICLE_MACHINES_PLASTIQUE = "scripts/sql/create_article_machines_plastique.sql";

export type EquipementPlastique = { id: number; nom: string; ton: string | null; section: string | null };

export type MachineArticle = { equipementId: number; nom: string; nbCavites: number | null };

// Plus de 2 machines sur un meme article est normal : toutes les lignes de la table sont lues (pages de 1000)
export async function fetchMachinesParArticle(
  equipements: EquipementPlastique[]
): Promise<{ pret: boolean; parArticle: Map<number, MachineArticle[]> }> {
  const nomParId = new Map(equipements.map((equipement) => [equipement.id, equipement.nom]));
  const parArticle = new Map<number, MachineArticle[]>();

  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("article_machines_plastique")
      .select("article_id, equipement_id, nb_cavites")
      .order("article_id", { ascending: true })
      .order("equipement_id", { ascending: true })
      .range(debut, debut + 999);
    if (error) return { pret: false, parArticle: new Map() };

    const page = (data ?? []) as { article_id: number; equipement_id: number; nb_cavites: number | null }[];
    for (const ligne of page) {
      const nom = nomParId.get(ligne.equipement_id);
      if (nom === undefined) continue;
      const liste = parArticle.get(ligne.article_id) ?? [];
      liste.push({ equipementId: ligne.equipement_id, nom, nbCavites: ligne.nb_cavites });
      parArticle.set(ligne.article_id, liste);
    }
    if (page.length < 1000) break;
  }

  // Ordre naturel : M2, M3, M13
  for (const liste of parArticle.values()) {
    liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true, sensitivity: "base" }));
  }
  return { pret: true, parArticle };
}

export async function fetchEquipementsPlastique(): Promise<{
  pret: boolean;
  colonnesPret: boolean;
  equipements: EquipementPlastique[];
}> {
  let colonnesPret = true;
  let lignes: { id: number; nom: string; ton?: string | null; section?: string | null }[] | null;

  const complet = await supabaseServer.from("equipements_plastique").select("id, nom, ton, section");
  if (!complet.error) {
    lignes = complet.data;
  } else {
    const simple = await supabaseServer.from("equipements_plastique").select("id, nom");
    if (simple.error) return { pret: false, colonnesPret: false, equipements: [] };
    colonnesPret = false;
    lignes = simple.data;
  }

  // Ordre naturel : M2, M3, M4 ... M13, M14 (et pas M13 avant M2)
  const equipements = (lignes ?? [])
    .map((ligne) => ({ id: ligne.id, nom: ligne.nom, ton: ligne.ton ?? null, section: ligne.section ?? null }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { numeric: true, sensitivity: "base" }));
  return { pret: true, colonnesPret, equipements };
}
