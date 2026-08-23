"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { creerEcriture, supprimerEcriturePourSource } from "@/lib/comptabilite";

async function requirePaieWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas modifier la paie.");
  }
  return currentUser;
}

function revalidatePaiePages() {
  revalidatePath("/comptabilite/paie");
  revalidatePath("/comptabilite/journal");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/bilan");
  revalidatePath("/comptabilite/compte-resultat");
}

export async function createEmployeAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await requirePaieWriteAccess();

    const nom = String(formData.get("nom") || "").trim();
    const poste = String(formData.get("poste") || "").trim();
    const salaireMensuel = Number(String(formData.get("salaire_mensuel") || "0").replace(",", "."));
    const compteChargeCode = String(formData.get("compte_charge_code") || "").trim() || "66100000";
    const compteContrepartieCode = String(formData.get("compte_contrepartie_code") || "").trim() || "571000";
    const dateEmbauche = String(formData.get("date_embauche") || "").trim();

    if (!nom) return { ok: false, message: "Le nom est obligatoire." };
    if (!salaireMensuel || salaireMensuel <= 0) return { ok: false, message: "Salaire mensuel invalide." };

    const { error } = await supabaseServer.from("employes").insert([
      {
        nom,
        poste: poste || null,
        salaire_mensuel: salaireMensuel,
        compte_charge_code: compteChargeCode,
        compte_contrepartie_code: compteContrepartieCode,
        date_embauche: dateEmbauche || null,
        cree_par: currentUser,
      },
    ]);

    if (error) return { ok: false, message: error.message };

    revalidatePaiePages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function updateEmployeActifAction(
  employeId: number,
  actif: boolean
): Promise<{ ok: boolean; message?: string }> {
  try {
    await requirePaieWriteAccess();
    if (!employeId) return { ok: false, message: "Employe invalide." };

    const { error } = await supabaseServer.from("employes").update({ actif }).eq("id", employeId);
    if (error) return { ok: false, message: error.message };

    revalidatePaiePages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

// Une seule ecriture par (employe, mois) - source_id sert de cle naturelle
// pour savoir si ce mois est deja paye (voir fetchMoisPayesParEmploye,
// page.tsx), jamais une table de paiements separee.
export async function payerEmployeAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await requirePaieWriteAccess();

    const employeId = Number(String(formData.get("employe_id") || "0"));
    const periode = String(formData.get("periode") || "").trim();
    const montantRaw = String(formData.get("montant") || "").trim();
    const dateEcriture = String(formData.get("date_ecriture") || "").trim();

    if (!employeId || !periode) return { ok: false, message: "Employe ou periode invalide." };
    if (!/^\d{4}-\d{2}$/.test(periode)) return { ok: false, message: "Periode invalide (format AAAA-MM)." };

    const { data: employeData } = await supabaseServer
      .from("employes")
      .select("nom, salaire_mensuel, compte_charge_code, compte_contrepartie_code")
      .eq("id", employeId)
      .maybeSingle();

    if (!employeData) return { ok: false, message: "Employe introuvable." };
    const employe = employeData as {
      nom: string;
      salaire_mensuel: number;
      compte_charge_code: string;
      compte_contrepartie_code: string;
    };

    const montant = montantRaw ? Number(montantRaw.replace(",", ".")) : employe.salaire_mensuel;
    if (!montant || montant <= 0) return { ok: false, message: "Montant invalide." };

    const sourceId = `${employeId}::${periode}`;
    const { data: existing } = await supabaseServer
      .from("ecritures_comptables")
      .select("id")
      .eq("source_type", "paie")
      .eq("source_id", sourceId)
      .maybeSingle();

    if (existing) {
      return { ok: false, message: `${employe.nom} est deja paye pour ${periode}.` };
    }

    await creerEcriture({
      dateEcriture: dateEcriture || `${periode}-01`,
      libelle: `Salaire ${employe.nom} - ${periode}`,
      sourceType: "paie",
      sourceId,
      createdBy: currentUser,
      lignes: [
        { compteCode: employe.compte_charge_code, debit: montant, credit: 0 },
        { compteCode: employe.compte_contrepartie_code, debit: 0, credit: montant },
      ],
    });

    revalidatePaiePages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function annulerPaiementEmployeAction(
  employeId: number,
  periode: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    await requirePaieWriteAccess();
    if (!employeId || !periode) return { ok: false, message: "Employe ou periode invalide." };

    await supprimerEcriturePourSource("paie", `${employeId}::${periode}`);

    revalidatePaiePages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}
