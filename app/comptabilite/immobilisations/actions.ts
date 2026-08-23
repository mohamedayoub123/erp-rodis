"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { creerEcriture, supprimerEcriturePourSource } from "@/lib/comptabilite";

async function requireImmoWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les immobilisations.");
  }
  return currentUser;
}

function revalidateImmoPages() {
  revalidatePath("/comptabilite/immobilisations");
  revalidatePath("/comptabilite/journal");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/bilan");
  revalidatePath("/comptabilite/compte-resultat");
}

// Cree la fiche immobilisation ET l'ecriture d'acquisition (Debit compte
// immobilisation / Credit contrepartie) en une fois - une immobilisation qui
// existe dans l'appli sans son ecriture d'entree n'aurait aucun sens.
export async function createImmobilisationAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await requireImmoWriteAccess();

    const nom = String(formData.get("nom") || "").trim();
    const categorie = String(formData.get("categorie") || "").trim();
    const dateAcquisition = String(formData.get("date_acquisition") || "").trim();
    const valeurAcquisition = Number(String(formData.get("valeur_acquisition") || "0").replace(",", "."));
    const dureeAmortissementMois = Number(String(formData.get("duree_amortissement_mois") || "0"));
    const compteImmobilisationCode = String(formData.get("compte_immobilisation_code") || "").trim();
    const compteAmortissementCode = String(formData.get("compte_amortissement_code") || "").trim();
    const compteDotationCode = String(formData.get("compte_dotation_code") || "").trim() || "68120000";
    const compteContrepartieCode = String(formData.get("compte_contrepartie_code") || "").trim() || "571000";

    if (!nom) return { ok: false, message: "Le nom est obligatoire." };
    if (!dateAcquisition) return { ok: false, message: "La date d'acquisition est obligatoire." };
    if (!valeurAcquisition || valeurAcquisition <= 0) return { ok: false, message: "Valeur d'acquisition invalide." };
    if (!dureeAmortissementMois || dureeAmortissementMois <= 0)
      return { ok: false, message: "Duree d'amortissement invalide (en mois)." };
    if (!compteImmobilisationCode) return { ok: false, message: "Le compte d'immobilisation est obligatoire." };
    if (!compteAmortissementCode) return { ok: false, message: "Le compte d'amortissement est obligatoire." };

    const { data: created, error } = await supabaseServer
      .from("immobilisations")
      .insert([
        {
          nom,
          categorie: categorie || null,
          date_acquisition: dateAcquisition,
          valeur_acquisition: valeurAcquisition,
          duree_amortissement_mois: dureeAmortissementMois,
          compte_immobilisation_code: compteImmobilisationCode,
          compte_amortissement_code: compteAmortissementCode,
          compte_dotation_code: compteDotationCode,
          compte_contrepartie_code: compteContrepartieCode,
          cree_par: currentUser,
        },
      ])
      .select("id")
      .single();

    if (error) return { ok: false, message: error.message };
    const immoId = (created as { id: number }).id;

    await creerEcriture({
      dateEcriture: dateAcquisition,
      libelle: `Acquisition ${nom}`,
      sourceType: "immobilisation_acquisition",
      sourceId: String(immoId),
      createdBy: currentUser,
      lignes: [
        { compteCode: compteImmobilisationCode, debit: valeurAcquisition, credit: 0 },
        { compteCode: compteContrepartieCode, debit: 0, credit: valeurAcquisition },
      ],
    });

    revalidateImmoPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function updateImmobilisationStatutAction(
  immoId: number,
  statut: "actif" | "cede"
): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireImmoWriteAccess();
    if (!immoId) return { ok: false, message: "Immobilisation invalide." };

    const { error } = await supabaseServer.from("immobilisations").update({ statut }).eq("id", immoId);
    if (error) return { ok: false, message: error.message };

    revalidateImmoPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

// Dotation aux amortissements d'UN mois pour cette immobilisation - lineaire
// (valeur_acquisition / duree_amortissement_mois), plafonnee a ce qu'il
// reste reellement a amortir (jamais amortir plus que la valeur d'achat,
// meme si le mois demande depasse la duree prevue). Meme convention que
// payerEmployeAction/payerChargeRecurrenteAction : une ecriture par
// (immobilisation, mois), source_id sert de cle pour savoir si ce mois est
// deja traite.
export async function genererAmortissementMoisAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await requireImmoWriteAccess();

    const immoId = Number(String(formData.get("immo_id") || "0"));
    const periode = String(formData.get("periode") || "").trim();
    const dateEcriture = String(formData.get("date_ecriture") || "").trim();

    if (!immoId || !periode) return { ok: false, message: "Immobilisation ou periode invalide." };
    if (!/^\d{4}-\d{2}$/.test(periode)) return { ok: false, message: "Periode invalide (format AAAA-MM)." };

    const { data: immoData } = await supabaseServer
      .from("immobilisations")
      .select("nom, valeur_acquisition, duree_amortissement_mois, compte_dotation_code, compte_amortissement_code")
      .eq("id", immoId)
      .maybeSingle();

    if (!immoData) return { ok: false, message: "Immobilisation introuvable." };
    const immo = immoData as {
      nom: string;
      valeur_acquisition: number;
      duree_amortissement_mois: number;
      compte_dotation_code: string;
      compte_amortissement_code: string;
    };

    const sourceId = `${immoId}::${periode}`;
    const { data: existing } = await supabaseServer
      .from("ecritures_comptables")
      .select("id")
      .eq("source_type", "immobilisation_amortissement")
      .eq("source_id", sourceId)
      .maybeSingle();
    if (existing) return { ok: false, message: `${immo.nom} deja amorti pour ${periode}.` };

    const { count: moisDejaAmortis } = await supabaseServer
      .from("ecritures_comptables")
      .select("id", { count: "exact", head: true })
      .eq("source_type", "immobilisation_amortissement")
      .like("source_id", `${immoId}::%`);

    const dotationMensuelle = immo.valeur_acquisition / immo.duree_amortissement_mois;
    const dejaAmorti = (moisDejaAmortis ?? 0) * dotationMensuelle;
    const restantAAmortir = Math.max(0, immo.valeur_acquisition - dejaAmorti);
    const montant = Math.min(dotationMensuelle, restantAAmortir);

    if (montant <= 0.01) {
      return { ok: false, message: `${immo.nom} est deja completement amorti.` };
    }

    await creerEcriture({
      dateEcriture: dateEcriture || `${periode}-01`,
      libelle: `Dotation amortissement ${immo.nom} - ${periode}`,
      sourceType: "immobilisation_amortissement",
      sourceId,
      createdBy: currentUser,
      lignes: [
        { compteCode: immo.compte_dotation_code, debit: montant, credit: 0 },
        { compteCode: immo.compte_amortissement_code, debit: 0, credit: montant },
      ],
    });

    revalidateImmoPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function annulerAmortissementMoisAction(
  immoId: number,
  periode: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireImmoWriteAccess();
    if (!immoId || !periode) return { ok: false, message: "Immobilisation ou periode invalide." };

    await supprimerEcriturePourSource("immobilisation_amortissement", `${immoId}::${periode}`);

    revalidateImmoPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}
