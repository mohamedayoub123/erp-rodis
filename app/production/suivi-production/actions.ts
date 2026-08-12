"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

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

// Une ligne "Programme par ligne" decoupee en plusieurs lots (voir
// buildDispatcherDraftRows) donne plusieurs codes physiques distincts
// (ex: 9000 -> 3x3000) - Conditionnement/Emballage se font par code (chaque
// lot avance independamment), donc "code" identifie precisement quel rapport
// completer (contrainte unique sur (programme_ligne_id, code) cote base).
// Fabrication reste au niveau de la ligne entiere (code = "") : le vrac est
// fabrique en un seul bloc avant meme d'etre reparti en lots/codes.
async function upsertRapport(ligneId: number, code: string, fields: Record<string, unknown>) {
  const { error } = await supabaseServer
    .from("production_rapports")
    .upsert([{ programme_ligne_id: ligneId, code, ...fields }], {
      onConflict: "programme_ligne_id,code",
    });

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

  if (!(await canDeletePageUser(currentUser, "productionSuiviProductionListe"))) {
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
  // Le code du lot precis en cours de saisie (ex: "AA4141V" sur une ligne
  // decoupee en 3) - vide seulement pour une vieille ligne jamais reouverte
  // depuis l'ajout du suivi par code (voir la page de saisie, qui retombe
  // alors sur l'ancien rapport partage "" pour prefill).
  const code = String(formData.get("code") || "").trim();

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const qtFabriquer = parseOptionalNumber(formData, "qt_fabriquer");
  const dateFabricationConditionnement = parseOptionalText(formData, "date_fabrication_conditionnement");

  await upsertRapport(ligneId, code, {
    chef_zone: parseOptionalText(formData, "chef_zone"),
    chef_ligne: parseOptionalText(formData, "chef_ligne"),
    ravitailleur: parseOptionalText(formData, "ravitailleur"),
    tireur: parseOptionalText(formData, "tireur"),
    nb_journaliers_conditionnement: parseOptionalNumber(formData, "nb_journaliers_conditionnement"),
    qt_fabriquer: qtFabriquer,
    cadence: parseOptionalNumber(formData, "cadence"),
    poids_reel: parseOptionalNumber(formData, "poids_reel"),
    dechet_sleeve: parseOptionalNumber(formData, "dechet_sleeve"),
    dechet_capsule: parseOptionalNumber(formData, "dechet_capsule"),
    dechet_pompe: parseOptionalNumber(formData, "dechet_pompe"),
    dechet_flacon: parseOptionalNumber(formData, "dechet_flacon"),
    dechet_pot: parseOptionalNumber(formData, "dechet_pot"),
    dechet_etiquette: parseOptionalNumber(formData, "dechet_etiquette"),
    dechet_etui: parseOptionalNumber(formData, "dechet_etui"),
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
    date_fabrication_conditionnement: dateFabricationConditionnement,
    date_peremption: parseOptionalText(formData, "date_peremption"),
    utilisateur_conditionnement: currentUser,
    date_saisie_conditionnement: new Date().toISOString(),
  });

  // Alimente le journal carton (meme principe que le Dashboard) pour que
  // le "reste" par rapport a la quantite prevue se recalcule tout seul.
  // date_jour vient de la date saisie sur le rapport (Date fabrication) au
  // lieu de la date automatique (aujourd'hui, valeur par defaut) - c'est ce
  // qui alimente la colonne "Date conditionnement" de Suivi Production.
  if (qtFabriquer && qtFabriquer > 0) {
    const { error: cartonError } = await supabaseServer.from("production_carton_entries").insert([
      {
        programme_ligne_id: ligneId,
        code,
        quantite: qtFabriquer,
        ...(dateFabricationConditionnement ? { date_jour: dateFabricationConditionnement } : {}),
      },
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
  // Comme Conditionnement/Emballage, la Fabrication se saisit desormais par
  // code precis (ex: "AA4141V" parmi les 3 codes d'une ligne decoupee en
  // plusieurs lots) - vide seulement pour une vieille ligne jamais reouverte
  // depuis l'ajout du suivi par code.
  const code = String(formData.get("code") || "").trim();

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const vracFabrique = parseOptionalNumber(formData, "vrac_fabrique");
  const dateFabricationConditionnement = parseOptionalText(formData, "date_fabrication_conditionnement");

  await upsertRapport(ligneId, code, {
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
    degre_alcool: parseOptionalNumber(formData, "degre_alcool"),
    stabilite: parseOptionalText(formData, "stabilite"),
    vrac_fabrique: vracFabrique,
    qt_vrac_recupere: parseOptionalNumber(formData, "qt_vrac_recupere"),
    code_vrac_recupere: parseOptionalText(formData, "code_vrac_recupere"),
    fabrication_arret_absence_air: parseOptionalNumber(formData, "fabrication_arret_absence_air"),
    fabrication_arret_absence_vapeur: parseOptionalNumber(formData, "fabrication_arret_absence_vapeur"),
    fabrication_arret_attente_aspiration_aqueuse: parseOptionalNumber(
      formData,
      "fabrication_arret_attente_aspiration_aqueuse"
    ),
    fabrication_arret_attente_cuves_mobiles: parseOptionalNumber(
      formData,
      "fabrication_arret_attente_cuves_mobiles"
    ),
    fabrication_arret_attente_eau_osmosee: parseOptionalNumber(formData, "fabrication_arret_attente_eau_osmosee"),
    fabrication_arret_coupure_electrique: parseOptionalNumber(formData, "fabrication_arret_coupure_electrique"),
    fabrication_arret_maintenance_plateforme: parseOptionalNumber(
      formData,
      "fabrication_arret_maintenance_plateforme"
    ),
    fabrication_arret_manque_cuves_mobiles: parseOptionalNumber(formData, "fabrication_arret_manque_cuves_mobiles"),
    fabrication_arret_probleme_pompe: parseOptionalNumber(formData, "fabrication_arret_probleme_pompe"),
    fabrication_arret_probleme_ph: parseOptionalNumber(formData, "fabrication_arret_probleme_ph"),
    fabrication_arret_probleme_technique: parseOptionalNumber(formData, "fabrication_arret_probleme_technique"),
    date_fabrication_conditionnement: dateFabricationConditionnement,
    utilisateur_fabrication: currentUser,
    date_saisie_fabrication: new Date().toISOString(),
  });

  // Alimente le journal vrac (meme principe que le Dashboard) pour que le
  // "reste" par rapport a la quantite prevue se recalcule tout seul.
  // date_jour vient de la date saisie sur le rapport (Date fabrication) au
  // lieu de la date automatique (aujourd'hui, valeur par defaut) - c'est ce
  // qui alimente la colonne "Date fabrication" de Suivi Production.
  if (vracFabrique && vracFabrique > 0) {
    const { error: vracError } = await supabaseServer.from("production_vrac_entries").insert([
      {
        programme_ligne_id: ligneId,
        code,
        quantite: vracFabrique,
        ...(dateFabricationConditionnement ? { date_jour: dateFabricationConditionnement } : {}),
      },
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
  const code = String(formData.get("code") || "").trim();

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const quantite = parseOptionalNumber(formData, "quantite");
  const dateEmballage = parseOptionalText(formData, "date_emballage");

  const fields: Record<string, unknown> = {
    emballage_chef_zone: parseOptionalText(formData, "emballage_chef_zone"),
    emballage_machine: parseOptionalText(formData, "emballage_machine"),
    emballage_operateur: parseOptionalText(formData, "emballage_operateur"),
    emballage_scotcheuse: parseOptionalText(formData, "emballage_scotcheuse"),
    nb_journaliers_emballage: parseOptionalNumber(formData, "nb_journaliers_emballage"),
    emballage_temps_demarrer: parseOptionalText(formData, "emballage_temps_demarrer"),
    emballage_temps_arret: parseOptionalText(formData, "emballage_temps_arret"),
    emballage_arret_changement_bobine: parseOptionalNumber(formData, "emballage_arret_changement_bobine"),
    emballage_arret_technique: parseOptionalNumber(formData, "emballage_arret_technique"),
    emballage_arret_reglage: parseOptionalNumber(formData, "emballage_arret_reglage"),
    emballage_arret_coupure: parseOptionalNumber(formData, "emballage_arret_coupure"),
    emballage_arret_autre: parseOptionalNumber(formData, "emballage_arret_autre"),
    date_emballage: dateEmballage,
    utilisateur_emballage: currentUser,
    date_saisie_emballage: new Date().toISOString(),
  };

  // date_peremption vient normalement du rapport Conditionnement DEJA saisi
  // pour ce meme (ligne, code) - meme ligne de production_rapports, colonne
  // partagee entre les etapes (voir upsertRapport). Le formulaire "Entrer"
  // normal ne renvoie donc jamais ce champ (affiche en lecture seule) : ne
  // l'ecrase que si la page l'a explicitement envoye (le cas de la fiche
  // "nouveau", ou aucun Conditionnement n'existe pour fournir la date).
  if (formData.get("date_peremption") !== null) {
    fields.date_peremption = parseOptionalText(formData, "date_peremption");
  }

  await upsertRapport(ligneId, code, fields);

  // Alimente le journal emballage (meme principe que carton/vrac) pour que
  // le "reste" par rapport a ce qui a deja ete conditionne se recalcule
  // tout seul. date_jour vient de la date saisie sur le rapport (Date
  // emballage) au lieu de la date automatique (aujourd'hui, valeur par
  // defaut) - c'est ce qui alimente la colonne "Date emballage" de Suivi
  // Production.
  if (quantite && quantite > 0) {
    const { error: emballageError } = await supabaseServer.from("production_emballage_entries").insert([
      {
        programme_ligne_id: ligneId,
        code,
        quantite,
        ...(dateEmballage ? { date_jour: dateEmballage } : {}),
      },
    ]);

    if (emballageError) {
      throw new Error(emballageError.message);
    }
  }

  revalidateRapportPages();
  redirect("/production/suivi/dashboard");
}

// Bouton "Supprimer" sur la colonne Emballage du Dashboard : efface tout ce
// qui a ete saisi pour CE code precis (carton produit en Conditionnement ET
// quantite emballee), pour qu'il revienne dans la colonne Conditionnement
// au lieu de rester bloque cote Emballage. Un code n'a que ce qu'il a lui
// meme reellement produit (voir upsertRapport/le journal carton/emballage
// scopes par code) - supprimer un code n'affecte jamais les 2 autres.
export async function deleteCodeProgressAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionEmballage"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette ligne.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  if (!ligneId || !code) {
    throw new Error("Ligne ou code invalide.");
  }

  const [cartonResult, emballageResult, rapportResult] = await Promise.all([
    supabaseServer.from("production_carton_entries").delete().eq("programme_ligne_id", ligneId).eq("code", code),
    supabaseServer.from("production_emballage_entries").delete().eq("programme_ligne_id", ligneId).eq("code", code),
    supabaseServer.from("production_rapports").delete().eq("programme_ligne_id", ligneId).eq("code", code),
  ]);

  const failed = [cartonResult, emballageResult, rapportResult].find((result) => result.error);
  if (failed?.error) {
    throw new Error(failed.error.message);
  }

  revalidateRapportPages();
}

// Fiche Conditionnement/Emballage "nouveau" (bouton "+" sur le Dashboard) :
// cree une ligne minimale (pas de quantite prevue, cette fiche n'est pas
// suivie en "reste a faire" - une fois saisie elle disparait simplement,
// comme deja terminee) pour un lot qui ne vient pas d'un programme deja
// dispatche, avec Zone/Chaine/Produit/N de lot choisis a la main, puis
// delegue TOUT le reste (arrets, dechets, dates, quantite...) au meme
// traitement que le Save normal de "Entrer", pour ne jamais dupliquer cette
// logique.
async function createManualEntryLigne(
  formData: FormData,
  permissionKey:
    | "productionSuiviProductionConditionnement"
    | "productionSuiviProductionEmballage"
    | "productionSuiviProductionFabrication",
  dateFieldName: string
): Promise<{ id: number; numeroLot: string }> {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, permissionKey))) {
    throw new Error("Cet utilisateur ne peut pas creer de fiche.");
  }

  const zoneChaine = String(formData.get("zone_chaine") || "").trim();
  const [zone, chaine] = zoneChaine.split("::");
  const articleId = Number(formData.get("article_id") || "0") || null;
  const produit = parseOptionalText(formData, "produit");
  const numeroLot = String(formData.get("numero_lot") || "").trim();
  const dateJour = String(formData.get(dateFieldName) || "").trim();

  if (!zone || !chaine || !numeroLot || !dateJour) {
    throw new Error("Zone, chaine, N de lot et date sont obligatoires.");
  }

  const { data, error } = await supabaseServer
    .from("programme_lignes")
    .insert([
      {
        zone,
        chaine,
        article_id: articleId,
        produit,
        numero_lot: numeroLot,
        date_jour: dateJour,
        confirme_production: true,
        cree_par: currentUser,
      },
    ])
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Erreur pendant la creation de la ligne.");
  }

  return { id: data.id, numeroLot };
}

export async function createManualConditionnementEntryAction(formData: FormData) {
  const { id, numeroLot } = await createManualEntryLigne(
    formData,
    "productionSuiviProductionConditionnement",
    "date_fabrication_conditionnement"
  );
  formData.set("ligne_id", String(id));
  formData.set("code", numeroLot);
  return saveConditionnementRapportAction(formData);
}

export async function createManualEmballageEntryAction(formData: FormData) {
  const { id, numeroLot } = await createManualEntryLigne(
    formData,
    "productionSuiviProductionEmballage",
    "date_emballage"
  );
  formData.set("ligne_id", String(id));
  formData.set("code", numeroLot);
  return saveEmballageRapportAction(formData);
}

export async function createManualFabricationEntryAction(formData: FormData) {
  const { id, numeroLot } = await createManualEntryLigne(
    formData,
    "productionSuiviProductionFabrication",
    "date_fabrication_conditionnement"
  );
  formData.set("ligne_id", String(id));
  formData.set("code", numeroLot);
  return saveFabricationRapportAction(formData);
}
