"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { creerEcriture, supprimerEcriturePourSource } from "@/lib/comptabilite";

async function requireTvaWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les declarations TVA.");
  }
  return currentUser;
}

function revalidateTvaPages() {
  revalidatePath("/comptabilite/tva");
  revalidatePath("/comptabilite/journal");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/bilan");
  revalidatePath("/comptabilite/compte-resultat");
}

// Solde la TVA collectee (facturee aux clients, credit 4432) contre la TVA
// deductible (payee aux fournisseurs, debit 4452) pour la periode : le net
// va soit en dette envers l'Etat (4441, si collectee > deductible), soit en
// credit de TVA a reporter (4449, si deductible > collectee) - jamais les 2
// a la fois, une seule des 2 lignes est ecrite selon le sens du solde.
export async function createDeclarationTvaAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await requireTvaWriteAccess();

    const periode = String(formData.get("periode") || "").trim();
    const tvaCollectee = Number(String(formData.get("tva_collectee") || "0").replace(",", "."));
    const tvaDeductible = Number(String(formData.get("tva_deductible") || "0").replace(",", "."));
    const dateDeclaration = String(formData.get("date_declaration") || "").trim();
    const compteTvaCollecteeCode = String(formData.get("compte_tva_collectee_code") || "").trim() || "44320000";
    const compteTvaDeductibleCode = String(formData.get("compte_tva_deductible_code") || "").trim() || "44520000";

    if (!/^\d{4}-\d{2}$/.test(periode)) return { ok: false, message: "Periode invalide (format AAAA-MM)." };
    if (!dateDeclaration) return { ok: false, message: "La date de declaration est obligatoire." };
    if (tvaCollectee < 0 || tvaDeductible < 0) return { ok: false, message: "Les montants ne peuvent pas etre negatifs." };
    if (tvaCollectee === 0 && tvaDeductible === 0) return { ok: false, message: "Au moins un des 2 montants doit etre renseigne." };

    const { data: existing } = await supabaseServer
      .from("declarations_tva")
      .select("id")
      .eq("periode", periode)
      .maybeSingle();
    if (existing) return { ok: false, message: `Une declaration existe deja pour ${periode}.` };

    const net = tvaCollectee - tvaDeductible;
    const compteEtatDue = "44410000";
    const compteEtatCredit = "44490000";

    const lignes = [
      { compteCode: compteTvaCollecteeCode, debit: tvaCollectee, credit: 0 },
      { compteCode: compteTvaDeductibleCode, debit: 0, credit: tvaDeductible },
      net >= 0
        ? { compteCode: compteEtatDue, debit: 0, credit: net }
        : { compteCode: compteEtatCredit, debit: -net, credit: 0 },
    ].filter((l) => l.debit > 0 || l.credit > 0);

    const { error } = await supabaseServer.from("declarations_tva").insert([
      {
        periode,
        tva_collectee: tvaCollectee,
        tva_deductible: tvaDeductible,
        compte_tva_collectee_code: compteTvaCollecteeCode,
        compte_tva_deductible_code: compteTvaDeductibleCode,
        compte_etat_code: net >= 0 ? compteEtatDue : compteEtatCredit,
        date_declaration: dateDeclaration,
        cree_par: currentUser,
      },
    ]);
    if (error) return { ok: false, message: error.message };

    await creerEcriture({
      dateEcriture: dateDeclaration,
      libelle: `Declaration TVA ${periode}`,
      sourceType: "declaration_tva",
      sourceId: periode,
      createdBy: currentUser,
      lignes,
    });

    revalidateTvaPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

export async function deleteDeclarationTvaAction(periode: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireTvaWriteAccess();
    if (!periode) return { ok: false, message: "Periode invalide." };

    const { error } = await supabaseServer.from("declarations_tva").delete().eq("periode", periode);
    if (error) return { ok: false, message: error.message };

    await supprimerEcriturePourSource("declaration_tva", periode);

    revalidateTvaPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}
