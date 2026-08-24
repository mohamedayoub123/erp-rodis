import { supabaseServer } from "@/lib/supabase-server";

// Meme convention que lib/depot-labels.ts (TO/TI) : "BL.annee.numero" /
// "FAC.annee.numero", repli sur l'id brut si le numero/date_jour n'est
// plus lisible (ligne deja supprimee).
export async function fetchBonLivraisonLabel(bonLivraisonId: number): Promise<string> {
  const { data } = await supabaseServer
    .from("bons_livraison")
    .select("date_jour, numero")
    .eq("id", bonLivraisonId)
    .maybeSingle();
  const row = data as { date_jour: string; numero: number | null } | null;
  return row ? `BL.${row.date_jour.slice(0, 4)}.${row.numero ?? bonLivraisonId}` : `BL-${bonLivraisonId}`;
}

export async function fetchFactureLabel(factureId: number): Promise<string> {
  const { data } = await supabaseServer
    .from("factures")
    .select("date_jour, numero")
    .eq("id", factureId)
    .maybeSingle();
  const row = data as { date_jour: string; numero: number | null } | null;
  return row ? `FAC.${row.date_jour.slice(0, 4)}.${row.numero ?? factureId}` : `FAC-${factureId}`;
}
