"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { canViewPageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { buildCodeFluxContext, fetchCodeFlux, type CodeFlux } from "@/lib/production-code-flux";

type Reponse = { ok: true; flux: CodeFlux[] } | { ok: false; message: string };

// Flux complet (matiere premiere, production, produit fini) des codes d'une PD. Calcul lourd (plusieurs secondes) : la page de la PD ne
// le lance PAS a l'ouverture, seulement quand on deplie le bloc "Flux" (voir flux-a-la-demande.tsx). Retourne un message au lieu de
// "throw" : Next.js efface le message d'une Error jetee depuis une Server Action en production.
export async function chargerFluxPdAction(groupeId: number): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canViewPageUser(utilisateur, "historiqueProgrammeDispatcher"))) {
      return { ok: false, message: "Cet utilisateur ne peut pas voir cet historique." };
    }
    if (!Number.isInteger(groupeId) || groupeId <= 0) return { ok: false, message: "Programme invalide." };

    const { data, error } = await supabaseServer.from("programme_dispatcher_history").select("code").eq("groupe_id", groupeId);
    if (error) return { ok: false, message: error.message };

    const codes = [...new Set(((data ?? []) as { code: string | null }[]).map((ligne) => (ligne.code || "").trim()).filter(Boolean))];
    if (codes.length === 0) return { ok: true, flux: [] };

    const contexte = await buildCodeFluxContext();
    const flux = (await Promise.all(codes.map((code) => fetchCodeFlux(code, contexte)))).filter(
      (element): element is CodeFlux => element !== null
    );
    return { ok: true, flux };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Chargement du flux impossible." };
  }
}
