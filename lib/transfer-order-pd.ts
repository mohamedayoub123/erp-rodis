import { supabaseServer } from "@/lib/supabase-server";
import { formatDocCode } from "@/lib/document-numbers";
import { fetchPdRefsBySourceGroupeId, type PdRef } from "@/lib/programme-numbering";

// Les PD d'un petit nombre de programmes (colonne "PD" de la liste des Transfer Order) : lectures ciblees. Calcule a l'affichage : un TO cree
// AVANT le Dispatch montre son PD des que le programme est dispatche.
export async function fetchPdDesProgrammes(groupeIds: number[]): Promise<Map<number, PdRef[]>> {
  const sources = [...new Set(groupeIds)];
  const resultat = new Map<number, PdRef[]>();
  if (sources.length === 0) return resultat;

  const lignes: { groupe_id: number | null; source_groupe_id: number }[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("groupe_id, source_groupe_id")
      .in("source_groupe_id", sources)
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) throw new Error(error.message);
    lignes.push(...((data ?? []) as typeof lignes));
    if ((data ?? []).length < 1000) break;
  }
  const groupesPd = [...new Set(lignes.map((l) => l.groupe_id).filter((id): id is number => id !== null))];
  if (groupesPd.length === 0) return resultat;

  const { data: numeros, error } = await supabaseServer.from("document_numeros").select("ref_id, annee, numero").eq("kind", "PD").in("ref_id", groupesPd);
  if (error) throw new Error(error.message);
  const codeParGroupe = new Map(
    ((numeros ?? []) as { ref_id: number; annee: number | null; numero: number }[]).map((n) => [
      Number(n.ref_id),
      formatDocCode("PD", { annee: Number(n.annee ?? 0), numero: Number(n.numero) }),
    ])
  );
  // Un PD pas encore numerote : le calcul complet (qui attribue les numeros dans l'ordre de creation) fait foi
  if (groupesPd.some((id) => !codeParGroupe.has(id))) {
    const complet = await fetchPdRefsBySourceGroupeId();
    for (const source of sources) {
      const refs = complet.get(source);
      if (refs) resultat.set(source, refs);
    }
    return resultat;
  }

  for (const source of sources) {
    const groupes = [...new Set(lignes.filter((l) => l.source_groupe_id === source && l.groupe_id !== null).map((l) => l.groupe_id as number))];
    if (groupes.length > 0) {
      resultat.set(source, groupes.sort((a, b) => a - b).map((id) => ({ code: codeParGroupe.get(id)!, groupeId: id })));
    }
  }
  return resultat;
}
