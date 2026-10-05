"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import { libelleMois, moisValide } from "@/lib/cout-eau";
import { nombreDeQuantites, normaliserConsoEau, type ConfigConsoEau } from "@/lib/cout-eau-conso";

function messageTable(message: string) {
  // Seulement quand la table est vraiment absente (script SQL pas execute) : une
  // autre erreur garde son vrai message.
  return message.includes("cout_eau_conso") && (message.includes("schema cache") || message.includes("does not exist"))
    ? "La table de consommation de l'eau n'existe pas encore (script SQL a executer)."
    : message;
}

// Enregistre la consommation du mois choisi (cree la ligne du mois, ou la
// remplace). Renvoie un message lisible au lieu de lever une exception : en
// production Next.js masque le texte des exceptions des Server Actions.
export async function saveConsoEauAction(
  annee: number,
  mois: number,
  configBrute: ConfigConsoEau
): Promise<{ ok: true } | { ok: false; message: string }> {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "coutEauConso"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier la consommation de l'eau." };
  }

  if (!moisValide(annee, mois)) {
    return { ok: false, message: "Mois ou annee invalide." };
  }

  const config = normaliserConsoEau(configBrute);

  const { data: avantData } = await supabaseServer
    .from("cout_eau_conso")
    .select("donnees")
    .eq("annee", annee)
    .eq("mois", mois)
    .maybeSingle();

  const { error } = await supabaseServer.from("cout_eau_conso").upsert(
    {
      annee,
      mois,
      donnees: config,
      updated_by: currentUser,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "annee,mois" }
  );

  if (error) {
    return { ok: false, message: messageTable(error.message) };
  }

  await logAudit({
    utilisateur: currentUser,
    module: "CoutEauConso",
    action: avantData ? "modification" : "creation",
    cible: `Consommation d'eau ${libelleMois(annee, mois)}`,
    resume: `Consommation d'eau ${libelleMois(annee, mois)} enregistree (${nombreDeQuantites(config)} element(s) renseigne(s))`,
    avant: (avantData as { donnees: unknown } | null)?.donnees ?? null,
    apres: config,
  });

  revalidatePath("/cout/consommation-eau");
  return { ok: true };
}

// Supprime un mois enregistre (reserve a ceux qui ont le droit Supprimer).
export async function deleteConsoEauMoisAction(
  annee: number,
  mois: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "coutEauConso"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas supprimer un mois." };
  }

  if (!moisValide(annee, mois)) {
    return { ok: false, message: "Mois ou annee invalide." };
  }

  const { data: avantData } = await supabaseServer
    .from("cout_eau_conso")
    .select("donnees")
    .eq("annee", annee)
    .eq("mois", mois)
    .maybeSingle();

  const { error } = await supabaseServer.from("cout_eau_conso").delete().eq("annee", annee).eq("mois", mois);

  if (error) {
    return { ok: false, message: messageTable(error.message) };
  }

  await logAudit({
    utilisateur: currentUser,
    module: "CoutEauConso",
    action: "suppression",
    cible: `Consommation d'eau ${libelleMois(annee, mois)}`,
    resume: `Consommation d'eau ${libelleMois(annee, mois)} supprimee`,
    avant: (avantData as { donnees: unknown } | null)?.donnees ?? null,
  });

  revalidatePath("/cout/consommation-eau");
  return { ok: true };
}
