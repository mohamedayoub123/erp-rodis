"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { trouverTrimestrePr4 } from "@/lib/trimestres-pr4";
import { figerRapport, lireRapportFige, rouvrirRapport } from "./donnees-rapport";

// Actions de la page d'un trimestre : saisir la production realisee d'un mois, figer / rouvrir le rapport.
// Meme droit que la page : qualiteRevueProcessus (ecriture ; la reouverture demande le droit de suppression).
const PAGE = "qualiteRevueProcessus";
const adresse = (code: string) => `/qualite/revue-processus/pr4/trimestre/${code}`;

export type EtatSaisie = { ok: boolean; message: string } | null;

// Production realisee (%) d'un mois, saisie depuis le graphique KPI. Champs : code (trimestre de la page), mois
// ("2026-06"), pourcentage.
export async function enregistrerProductionRealiseeAction(_etat: EtatSaisie, formData: FormData): Promise<EtatSaisie> {
  const utilisateur = await getCurrentStockUser();
  if (!(await canWritePageUser(utilisateur, PAGE))) {
    return { ok: false, message: "Vous n'avez pas le droit de saisir ce chiffre." };
  }

  const code = String(formData.get("code") || "");
  const trimestre = trouverTrimestrePr4(code);
  if (!trimestre) return { ok: false, message: "Trimestre introuvable." };
  if ((await lireRapportFige(code)).fige) {
    return { ok: false, message: "Ce rapport est fige : rouvrez-le pour modifier un chiffre." };
  }

  const mois = String(formData.get("mois") || "");
  const lu = mois.match(/^(\d{4})-(\d{2})$/);
  if (!lu || Number(lu[2]) < 1 || Number(lu[2]) > 12) return { ok: false, message: "Mois invalide." };

  const texte = String(formData.get("pourcentage") || "").trim().replace(",", ".").replace("%", "");
  const pourcentage = Number(texte);
  if (!texte || !Number.isFinite(pourcentage) || pourcentage < 0 || pourcentage > 200) {
    return { ok: false, message: "Saisissez un pourcentage entre 0 et 200 (ex : 92)." };
  }

  const { error } = await supabaseServer.from("pr4_production_realisee").upsert(
    {
      annee: Number(lu[1]),
      mois: Number(lu[2]),
      pourcentage,
      utilisateur,
      date_saisie: new Date().toISOString(),
    },
    { onConflict: "annee,mois" }
  );
  if (error) {
    return {
      ok: false,
      message: /does not exist|schema cache/i.test(error.message)
        ? "La table de saisie n'existe pas encore : executez d'abord le SQL create_pr4_revue_production_et_figee.sql dans Supabase."
        : `Enregistrement impossible : ${error.message}`,
    };
  }

  revalidatePath(adresse(code));
  return { ok: true, message: `${pourcentage.toLocaleString("fr-FR")}% enregistre pour ${mois}.` };
}

async function lireTrimestreDuFormulaire(formData: FormData) {
  const code = String(formData.get("code") || "");
  const trimestre = trouverTrimestrePr4(code);
  if (!trimestre) redirect("/qualite/revue-processus/pr4/trimestre");
  return trimestre;
}

export async function figerRapportAction(formData: FormData) {
  const trimestre = await lireTrimestreDuFormulaire(formData);
  const utilisateur = await getCurrentStockUser();
  let erreur = "";
  try {
    if (!(await canWritePageUser(utilisateur, PAGE))) throw new Error("Vous n'avez pas le droit de figer ce rapport.");
    await figerRapport(trimestre, utilisateur);
  } catch (e) {
    erreur = e instanceof Error ? e.message : "Impossible de figer le rapport.";
  }
  revalidatePath(adresse(trimestre.code));
  redirect(erreur ? `${adresse(trimestre.code)}?erreur=${encodeURIComponent(erreur)}` : `${adresse(trimestre.code)}?fige=1`);
}

export async function rouvrirRapportAction(formData: FormData) {
  const trimestre = await lireTrimestreDuFormulaire(formData);
  const utilisateur = await getCurrentStockUser();
  let erreur = "";
  try {
    if (!(await canDeletePageUser(utilisateur, PAGE))) throw new Error("Vous n'avez pas le droit de rouvrir un rapport fige.");
    await rouvrirRapport(trimestre);
  } catch (e) {
    erreur = e instanceof Error ? e.message : "Impossible de rouvrir le rapport.";
  }
  revalidatePath(adresse(trimestre.code));
  redirect(erreur ? `${adresse(trimestre.code)}?erreur=${encodeURIComponent(erreur)}` : `${adresse(trimestre.code)}?rouvert=1`);
}
