"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import { calculerCoutEau, normaliserConfig, type ConfigCoutEau } from "@/lib/cout-eau";

// Renvoie un message lisible au lieu de lever une exception : en production
// Next.js masque le texte des exceptions des Server Actions.
export async function saveCoutEauAction(
  configBrute: ConfigCoutEau
): Promise<{ ok: true; totalParLitre: number } | { ok: false; message: string }> {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "coutEau"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier les prix de l'eau." };
  }

  const config = normaliserConfig(configBrute);
  const resultat = calculerCoutEau(config);

  const { data: avantData } = await supabaseServer
    .from("cout_eau_config")
    .select("donnees")
    .eq("id", 1)
    .maybeSingle();

  const { error } = await supabaseServer.from("cout_eau_config").upsert(
    {
      id: 1,
      donnees: config,
      updated_by: currentUser,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    return {
      ok: false,
      message: error.message.includes("cout_eau_config")
        ? "La table des prix de l'eau n'existe pas encore (script SQL a executer)."
        : error.message,
    };
  }

  await logAudit({
    utilisateur: currentUser,
    module: "CoutEau",
    action: "modification",
    cible: "Prix du litre d'eau",
    resume: `Prix du litre d'eau mis a jour : ${resultat.totalParLitre.toLocaleString("fr-FR", {
      maximumFractionDigits: 4,
    })} FCFA / litre`,
    avant: (avantData as { donnees: unknown } | null)?.donnees ?? null,
    apres: config,
  });

  revalidatePath("/cout/prix-litre-eau");
  return { ok: true, totalParLitre: resultat.totalParLitre };
}
