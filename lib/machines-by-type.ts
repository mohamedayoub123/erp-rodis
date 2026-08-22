import { supabaseServer } from "@/lib/supabase-server";

export type MachineOption = { nom: string; typeProduit: string[] };

// Utilise par les selecteurs de machine (Fabrication/Emballage) pour
// limiter le choix aux vraies machines deja enregistrees dans
// /production/machines, au lieu d'un texte libre.
export async function fetchMachinesByType(type: string): Promise<MachineOption[]> {
  const { data } = await supabaseServer.from("machines").select("nom, type_produit").eq("type", type).order("nom");
  return ((data as { nom: string; type_produit: string[] | null }[] | null) ?? []).map((m) => ({
    nom: m.nom,
    typeProduit: m.type_produit ?? [],
  }));
}
