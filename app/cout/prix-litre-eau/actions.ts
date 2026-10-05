"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import { normaliserConfig, type ConfigCoutEau } from "@/lib/cout-eau";

// Renvoie un message lisible au lieu de lever une exception : en production
// Next.js masque le texte des exceptions des Server Actions.
export async function saveCoutEauAction(
  configBrute: ConfigCoutEau
): Promise<{ ok: true } | { ok: false; message: string }> {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "coutEau"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier les prix de l'eau." };
  }

  const config = normaliserConfig(configBrute);

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

  const nbPrix = config.lignes.filter((ligne) => ligne.prix !== null).length;

  await logAudit({
    utilisateur: currentUser,
    module: "CoutEau",
    action: "modification",
    cible: "Prix de l'eau",
    resume: `Prix de l'eau mis a jour (${nbPrix} prix saisis)`,
    avant: (avantData as { donnees: unknown } | null)?.donnees ?? null,
    apres: config,
  });

  revalidatePath("/cout/prix-litre-eau");
  return { ok: true };
}
