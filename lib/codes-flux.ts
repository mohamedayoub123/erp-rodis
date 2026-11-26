import { supabaseServer } from "@/lib/supabase-server";
import { lirePagesAvecLimite } from "@/lib/lecteur-valide";
import { rangerLesCodes, type CodesPourRecherche } from "@/lib/codes-flux-shared";

// Tous les codes des lignes de programme (quelques lectures de 1000 lignes), pour la liste du rapport Flux par Code
export async function lireCodesPourRecherche(): Promise<CodesPourRecherche> {
  const lignes = await lirePagesAvecLimite<{ numero_lot: string | null; produit: string | null }>(
    () => supabaseServer.from("programme_lignes").select("id", { count: "exact", head: true }),
    (debut, fin) =>
      supabaseServer.from("programme_lignes").select("numero_lot, produit").order("id", { ascending: true }).range(debut, fin) as unknown as PromiseLike<{
        data: { numero_lot: string | null; produit: string | null }[] | null;
        error: { message: string } | null;
      }>
  );
  return rangerLesCodes(lignes);
}
