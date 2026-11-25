"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import { planifierSynchroVrac } from "@/lib/vrac-stock-depot-b";
import {
  QUANTITE_VRAC_IGNOREE,
  lireCodesVracPrets,
  type CodeVracDisponible,
} from "@/lib/conditionnement-codes-vrac";

// Dashboard > Conditionnement > colonne N Lot : choix du ou des codes vrac. Chaque action renvoie {ok, message} : Next.js efface le message
// d'une Error jetee depuis une Server Action en production.
type Reponse = { ok: true; message: string } | { ok: false; message: string };

const PAGE_CONDITIONNEMENT = "productionSuiviProductionConditionnement";

export type ListeCodesVrac =
  | { ok: true; codes: CodeVracDisponible[]; vracNom: string | null; kgParCarton: number }
  | { ok: false; message: string };

// Liste proposee dans le menu (chargee a l'ouverture du choix, pas dans la page : une liste par ligne alourdirait le Dashboard).
export async function listerCodesVracPretsAction(ligneId: number): Promise<ListeCodesVrac> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, PAGE_CONDITIONNEMENT))) {
      return { ok: false, message: "Cet utilisateur ne peut pas choisir de code vrac." };
    }
    if (!Number.isInteger(ligneId) || ligneId <= 0) return { ok: false, message: "Ligne invalide." };
    return await lireCodesVracPrets(ligneId);
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Lecture impossible." };
  }
}

function formaterKg(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}

// Choix d'un code vrac pour une ligne : SEULEMENT le code (plus de quantite de vrac a taper). Le vrac consomme se calcule ensuite avec les cartons
// produits (cartons x contenance x pieces par carton), il se decompte tout seul du code et ne depasse jamais le vrac fabrique (voir
// lib/vrac-consommation.ts). La table impose quantite_vrac > 0 : on y ecrit QUANTITE_VRAC_IGNOREE, jamais lue.
export async function ajouterCodeVracConditionnementAction(ligneId: number, code: string, codeVrac: string): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, PAGE_CONDITIONNEMENT))) {
      return { ok: false, message: "Cet utilisateur ne peut pas choisir de code vrac." };
    }
    if (!Number.isInteger(ligneId) || ligneId <= 0) return { ok: false, message: "Ligne invalide." };
    const codeLigne = String(code ?? "").trim();
    const codeSaisi = String(codeVrac ?? "").trim();
    if (!codeLigne) return { ok: false, message: "Ligne invalide (code manquant)." };
    if (!codeSaisi) return { ok: false, message: "Choisis un code vrac." };

    const { data: ligneData, error: ligneErreur } = await supabaseServer
      .from("programme_lignes")
      .select("id, numero_lot")
      .eq("id", ligneId)
      .maybeSingle();
    if (ligneErreur) return { ok: false, message: ligneErreur.message };
    const ligne = ligneData as { id: number; numero_lot: string | null } | null;
    if (!ligne) return { ok: false, message: "Cette ligne n'existe plus. Recharge la page." };
    const codesDeLaLigne = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    const codeValide = codesDeLaLigne.includes(codeLigne) || (codesDeLaLigne.length === 0 && codeLigne === "-");
    if (!codeValide) return { ok: false, message: "Ce lot n'existe plus sur cette ligne. Recharge la page." };

    const prets = await lireCodesVracPrets(ligneId);
    if (!prets.ok) return { ok: false, message: prets.message };

    // Le code doit EXISTER parmi les codes prets : un code tape a la main qui n'existe pas (ou pas encore pret) est refuse
    const candidat = prets.codes.find((c) => c.code.toLowerCase() === codeSaisi.toLowerCase());
    if (!candidat) {
      return {
        ok: false,
        message: `Le code ${codeSaisi} n'est pas dans la liste des codes prets${prets.vracNom ? ` de ${prets.vracNom}` : ""} (Fabrication entree, Test labo fait, du vrac encore disponible). Choisis un code de la liste.`,
      };
    }

    const { data: existant, error: existantErreur } = await supabaseServer
      .from("conditionnement_codes_vrac")
      .select("id")
      .eq("programme_ligne_id", ligneId)
      .eq("code", codeLigne)
      .eq("code_vrac", candidat.code)
      .maybeSingle();
    if (existantErreur) return { ok: false, message: existantErreur.message };
    if (existant) return { ok: true, message: `${candidat.code} est deja choisi sur cette ligne.` };

    const { error: insertionErreur } = await supabaseServer.from("conditionnement_codes_vrac").insert({
      programme_ligne_id: ligneId,
      code: codeLigne,
      code_vrac: candidat.code,
      quantite_vrac: QUANTITE_VRAC_IGNOREE,
      created_by: utilisateur,
    });
    if (insertionErreur) return { ok: false, message: insertionErreur.message };

    await logAudit({
      utilisateur,
      module: "ConditionnementCodeVrac",
      action: "creation",
      cible: candidat.code,
      resume: `Conditionnement ligne ${ligneId} (lot ${codeLigne}) : code vrac ${candidat.code} choisi (${formaterKg(candidat.disponible)} kg disponibles, le vrac se decompte avec les cartons)`,
      apres: { ligneId, code: codeLigne, codeVrac: candidat.code, disponible: candidat.disponible },
    });

    revalidatePath("/production/suivi/dashboard");
    planifierSynchroVrac();
    return {
      ok: true,
      message: `${candidat.code} choisi (${formaterKg(candidat.disponible)} kg disponibles : le vrac se decompte tout seul avec les cartons).`,
    };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Enregistrement impossible." };
  }
}

