"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  canDeletePageUser,
  canWritePageUser,
  getCurrentStockUser,
} from "@/lib/stock-auth";
import {
  COMPTE_BANQUE,
  COMPTE_CAISSE,
  COMPTE_FOURNISSEURS,
  creerEcriture,
  supprimerEcriturePourSource,
} from "@/lib/comptabilite";

function normalizeFournisseur(value: string) {
  return value.replace(/ /g, "").trim().toUpperCase();
}

async function requireFournisseursWriteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "fournisseurs"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter des fournisseurs.");
  }
}

async function requireFournisseursEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "fournisseurs"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les fournisseurs.");
  }
}

async function requireFournisseursDeleteAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "fournisseurs"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer les fournisseurs.");
  }
}

export async function createFournisseurAction(formData: FormData) {
  await requireFournisseursWriteAccess();

  const nomFournisseur = String(formData.get("nom_fournisseur") || "").trim();
  const pays = String(formData.get("pays") || "").trim();

  if (!nomFournisseur) {
    throw new Error("Le nom du fournisseur est obligatoire.");
  }

  const fournisseurNormalise = normalizeFournisseur(nomFournisseur);

  const { data: existingFournisseur } = await supabaseServer
    .from("fournisseurs")
    .select("id")
    .eq("fournisseur_normalise", fournisseurNormalise)
    .maybeSingle();

  if (existingFournisseur) {
    throw new Error(`Le fournisseur ${nomFournisseur} existe deja.`);
  }

  const { error } = await supabaseServer.from("fournisseurs").insert([
    {
      nom_fournisseur: nomFournisseur,
      fournisseur_normalise: fournisseurNormalise,
      pays: pays || null,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/fournisseurs");
}

export async function updateFournisseurAction(formData: FormData) {
  await requireFournisseursEditAccess();

  const fournisseurId = Number(String(formData.get("fournisseur_id") || "0"));
  const nomFournisseur = String(formData.get("nom_fournisseur") || "").trim();
  const pays = String(formData.get("pays") || "").trim();

  if (!fournisseurId || !nomFournisseur) {
    throw new Error("Fournisseur invalide.");
  }

  const fournisseurNormalise = normalizeFournisseur(nomFournisseur);

  const { data: duplicateFournisseur } = await supabaseServer
    .from("fournisseurs")
    .select("id")
    .eq("fournisseur_normalise", fournisseurNormalise)
    .neq("id", fournisseurId)
    .maybeSingle();

  if (duplicateFournisseur) {
    throw new Error(`Un autre fournisseur existe deja avec ce nom: ${nomFournisseur}`);
  }

  const { error } = await supabaseServer
    .from("fournisseurs")
    .update({
      nom_fournisseur: nomFournisseur,
      fournisseur_normalise: fournisseurNormalise,
      pays: pays || null,
    })
    .eq("id", fournisseurId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/fournisseurs");
}

export async function deleteFournisseurAction(formData: FormData) {
  await requireFournisseursDeleteAccess();

  const fournisseurId = Number(String(formData.get("fournisseur_id") || "0"));

  if (!fournisseurId) {
    throw new Error("Fournisseur invalide.");
  }

  // Nettoie les ecritures des paiements avant suppression - les lignes
  // fournisseur_paiements elles-memes partent via ON DELETE CASCADE, mais
  // leurs ecritures n'ont pas de FK vers cette table (meme classe de bug
  // que nettoyerPaiementsCommande dans app/commandes/actions.ts).
  const { data: paiements } = await supabaseServer
    .from("fournisseur_paiements")
    .select("id")
    .eq("fournisseur_id", fournisseurId);
  for (const paiement of (paiements ?? []) as { id: number }[]) {
    await supprimerEcriturePourSource("fournisseur_paiement", String(paiement.id));
  }

  const { error } = await supabaseServer.from("fournisseurs").delete().eq("id", fournisseurId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/fournisseurs");
}

// Enregistre un paiement fait A un fournisseur - fait redescendre 401000
// (Fournisseurs) : debit Fournisseurs (la dette diminue) / credit Banque ou
// Caisse (la tresorerie sort). Meme principe inverse que
// enregistrerPaiementCommandeAction (app/commandes/actions.ts, qui fait
// redescendre 411000 Clients dans l'autre sens).
export async function enregistrerPaiementFournisseurAction(formData: FormData) {
  await requireFournisseursEditAccess();
  const currentUser = await getCurrentStockUser();

  const fournisseurId = Number(String(formData.get("fournisseur_id") || "0"));
  const montant = Number(String(formData.get("montant") || "0").replace(",", "."));
  const compteCode = String(formData.get("compte_code") || "");
  const datePaiement = String(formData.get("date_paiement") || "").trim() || new Date().toISOString().slice(0, 10);
  const reference = String(formData.get("reference") || "").trim() || null;

  if (!fournisseurId) {
    throw new Error("Fournisseur invalide.");
  }
  if (!montant || montant <= 0) {
    throw new Error("Montant invalide.");
  }
  if (compteCode !== COMPTE_BANQUE && compteCode !== COMPTE_CAISSE) {
    throw new Error("Compte invalide - choisis Banque ou Caisse.");
  }

  const { data: fournisseur } = await supabaseServer
    .from("fournisseurs")
    .select("nom_fournisseur")
    .eq("id", fournisseurId)
    .maybeSingle();
  if (!fournisseur) {
    throw new Error("Fournisseur introuvable.");
  }

  const { data: inserted, error } = await supabaseServer
    .from("fournisseur_paiements")
    .insert({
      fournisseur_id: fournisseurId,
      montant,
      compte_code: compteCode,
      date_paiement: datePaiement,
      reference,
      utilisateur: currentUser,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || "Erreur pendant l'enregistrement du paiement.");
  }

  const paiementId = (inserted as { id: number }).id;

  await creerEcriture({
    dateEcriture: datePaiement,
    pieceReference: reference,
    libelle: `Paiement fournisseur - ${(fournisseur as { nom_fournisseur: string }).nom_fournisseur}`,
    sourceType: "fournisseur_paiement",
    sourceId: String(paiementId),
    createdBy: currentUser,
    lignes: [
      { compteCode: COMPTE_FOURNISSEURS, debit: montant, credit: 0 },
      { compteCode, debit: 0, credit: montant },
    ],
  });

  revalidatePath("/fournisseurs");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/journal");
}

export async function deletePaiementFournisseurAction(formData: FormData) {
  await requireFournisseursEditAccess();

  const paiementId = Number(String(formData.get("paiement_id") || "0"));

  if (!paiementId) {
    throw new Error("Paiement invalide.");
  }

  const { error } = await supabaseServer.from("fournisseur_paiements").delete().eq("id", paiementId);
  if (error) {
    throw new Error(error.message);
  }

  await supprimerEcriturePourSource("fournisseur_paiement", String(paiementId));

  revalidatePath("/fournisseurs");
  revalidatePath("/comptabilite/balance");
  revalidatePath("/comptabilite/journal");
}
