"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { trouverTrimestrePr4 } from "@/lib/trimestres-pr4";

// Action de la page d'un trimestre : saisir la production realisee d'un mois. Meme droit que la page :
// qualiteRevueProcessus (ecriture).
const PAGE = "qualiteRevueProcessus";

export type EtatSaisie = { ok: boolean; message: string } | null;

// Production realisee (%) d'un mois, saisie depuis le graphique KPI. Champs : code (trimestre de la page), mois
// ("2026-06"), pourcentage.
export async function enregistrerProductionRealiseeAction(_etat: EtatSaisie, formData: FormData): Promise<EtatSaisie> {
  const utilisateur = await getCurrentStockUser();
  if (!(await canWritePageUser(utilisateur, PAGE))) {
    return { ok: false, message: "Vous n'avez pas le droit de saisir ce chiffre." };
  }

  const code = String(formData.get("code") || "");
  if (!trouverTrimestrePr4(code)) return { ok: false, message: "Trimestre introuvable." };

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
        ? "La table de saisie n'existe pas encore : executez d'abord le SQL create_pr4_production_realisee.sql dans Supabase."
        : `Enregistrement impossible : ${error.message}`,
    };
  }

  revalidatePath(`/qualite/revue-processus/pr4/trimestre/${code}`);
  return { ok: true, message: `${pourcentage.toLocaleString("fr-FR")}% enregistre pour ${mois}.` };
}