// Retire un choix (le vrac redevient disponible). Refuse quand des cartons sont deja saisis sur cette ligne : le numero de lot des
// cartons deja conditionnes ne doit pas changer apres coup.
export async function retirerCodeVracConditionnementAction(choixId: number): Promise<Reponse> {
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, PAGE_CONDITIONNEMENT))) {
      return { ok: false, message: "Cet utilisateur ne peut pas modifier le code vrac." };
    }
    if (!Number.isInteger(choixId) || choixId <= 0) return { ok: false, message: "Choix invalide." };

    const { data, error } = await supabaseServer
      .from("conditionnement_codes_vrac")
      .select("id, programme_ligne_id, code, code_vrac, quantite_vrac")
      .eq("id", choixId)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    const choix = data as { id: number; programme_ligne_id: number; code: string; code_vrac: string; quantite_vrac: number } | null;
    if (!choix) return { ok: false, message: "Ce choix n'existe plus. Recharge la page." };

    const { data: cartons, error: cartonsErreur } = await supabaseServer
      .from("production_carton_entries")
      .select("id")
      .eq("programme_ligne_id", choix.programme_ligne_id)
      .eq("code", choix.code)
      .limit(1);
    if (cartonsErreur) return { ok: false, message: cartonsErreur.message };
    if ((cartons ?? []).length > 0) {
      return { ok: false, message: "Des cartons sont deja saisis sur cette ligne : le code vrac ne peut plus etre retire." };
    }

    const { error: suppressionErreur } = await supabaseServer.from("conditionnement_codes_vrac").delete().eq("id", choixId);
    if (suppressionErreur) return { ok: false, message: suppressionErreur.message };

    await logAudit({
      utilisateur,
      module: "ConditionnementCodeVrac",
      action: "modification",
      cible: choix.code_vrac,
      resume: `Conditionnement ligne ${choix.programme_ligne_id} (lot ${choix.code}) : code vrac ${choix.code_vrac} retire (${formaterKg(Number(choix.quantite_vrac))} kg redeviennent disponibles)`,
      avant: choix,
    });

    revalidatePath("/production/suivi/dashboard");
    planifierSynchroVrac();
    return { ok: true, message: `${choix.code_vrac} retire.` };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Suppression impossible." };
  }
}
