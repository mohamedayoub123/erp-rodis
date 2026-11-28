import { supabaseServer } from "@/lib/supabase-server";
import { ARTICLE_MACHINE_ENTIERE, type MachineCapacite } from "@/lib/machine-capacite";

// Toutes les capacites des machines (voir lib/machine-capacite.ts) : celles saisies produit par produit
// (machine_produits) et les Min / Max (kg) ecrits sur les machines de Fabrication elles-memes. Une erreur de
// lecture est remontee : au Dispatch, une capacite non lue ne doit pas passer pour une capacite absente.
export async function fetchCapacitesMachines(): Promise<MachineCapacite[]> {
  const resultat: MachineCapacite[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("machine_produits")
      .select("machine_id, article_id, capacite, capacite_min, capacite_max")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as {
      machine_id: number;
      article_id: number;
      capacite: number | null;
      capacite_min: number | null;
      capacite_max: number | null;
    }[];
    resultat.push(
      ...chunk.map((row) => ({
        machineId: row.machine_id,
        articleId: row.article_id,
        capacite: row.capacite,
        capaciteMin: row.capacite_min,
        capaciteMax: row.capacite_max,
      }))
    );
    if (chunk.length < pageSize) break;
  }

  const { data, error } = await supabaseServer
    .from("machines")
    .select("id, capacite_min, capacite_max")
    .eq("type", "Fabrication");
  if (error) throw new Error(error.message);

  for (const machine of (data ?? []) as { id: number; capacite_min: number | null; capacite_max: number | null }[]) {
    if (machine.capacite_min == null && machine.capacite_max == null) continue;
    resultat.push({
      machineId: machine.id,
      articleId: ARTICLE_MACHINE_ENTIERE,
      capacite: null,
      capaciteMin: machine.capacite_min,
      capaciteMax: machine.capacite_max,
    });
  }

  return resultat;
}
