"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { creerEcriture, type LigneEcriture } from "@/lib/comptabilite";

async function requireEcritureManuelleWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "comptabilite"))) {
    throw new Error("Cet utilisateur ne peut pas saisir d'ecriture comptable.");
  }

  return currentUser;
}

function revalidateComptabilitePages() {
  revalidatePath("/comptabilite/ecriture-manuelle");
  revalidatePath("/comptabilite/journal");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/grand-livre");
  revalidatePath("/comptabilite/bilan");
  revalidatePath("/comptabilite/compte-resultat");
}

// Meme regle que partout ailleurs dans l'appli : {ok,message} plutot qu'un
// throw, sinon Next.js efface le vrai message d'une Error jetee depuis une
// Server Action en production (meme catchee cote client).
export async function creerEcritureManuelleAction(
  formData: FormData
): Promise<{ ok: boolean; message?: string }> {
  try {
    const currentUser = await requireEcritureManuelleWriteAccess();

    const dateEcriture = String(formData.get("date_ecriture") || "").trim();
    const libelle = String(formData.get("libelle") || "").trim();
    const pieceReference = String(formData.get("piece_reference") || "").trim();

    if (!dateEcriture) {
      return { ok: false, message: "La date est obligatoire." };
    }
    if (!libelle) {
      return { ok: false, message: "Le libelle est obligatoire." };
    }

    const rawLignes = String(formData.get("lignes") || "").trim();
    if (!rawLignes) {
      return { ok: false, message: "Aucune ligne saisie." };
    }

    let parsed: { compteCode: string; debit: number; credit: number }[] = [];
    try {
      parsed = JSON.parse(rawLignes);
    } catch {
      return { ok: false, message: "Lignes invalides." };
    }

    const lignes: LigneEcriture[] = parsed
      .map((l) => ({
        compteCode: String(l.compteCode || "").trim(),
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }))
      .filter((l) => l.compteCode && (l.debit > 0 || l.credit > 0));

    if (lignes.length < 2) {
      return { ok: false, message: "Il faut au moins 2 lignes (un debit et un credit)." };
    }

    const totalDebit = lignes.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lignes.reduce((sum, l) => sum + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return {
        ok: false,
        message: `Ecriture non equilibree : debit ${totalDebit.toLocaleString("fr-FR")} != credit ${totalCredit.toLocaleString("fr-FR")}.`,
      };
    }

    await creerEcriture({
      dateEcriture,
      pieceReference: pieceReference || null,
      libelle,
      sourceType: "ecriture_manuelle",
      sourceId: crypto.randomUUID(),
      createdBy: currentUser,
      lignes,
    });

    revalidateComptabilitePages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

// Reservee aux ecritures saisies via CE formulaire (source_type
// "ecriture_manuelle") - jamais une ecriture generee automatiquement par un
// vrai evenement (achat, vente, production...), qui reste geree par son
// propre mecanisme (suppression de l'evenement source, pas d'ici).
export async function deleteEcritureManuelleAction(
  ecritureId: number
): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireEcritureManuelleWriteAccess();

    if (!ecritureId) {
      return { ok: false, message: "Ecriture invalide." };
    }

    const { data: ecriture } = await supabaseServer
      .from("ecritures_comptables")
      .select("id, source_type")
      .eq("id", ecritureId)
      .maybeSingle();

    if (!ecriture) {
      return { ok: false, message: "Ecriture introuvable." };
    }
    if ((ecriture as { source_type: string }).source_type !== "ecriture_manuelle") {
      return { ok: false, message: "Seule une ecriture saisie manuellement peut etre supprimee ici." };
    }

    const { error } = await supabaseServer.from("ecritures_comptables").delete().eq("id", ecritureId);
    if (error) {
      return { ok: false, message: error.message };
    }

    revalidateComptabilitePages();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}
