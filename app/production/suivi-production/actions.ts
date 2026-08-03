"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

function parseOptionalNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

function parseOptionalText(formData: FormData, name: string) {
  const raw = String(formData.get(name) || "").trim();
  return raw || null;
}

function revalidateRapportPages() {
  revalidatePath("/production/suivi-production");
  revalidatePath("/production/suivi/dashboard");
}

// Fabrication et Conditionnement remplissent le MEME rapport (un seul par
// ligne de programme, donc par code) - peu importe lequel est rempli en
// premier, le second vient completer la meme ligne au lieu d'en creer une
// nouvelle (contrainte unique sur programme_ligne_id cote base).
async function upsertRapport(ligneId: number, fields: Record<string, unknown>) {
  const { error } = await supabaseServer
    .from("production_rapports")
    .upsert([{ programme_ligne_id: ligneId, ...fields }], { onConflict: "programme_ligne_id" });

  if (error) {
    throw new Error(error.message);
  }
}

// Supprime une ligne du tableau "Suivi Production" - une ligne peut
// regrouper jusqu'a 3 entrees (fabrication/conditionnement/emballage,
// chacune de sa propre date), toutes supprimees d'un seul coup avec ce
// bouton. Sans entree du tout (ligne "generale"), c'est le rapport
// lui-meme qui est supprime. La suppression d'une entree retire aussi sa
// quantite du "reste a faire" du Dashboard, qui se recalcule automatiquement
// a partir de ces memes tables.
export async function deleteSuiviProductionRowAction(targets: {
  fabricationId?: number | null;
  conditionnementId?: number | null;
  emballageId?: number | null;
  rapportId?: number | null;
}) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionListe"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette ligne.");
  }

  const { fabricationId, conditionnementId, emballageId, rapportId } = targets;

  if (!fabricationId && !conditionnementId && !emballageId && !rapportId) {
    throw new Error("Rien a supprimer.");
  }

  const deletions: PromiseLike<{ error: { message: string } | null }>[] = [];

  if (fabricationId) {
    deletions.push(supabaseServer.from("production_vrac_entries").delete().eq("id", fabricationId));
  }
  if (conditionnementId) {
    deletions.push(supabaseServer.from("production_carton_entries").delete().eq("id", conditionnementId));
  }
  if (emballageId) {
    deletions.push(supabaseServer.from("production_emballage_entries").delete().eq("id", emballageId));
  }
  if (rapportId) {
    deletions.push(supabaseServer.from("production_rapports").delete().eq("id", rapportId));
  }

  const results = await Promise.all(deletions);
  const failed = results.find((result) => result.error);

  if (failed?.error) {
    throw new Error(failed.error.message);
  }

  revalidatePath("/production/suivi-production");
  revalidatePath("/production/suivi/dashboard");
}

// La zone/chaine appartient a la ligne de programme (programme_lignes), pas
// au rapport (production_rapports) - modification immediate independante du
// Save du rapport, pour corriger une ligne saisie sur la mauvaise chaine.
export async function updateLigneZoneChaineAction(ligneId: number, zone: string, chaine: string) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionConditionnement"))) {
    throw new Error("Cet utilisateur ne peut pas modifier cette ligne.");
  }

  if (!ligneId || !zone || !chaine) {
    throw new Error("Zone/chaine invalide.");
  }

  const { error } = await supabaseServer
    .from("programme_lignes")
    .update({ zone, chaine })
    .eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/suivi-production");
  revalidatePath(`/production/suivi-production/conditionnement/${ligneId}`);
  revalidatePath("/production/suivi/dashboard");
}

