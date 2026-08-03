"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { STATUT_DOSSIER_MP_OPTIONS } from "./constants";

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

async function requireEditAccess() {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandeMp"))) {
    throw new Error("Cet utilisateur ne peut pas modifier les imports.");
  }
}

function revalidateCommandeMpPages() {
  revalidatePath("/stock/matiere-premiere/bc");
  revalidatePath("/stock/matiere-premiere/commande");
}

// Enregistre une reception (numero de lot, dates, quantite) pour une ligne
// de commande, depuis le detail d'un dossier Import. Contrairement a
// "Creer import" (bc/actions.ts), la quantite receptionnee peut etre plus
// petite OU plus grande que la quantite commandee - des qu'on receptionne,
// la ligne passe au statut "Receptionne" (vert), quel que soit l'ecart.
export async function createReceptionMpAction(formData: FormData) {
  await requireEditAccess();

  const bcLigneId = Number(String(formData.get("bc_ligne_id") || "0"));
  const quantiteRaw = String(formData.get("quantite_importee") || "").trim().replace(",", ".");
  const quantiteImportee = quantiteRaw ? Number(quantiteRaw) : null;

  if (!bcLigneId || quantiteImportee === null || Number.isNaN(quantiteImportee) || quantiteImportee <= 0) {
    throw new Error("Quantite receptionnee invalide.");
  }

  const { data: ligneRow, error: ligneError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .select("id")
    .eq("id", bcLigneId)
    .maybeSingle();

  if (ligneError || !ligneRow) {
    throw new Error("Ligne de commande introuvable.");
  }

  const { error: insertError } = await supabaseServer.from("bons_commande_mp_imports").insert([
    {
      bc_ligne_id: bcLigneId,
      quantite_importee: quantiteImportee,
      n_doss_4d_import: parseOptionalText(formData, "n_doss_4d_import"),
      n_doss_erp_import: parseOptionalText(formData, "n_doss_erp_import"),
      numero_lot: parseOptionalText(formData, "numero_lot"),
      date_fabrication: parseOptionalText(formData, "date_fabrication"),
      date_expiration: parseOptionalText(formData, "date_expiration"),
    },
  ]);

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: updateError } = await supabaseServer
    .from("bons_commande_matiere_premiere")
    .update({ statut: "Receptionne" })
    .eq("id", bcLigneId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateCommandeMpPages();
}

// Statut de suivi manuel d'un dossier Import (Fabrication -> Import ->
// Receptionne au port -> Receptionne Rodis). Un dossier n'a pas de table
// propre - identifie par la paire (n_doss_4d, n_doss_erp), comme partout
// ailleurs dans cette fonctionnalite.
export async function updateDossierMpStatutAction(formData: FormData) {
  await requireEditAccess();

  const nDoss4d = parseOptionalText(formData, "n_doss_4d");
  const nDossErp = parseOptionalText(formData, "n_doss_erp");
  const statut = String(formData.get("statut") || "").trim();

  if (!(STATUT_DOSSIER_MP_OPTIONS as readonly string[]).includes(statut)) {
    throw new Error("Statut invalide.");
  }

  let query = supabaseServer.from("dossiers_import_mp_statut").select("id");
  query = nDoss4d ? query.eq("n_doss_4d", nDoss4d) : query.is("n_doss_4d", null);
  query = nDossErp ? query.eq("n_doss_erp", nDossErp) : query.is("n_doss_erp", null);
  const { data: existing } = await query.maybeSingle();

  if (existing) {
    const { error } = await supabaseServer
      .from("dossiers_import_mp_statut")
      .update({ statut, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: number }).id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseServer
      .from("dossiers_import_mp_statut")
      .insert([{ n_doss_4d: nDoss4d, n_doss_erp: nDossErp, statut }]);

    if (error) throw new Error(error.message);
  }

  revalidateCommandeMpPages();
}
