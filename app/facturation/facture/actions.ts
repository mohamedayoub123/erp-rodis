"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "facturationFacture"))) {
    throw new Error("Cet utilisateur ne peut pas creer de Facture.");
  }
  return currentUser;
}

async function nextFactureNumero(dateJour: string): Promise<number> {
  const year = dateJour.slice(0, 4);
  const { data } = await supabaseServer
    .from("factures")
    .select("numero")
    .gte("date_jour", `${year}-01-01`)
    .lte("date_jour", `${year}-12-31`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { numero: number | null } | null)?.numero ?? 0) + 1;
}

// Derniere etape du cycle - uniquement possible une fois le BL "livree"
// (le stock a vraiment bouge). Aucun prix de vente/ecriture comptable
// n'existe encore sur cette branche pour calculer un montant
// automatiquement - saisi a la main, laisse vide au depart si pas connu.
export async function createFactureAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const bonLivraisonId = Number(formData.get("bon_livraison_id") || "0");
  if (!bonLivraisonId) {
    throw new Error("Bon de Livraison invalide.");
  }

  const { data: bl, error: blError } = await supabaseServer
    .from("bons_livraison")
    .select("id, statut")
    .eq("id", bonLivraisonId)
    .maybeSingle();

  if (blError || !bl) {
    throw new Error("Bon de Livraison introuvable.");
  }
  if ((bl as { statut: string }).statut !== "livree") {
    throw new Error("Ce Bon de Livraison n'est pas encore livre - impossible de facturer.");
  }

  const { data: existingFacture } = await supabaseServer
    .from("factures")
    .select("id")
    .eq("bon_livraison_id", bonLivraisonId)
    .maybeSingle();
  if (existingFacture) {
    throw new Error("Une Facture existe deja pour ce Bon de Livraison.");
  }

  const montantRaw = String(formData.get("montant") || "").trim().replace(",", ".");
  const montant = montantRaw ? Number(montantRaw) : null;
  if (montantRaw && (Number.isNaN(montant) || (montant as number) < 0)) {
    throw new Error("Montant invalide.");
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const numero = await nextFactureNumero(dateJour);

  const { data: inserted, error: insertError } = await supabaseServer
    .from("factures")
    .insert({
      numero,
      date_jour: dateJour,
      bon_livraison_id: bonLivraisonId,
      montant,
      cree_par: currentUser,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message || "Impossible de creer la Facture.");
  }

  revalidatePath("/facturation/bl");
  revalidatePath("/facturation/facture");
  redirect(`/facturation/facture/${inserted.id}`);
}

export async function updateFactureAction(formData: FormData) {
  await requireWriteAccess();

  const factureId = Number(formData.get("facture_id") || "0");
  if (!factureId) {
    throw new Error("Facture invalide.");
  }

  const montantRaw = String(formData.get("montant") || "").trim().replace(",", ".");
  const montant = montantRaw ? Number(montantRaw) : null;
  if (montantRaw && (Number.isNaN(montant) || (montant as number) < 0)) {
    throw new Error("Montant invalide.");
  }

  const { error } = await supabaseServer
    .from("factures")
    .update({
      montant,
      remarque: String(formData.get("remarque") || "").trim() || null,
    })
    .eq("id", factureId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/facturation/facture/${factureId}`);
}

export async function deleteFactureAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "facturationFacture"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de Facture.");
  }

  const factureId = Number(formData.get("facture_id") || "0");
  if (!factureId) {
    throw new Error("Facture invalide.");
  }

  const { error } = await supabaseServer.from("factures").delete().eq("id", factureId);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/facturation/facture");
  revalidatePath("/facturation/bl");
  redirect("/facturation/facture");
}
