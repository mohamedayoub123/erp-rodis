"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { creerEcriture, supprimerEcriturePourSource } from "@/lib/comptabilite";

async function requireChargeWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les charges recurrentes.");
  }
  return currentUser;
}

function revalidateChargesPages() {
  revalidatePath("/comptabilite/charges-recurrentes");
  revalidatePath("/comptabilite/journal");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/bilan");
  revalidatePath("/comptabilite/compte-resultat");
}

export const CATEGORIES_CHARGE = ["loyer", "assurance", "abonnement", "entretien", "autre"] as const;

export async function createChargeRecurrenteAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await requireChargeWriteAccess();

    const nom = String(formData.get("nom") || "").trim();
    const categorie = String(formData.get("categorie") || "autre").trim();
    const montant = Number(String(formData.get("montant") || "0").replace(",", "."));
    const compteChargeCode = String(formData.get("compte_charge_code") || "").trim();
    const compteContrepartieCode = String(formData.get("compte_contrepartie_code") || "").trim() || "571000";

    if (!nom) return { ok: false, message: "Le nom est obligatoire." };
    if (!montant || montant <= 0) return { ok: false, message: "Montant invalide." };
    if (!compteChargeCode) return { ok: false, message: "Le compte de charge est obligatoire." };

    const { error } = await supabaseServer.from("charges_recurrentes").insert([
      {
        nom,
        categorie,
        montant,
        compte_charge_code: compteChargeCode,
        compte_contrepartie_code: compteContrepartieCode,
        cree_par: currentUser,
      },
    ]);

    if (error) return { ok: false, message: error.message };

    revalidateChargesPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function updateChargeRecurrenteActifAction(
  chargeId: number,
  actif: boolean
): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireChargeWriteAccess();
    if (!chargeId) return { ok: false, message: "Charge invalide." };

    const { error } = await supabaseServer.from("charges_recurrentes").update({ actif }).eq("id", chargeId);
    if (error) return { ok: false, message: error.message };

    revalidateChargesPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

// Meme convention que payerEmployeAction (Paie) : une ecriture par (charge,
// mois), source_id sert de cle pour savoir si ce mois est deja regle.
export async function payerChargeRecurrenteAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await requireChargeWriteAccess();

    const chargeId = Number(String(formData.get("charge_id") || "0"));
    const periode = String(formData.get("periode") || "").trim();
    const montantRaw = String(formData.get("montant") || "").trim();
    const dateEcriture = String(formData.get("date_ecriture") || "").trim();

    if (!chargeId || !periode) return { ok: false, message: "Charge ou periode invalide." };
    if (!/^\d{4}-\d{2}$/.test(periode)) return { ok: false, message: "Periode invalide (format AAAA-MM)." };

    const { data: chargeData } = await supabaseServer
      .from("charges_recurrentes")
      .select("nom, montant, compte_charge_code, compte_contrepartie_code")
      .eq("id", chargeId)
      .maybeSingle();

    if (!chargeData) return { ok: false, message: "Charge introuvable." };
    const charge = chargeData as {
      nom: string;
      montant: number;
      compte_charge_code: string;
      compte_contrepartie_code: string;
    };

    const montant = montantRaw ? Number(montantRaw.replace(",", ".")) : charge.montant;
    if (!montant || montant <= 0) return { ok: false, message: "Montant invalide." };

    const sourceId = `${chargeId}::${periode}`;
    const { data: existing } = await supabaseServer
      .from("ecritures_comptables")
      .select("id")
      .eq("source_type", "charge_recurrente")
      .eq("source_id", sourceId)
      .maybeSingle();

    if (existing) {
      return { ok: false, message: `${charge.nom} est deja regle pour ${periode}.` };
    }

    await creerEcriture({
      dateEcriture: dateEcriture || `${periode}-01`,
      libelle: `${charge.nom} - ${periode}`,
      sourceType: "charge_recurrente",
      sourceId,
      createdBy: currentUser,
      lignes: [
        { compteCode: charge.compte_charge_code, debit: montant, credit: 0 },
        { compteCode: charge.compte_contrepartie_code, debit: 0, credit: montant },
      ],
    });

    revalidateChargesPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function annulerPaiementChargeRecurrenteAction(
  chargeId: number,
  periode: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireChargeWriteAccess();
    if (!chargeId || !periode) return { ok: false, message: "Charge ou periode invalide." };

    await supprimerEcriturePourSource("charge_recurrente", `${chargeId}::${periode}`);

    revalidateChargesPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}
