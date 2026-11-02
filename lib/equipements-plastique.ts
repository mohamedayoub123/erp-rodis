import { supabaseServer } from "@/lib/supabase-server";

// Equipements (machines) de la Production Plastique : liste a part de la page Equipements de la Production Cosmetique
// (table machines). Table creee par scripts/sql/create_equipements_plastique.sql ; tant qu'elle n'existe pas, "pret" est
// faux et l'ecran E3 garde la saisie libre de la machine.
export const SQL_EQUIPEMENTS_PLASTIQUE = "scripts/sql/create_equipements_plastique.sql";

export type EquipementPlastique = { id: number; nom: string };

export async function fetchEquipementsPlastique(): Promise<{ pret: boolean; equipements: EquipementPlastique[] }> {
  const { data, error } = await supabaseServer
    .from("equipements_plastique")
    .select("id, nom")
    .order("nom", { ascending: true });

  if (error) return { pret: false, equipements: [] };
  return { pret: true, equipements: (data ?? []) as EquipementPlastique[] };
}
