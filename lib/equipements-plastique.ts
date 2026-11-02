import { supabaseServer } from "@/lib/supabase-server";

// Equipements (machines) de la Production Plastique : liste a part de la page Equipements de la Production Cosmetique
// (table machines). Table creee par scripts/sql/create_equipements_plastique.sql ; tant qu'elle n'existe pas, "pret" est
// faux et l'ecran E3 garde la saisie libre de la machine. Les colonnes TON (tonnage, ou nombre de tetes pour le soufflage)
// et SECTION (INJ, SOUFF, PET SOUFF...) viennent de scripts/sql/add_ton_section_equipements_plastique.sql : tant qu'il n'est
// pas lance, "colonnesPret" est faux et la page ne les montre pas.
export const SQL_EQUIPEMENTS_PLASTIQUE = "scripts/sql/create_equipements_plastique.sql";
export const SQL_TON_SECTION_EQUIPEMENTS_PLASTIQUE = "scripts/sql/add_ton_section_equipements_plastique.sql";

export type EquipementPlastique = { id: number; nom: string; ton: string | null; section: string | null };

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