export async function saveConditionnementRapportAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionConditionnement"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer de rapport production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const qtFabriquer = parseOptionalNumber(formData, "qt_fabriquer");

  await upsertRapport(ligneId, {
    chef_zone: parseOptionalText(formData, "chef_zone"),
    chef_ligne: parseOptionalText(formData, "chef_ligne"),
    ravitailleur: parseOptionalText(formData, "ravitailleur"),
    tireur: parseOptionalText(formData, "tireur"),
    qt_fabriquer: qtFabriquer,
    cadence: parseOptionalNumber(formData, "cadence"),
    poids_reel: parseOptionalNumber(formData, "poids_reel"),
    dechet_sleeve: parseOptionalNumber(formData, "dechet_sleeve"),
    dechet_capsule: parseOptionalNumber(formData, "dechet_capsule"),
    dechet_pompe: parseOptionalNumber(formData, "dechet_pompe"),
    dechet_flacon: parseOptionalNumber(formData, "dechet_flacon"),
    dechet_pot: parseOptionalNumber(formData, "dechet_pot"),
    dechet_etiquette: parseOptionalNumber(formData, "dechet_etiquette"),
    arret_depot: parseOptionalNumber(formData, "arret_depot"),
    arret_consommable_non_livre: parseOptionalNumber(formData, "arret_consommable_non_livre"),
    arret_manque_conditionnement: parseOptionalNumber(formData, "arret_manque_conditionnement"),
    arret_manque_vrac: parseOptionalNumber(formData, "arret_manque_vrac"),
    arret_technique: parseOptionalNumber(formData, "arret_technique"),
    arret_coupure_courant: parseOptionalNumber(formData, "arret_coupure_courant"),
    arret_raclage_vrac: parseOptionalNumber(formData, "arret_raclage_vrac"),
    arret_changement_lot: parseOptionalNumber(formData, "arret_changement_lot"),
    arret_flacons_nc: parseOptionalNumber(formData, "arret_flacons_nc"),
    arret_autre: parseOptionalNumber(formData, "arret_autre"),
    temps_demarage_lot: parseOptionalText(formData, "temps_demarage_lot"),
    temps_arret_batch: parseOptionalText(formData, "temps_arret_batch"),
    date_fabrication_conditionnement: parseOptionalText(formData, "date_fabrication_conditionnement"),
    date_peremption: parseOptionalText(formData, "date_peremption"),
  });

  // Alimente le journal carton (meme principe que le Dashboard) pour que
  // le "reste" par rapport a la quantite prevue se recalcule tout seul.
  if (qtFabriquer && qtFabriquer > 0) {
    const { error: cartonError } = await supabaseServer.from("production_carton_entries").insert([
      { programme_ligne_id: ligneId, quantite: qtFabriquer },
    ]);

    if (cartonError) {
      throw new Error(cartonError.message);
    }
  }

  revalidateRapportPages();
  redirect("/production/suivi/dashboard");
}

export async function saveFabricationRapportAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionFabrication"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer de rapport production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const vracFabrique = parseOptionalNumber(formData, "vrac_fabrique");

  await upsertRapport(ligneId, {
    machine: parseOptionalText(formData, "machine"),
    type_fabrication: parseOptionalText(formData, "type_fabrication"),
    preparateur: parseOptionalText(formData, "preparateur"),
    cuve_1_numero: parseOptionalText(formData, "cuve_1_numero"),
    cuve_1_poids: parseOptionalNumber(formData, "cuve_1_poids"),
    cuve_2_numero: parseOptionalText(formData, "cuve_2_numero"),
    cuve_2_poids: parseOptionalNumber(formData, "cuve_2_poids"),
    cuve_3_numero: parseOptionalText(formData, "cuve_3_numero"),
    cuve_3_poids: parseOptionalNumber(formData, "cuve_3_poids"),
    cuve_4_numero: parseOptionalText(formData, "cuve_4_numero"),
    cuve_4_poids: parseOptionalNumber(formData, "cuve_4_poids"),
    temps_debut_preparation: parseOptionalText(formData, "temps_debut_preparation"),
    temps_envoi_echantillon_labo: parseOptionalText(formData, "temps_envoi_echantillon_labo"),
    temps_fin_test: parseOptionalText(formData, "temps_fin_test"),
    temps_vidange: parseOptionalText(formData, "temps_vidange"),
    ph: parseOptionalNumber(formData, "ph"),
    densite: parseOptionalNumber(formData, "densite"),
    viscosite: parseOptionalNumber(formData, "viscosite"),
    stabilite: parseOptionalText(formData, "stabilite"),
    vrac_fabrique: vracFabrique,
    qt_vrac_recupere: parseOptionalNumber(formData, "qt_vrac_recupere"),
    code_vrac_recupere: parseOptionalText(formData, "code_vrac_recupere"),
  });

  // Alimente le journal vrac (meme principe que le Dashboard) pour que le
  // "reste" par rapport a la quantite prevue se recalcule tout seul.
  if (vracFabrique && vracFabrique > 0) {
    const { error: vracError } = await supabaseServer.from("production_vrac_entries").insert([
      { programme_ligne_id: ligneId, quantite: vracFabrique },
    ]);

    if (vracError) {
      throw new Error(vracError.message);
    }
  }

  revalidateRapportPages();
  redirect("/production/suivi/dashboard");
}

export async function saveEmballageRapportAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionEmballage"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer de rapport production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const quantite = parseOptionalNumber(formData, "quantite");

  await upsertRapport(ligneId, {
    emballage_machine: parseOptionalText(formData, "emballage_machine"),
    emballage_operateur: parseOptionalText(formData, "emballage_operateur"),
    emballage_scotcheuse: parseOptionalText(formData, "emballage_scotcheuse"),
    emballage_temps_demarrer: parseOptionalText(formData, "emballage_temps_demarrer"),
    emballage_temps_arret: parseOptionalText(formData, "emballage_temps_arret"),
  });

  // Alimente le journal emballage (meme principe que carton/vrac) pour que
  // le "reste" par rapport a ce qui a deja ete conditionne se recalcule
  // tout seul.
  if (quantite && quantite > 0) {
    const { error: emballageError } = await supabaseServer.from("production_emballage_entries").insert([
      { programme_ligne_id: ligneId, quantite },
    ]);

    if (emballageError) {
      throw new Error(emballageError.message);
    }
  }

  revalidateRapportPages();
  redirect("/production/suivi/dashboard");
}
