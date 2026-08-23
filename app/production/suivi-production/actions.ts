"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { resolveVracArticleId } from "@/lib/vrac-article";
import { fetchCoutReelDepuisReservation, fetchCoutVracParKg } from "@/lib/prix-revient";
import {
  COMPTE_EN_COURS_PRODUCTION,
  COMPTE_STOCK_MP,
  creerEcriture,
  enregistrerLotsUtilisesPourEcriture,
  supprimerEcriturePourSource,
} from "@/lib/comptabilite";

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

// Chaque fournee de carton reellement produite doit deduire sa PART de la
// reservation MP tout de suite (pas seulement a "Fin Programme", qui peut
// ne jamais arriver et laissait la reservation bloquee indefiniment - cas
// reel confirme : Sleeve/Capsule/Flacon/Carton restes "reserves" pour
// AA4263V malgre 313/313 cartons deja produits). Part proportionnelle a ce
// que represente CETTE fournee sur le total prevu pour ce code (qtFabriquer
// / cartonPrevu) - jamais plus que ce qui reste reellement reserve. Ce qui
// n'est jamais produit (production arretee en cours de route) reste
// reserve jusqu'a "Fin Programme", qui le LIBERE (redevient disponible
// Depot B) plutot que de le consommer, puisque jamais physiquement pris.
async function consommerCartonProportionnel(
  ligneId: number,
  code: string,
  qtFabriquer: number,
  currentUser: string | null
) {
  const { data: ligneData } = await supabaseServer
    .from("programme_lignes")
    .select("qt_carton, numero_lot_detail")
    .eq("id", ligneId)
    .maybeSingle();
  const ligne = ligneData as
    | { qt_carton: number | null; numero_lot_detail: { code: string; qt_carton: number | null }[] | null }
    | null;
  if (!ligne) return;

  const detailMatch = (ligne.numero_lot_detail ?? []).find((d) => d.code === code);
  const cartonPrevuBrut = detailMatch?.qt_carton ?? ligne.qt_carton ?? null;
  // Arrondi au carton superieur ici aussi (voir computeQtCarton,
  // lib/dispatcher-shared.ts) - numero_lot_detail peut encore contenir une
  // vieille valeur non arrondie (ex: 312.5) pour une ligne enregistree avant
  // le arrondi generalise ailleurs. Sans ce ceil, le ratio qtFabriquer/
  // cartonPrevu ne vaut jamais exactement 1 meme quand tout a ete produit
  // (300/312.5 = 0.96 au lieu de 300/313 = 0.958..., dedduit alors 300.48
  // au lieu de 300 - bug reel confirme, code AA4252).
  const cartonPrevu = cartonPrevuBrut !== null ? Math.ceil(cartonPrevuBrut) : null;
  if (!cartonPrevu || cartonPrevu <= 0) return;

  const { data: codeTermineData } = await supabaseServer
    .from("production_code_termine")
    .select("id")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .eq("stage", "salle_conditionnement")
    .maybeSingle();
  const codeTermine = codeTermineData as { id: number } | null;
  if (!codeTermine) return;

  const { data: reserveData } = await supabaseServer
    .from("production_mp_reserve")
    .select("id, article_mp_id, depot_id, quantite, quantite_initiale, numero_lot")
    .eq("production_code_termine_id", codeTermine.id)
    .gt("quantite", 0);
  const reserves = (reserveData ?? []) as {
    id: number;
    article_mp_id: number;
    depot_id: number;
    quantite: number;
    quantite_initiale: number;
    numero_lot: string | null;
  }[];
  if (reserves.length === 0) return;

  const ratio = Math.min(1, qtFabriquer / cartonPrevu);
  const dateJour = new Date().toISOString().slice(0, 10);

  for (const reserve of reserves) {
    const aDeduire = Math.min(reserve.quantite, Math.round(reserve.quantite_initiale * ratio * 1000) / 1000);
    if (aDeduire <= 1e-9) continue;

    const { error: insertError } = await supabaseServer.from("lots_stock_matiere_premiere").insert({
      article_id: reserve.article_mp_id,
      numero_lot: reserve.numero_lot,
      qte_entree: 0,
      qte_sortie: aDeduire,
      depot_id: reserve.depot_id,
      date_jour: dateJour,
      utilisateur: currentUser,
      note: "Consommation production",
    });
    if (insertError) {
      throw new Error(insertError.message);
    }

    const { error: updateError } = await supabaseServer
      .from("production_mp_reserve")
      .update({ quantite: reserve.quantite - aDeduire })
      .eq("id", reserve.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}

// La ligne appartient a un vrai programme dispatche (Programme MB OU
// Programme par ligne) des que source_numero_programme OU groupe_id est
// renseigne - une fiche "nouveau" (bouton "+" du Dashboard, cree a la
// volee sans passer par aucun programme, voir createManualEntryLigne) ne
// met ni l'un ni l'autre et n'a donc jamais de Fabrication independante a
// attendre en Conditionnement. Bug reel corrige : ne verifiait QUE
// source_numero_programme (rempli uniquement par le flux Programme MB),
// donc toute ligne dispatchee depuis "Programme par ligne" (groupe_id
// rempli, source_numero_programme toujours null, ex: AA4264V) etait vue a
// tort comme une fiche manuelle et sautait le blocage Fabrication.
async function ligneVientDunPogramme(ligneId: number): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("programme_lignes")
    .select("source_numero_programme, groupe_id")
    .eq("id", ligneId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { source_numero_programme: number | null; groupe_id: number | null } | null;
  return row?.source_numero_programme !== null || row?.groupe_id !== null;
}

async function fetchDepotBId(): Promise<number | null> {
  const { data } = await supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle();
  return (data as { id: number } | null)?.id ?? null;
}

// Un doublon EXACT (meme quantite que la toute derniere saisie de ce
// (ligne, code)) vient presque toujours de rouvrir une fiche deja
// enregistree et de re-Enregistrer sans rien changer (le champ garde la
// derniere valeur saisie) - on l'ignore. Toute quantite differente est une
// vraie nouvelle fournee/correction et s'ajoute normalement (voir le cas
// WA1219 : 240 puis 42 etaient 2 productions reelles distinctes, jamais un
// remplacement de l'une par l'autre).
async function dernierEntreeQuantiteIdentique(
  table: "production_vrac_entries" | "production_carton_entries" | "production_emballage_entries",
  ligneId: number,
  code: string,
  quantite: number
): Promise<boolean> {
  const { data } = await supabaseServer
    .from(table)
    .select("quantite")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const derniere = (data as { quantite: number } | null)?.quantite;
  return derniere !== undefined && derniere !== null && Number(derniere) === Number(quantite);
}

async function fabricationDejaProduite(ligneId: number, code: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("production_vrac_entries")
    .select("id")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// Le Test labo n'est pas reserve aux lignes issues d'un Programme - un
// controle qualite doit se faire sur TOUT batch physiquement fabrique, y
// compris une fiche manuelle ("+" du Dashboard).
async function testLaboEstFait(ligneId: number, code: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("production_rapports")
    .select("utilisateur_test_labo")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean((data as { utilisateur_test_labo: string | null } | null)?.utilisateur_test_labo);
}

export async function messageSiTestLaboInvalide(ligneId: number, code: string): Promise<string | null> {
  if (!(await testLaboEstFait(ligneId, code))) {
    return "Le Test labo doit etre enregistre avant de pouvoir saisir la Fabrication pour ce code.";
  }
  return null;
}

// Recalcule le hors-spec cote serveur (meme logique que NumericSpecField/
// stabilite/couleur/odeur du formulaire Test labo) - jamais confiance au
// seul calcul client pour decider si l'enregistrement doit etre bloque.
// sousDerogation debloque volontairement l'enregistrement malgre un hors
// spec, le motif etant trace separement sur le rapport.
async function messageSiHorsSpecSansDerogation(
  ligneId: number,
  values: {
    ph: number | null;
    densite: number | null;
    viscosite: number | null;
    degreAlcool: number | null;
    stabilite: string | null;
    couleur: string | null;
    odeur: string | null;
    tauxHumidite: number | null;
    pressionAtmospherique: number | null;
    texture: string | null;
    temperatureTest: number | null;
    sousDerogation: boolean;
  }
): Promise<string | null> {
  if (values.sousDerogation) return null;

  const { data: ligneData } = await supabaseServer
    .from("programme_lignes")
    .select("article_id")
    .eq("id", ligneId)
    .maybeSingle();
  const articleId = (ligneData as { article_id: number | null } | null)?.article_id ?? null;
  if (!articleId) return null;

  const vracArticleId = await resolveVracArticleId(articleId);
  if (!vracArticleId) return null;

  const { data: specData } = await supabaseServer
    .from("articles_specs_qualite")
    .select(
      "ph_min, ph_max, viscosite_min, viscosite_max, densite_min, densite_max, degre_alcool_min, degre_alcool_max, stabilite, couleur, taux_humidite_min, taux_humidite_max, pression_atmospherique_min, pression_atmospherique_max, texture, temperature_min, temperature_max"
    )
    .eq("article_id", vracArticleId)
    .maybeSingle();
  const spec = specData as {
    ph_min: number | null;
    ph_max: number | null;
    viscosite_min: number | null;
    viscosite_max: number | null;
    densite_min: number | null;
    densite_max: number | null;
    degre_alcool_min: number | null;
    degre_alcool_max: number | null;
    stabilite: string | null;
    couleur: string | null;
    taux_humidite_min: number | null;
    taux_humidite_max: number | null;
    pression_atmospherique_min: number | null;
    pression_atmospherique_max: number | null;
    texture: string | null;
    temperature_min: number | null;
    temperature_max: number | null;
  } | null;
  if (!spec) return null;

  function horsRange(value: number | null, min: number | null, max: number | null): boolean {
    if (value === null || min === null || max === null) return false;
    return value < min || value > max;
  }

  const horsSpec =
    horsRange(values.ph, spec.ph_min, spec.ph_max) ||
    horsRange(values.densite, spec.densite_min, spec.densite_max) ||
    horsRange(values.viscosite, spec.viscosite_min, spec.viscosite_max) ||
    horsRange(values.degreAlcool, spec.degre_alcool_min, spec.degre_alcool_max) ||
    horsRange(values.tauxHumidite, spec.taux_humidite_min, spec.taux_humidite_max) ||
    horsRange(values.pressionAtmospherique, spec.pression_atmospherique_min, spec.pression_atmospherique_max) ||
    horsRange(values.temperatureTest, spec.temperature_min, spec.temperature_max) ||
    (Boolean(spec.stabilite) && values.stabilite !== "" && values.stabilite !== null && values.stabilite !== spec.stabilite) ||
    (Boolean(spec.couleur) &&
      values.couleur !== null &&
      values.couleur.trim() !== "" &&
      values.couleur.trim().toLowerCase() !== (spec.couleur || "").trim().toLowerCase()) ||
    (Boolean(spec.texture) &&
      values.texture !== null &&
      values.texture.trim() !== "" &&
      values.texture.trim().toLowerCase() !== (spec.texture || "").trim().toLowerCase()) ||
    values.odeur === "Non OK";

  if (horsSpec) {
    return 'Au moins un parametre est hors spec - coche "Je valide sous derogation" pour enregistrer quand meme.';
  }
  return null;
}

// Statut qualite decide au Test labo - s'applique a TOUT code (y compris une
// fiche manuelle), meme principe que testLaboEstFait : un vrac "A recuperer"
// ou "A detruire" ne peut jamais etre conditionne tel quel. Une fiche
// manuelle (pas de vrai Programme source) n'a pas de Fabrication a attendre.
export async function messageSiConditionnementInvalide(ligneId: number, code: string): Promise<string | null> {
  if (!code) return null;

  // Les 3 requetes ne dependent que de (ligneId, code), jamais l'une du
  // resultat de l'autre - lancees en parallele au lieu d'enchainer 3
  // allers-retours reseau sequentiels vers Supabase (c'etait la moitie du
  // temps de latence ressenti au Save du Conditionnement).
  const [rapportResult, vientDunProgramme, fabricationFaite] = await Promise.all([
    supabaseServer
      .from("production_rapports")
      .select("disposition_qualite")
      .eq("programme_ligne_id", ligneId)
      .eq("code", code)
      .maybeSingle(),
    ligneVientDunPogramme(ligneId),
    fabricationDejaProduite(ligneId, code),
  ]);

  const dispositionQualite = (rapportResult.data as { disposition_qualite: string | null } | null)
    ?.disposition_qualite;
  if (dispositionQualite === "a_recuperer") {
    return 'Ce vrac est marque "A recuperer" au Test labo - il ne peut pas etre conditionne tel quel.';
  }
  if (dispositionQualite === "a_detruire") {
    return 'Ce vrac est marque "A detruire" au Test labo - il ne peut pas etre conditionne.';
  }

  if (!vientDunProgramme) return null;
  if (!fabricationFaite) {
    return "La Fabrication doit etre faite (vrac produit) avant de pouvoir saisir le Conditionnement pour ce code.";
  }
  return null;
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
//
// Efface aussi les marqueurs "Besoin valide" (pesage/salle_conditionnement,
// production_code_termine) et leurs reservations MP (production_mp_reserve)
// pour ce meme (ligneId, code) - ces 2 tables n'ont AUCUNE autre page/bouton
// pour les supprimer (voir Salle de pesage/conditionnement), donc sans ce
// nettoyage ici, elles restaient bloquees pour toujours et empechaient la
// suppression du Programme par ligne parent (bug reel signale : "PL181.2026
// refuse de s'effacer" alors que fabrication/conditionnement/emballage/
// rapport avaient deja tous ete supprimes un par un).
export async function deleteSuiviProductionRowAction(targets: {
  fabricationId?: number | null;
  conditionnementId?: number | null;
  emballageId?: number | null;
  rapportId?: number | null;
  ligneId: number;
  code: string;
}) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "productionSuiviProductionListe"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette ligne.");
  }

  const { fabricationId, conditionnementId, emballageId, rapportId, ligneId, code } = targets;

  // ligneId/code seuls (les 4 autres deja supprimes precedemment) restent
  // un cas valide - c'est justement ce qui manquait pour finir de nettoyer
  // une ligne dont il ne reste plus que ses marqueurs Besoin valide.
  if (!fabricationId && !conditionnementId && !emballageId && !rapportId && !(ligneId && code)) {
    throw new Error("Rien a supprimer.");
  }

  const deletions: PromiseLike<{ error: { message: string } | null } | void>[] = [];

  if (fabricationId) {
    deletions.push(supabaseServer.from("production_vrac_entries").delete().eq("id", fabricationId));
    // Sans ca, l'ecriture comptable "fabrication_vrac" de ce vrac restait
    // dans le Journal apres suppression de sa source (bug remonte par
    // l'utilisateur : "si j'efface il faut que le montant parte aussi").
    // Meme sourceId que celui qui la cree (voir plus haut, ligne ~725).
    deletions.push(supprimerEcriturePourSource("fabrication_vrac", `${ligneId}-${code}`));
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

  if (ligneId && code) {
    deletions.push(deleteCodeTermineEtReserves(ligneId, code, currentUser));
  }

  const results = await Promise.all(deletions);
  const failed = results.find((result) => result?.error);

  if (failed?.error) {
    throw new Error(failed.error.message);
  }

  revalidatePath("/production/suivi-production");
  revalidatePath("/production/suivi/dashboard");
}

// production_mp_reserve reference production_code_termine (pas
// programme_lignes directement) - doit etre supprimee AVANT, sinon la
// suppression de production_code_termine echoue sur la contrainte de cle
// etrangere.
//
// AVANT d'effacer une reserve, restitue au stock ce qu'elle avait deja
// physiquement sorti (consommerCartonProportionnel/consommerRemainingMpReserve
// reduisent reserve.quantite au fur et a mesure SANS jamais toucher
// quantite_initiale - la difference est donc exactement ce qui a deja ete
// sorti reellement). Sans ca, supprimer une ligne dont la Fabrication ou le
// Conditionnement avait deja consomme de la matiere laissait cette sortie a
// jamais orpheline (bug reel signale : stock reste a -15000 apres avoir
// efface le code qui l'avait consomme, meme apres suppression complete de
// la ligne).
async function deleteCodeTermineEtReserves(
  ligneId: number,
  code: string,
  currentUser: string | null
): Promise<{ error: { message: string } | null }> {
  const { data: codeTermineRows, error: fetchError } = await supabaseServer
    .from("production_code_termine")
    .select("id")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .in("stage", ["pesage", "salle_conditionnement"]);

  if (fetchError) return { error: fetchError };

  const codeTermineIds = (codeTermineRows ?? []).map((row) => row.id);
  if (codeTermineIds.length === 0) return { error: null };

  const { data: reserveRows, error: reserveFetchError } = await supabaseServer
    .from("production_mp_reserve")
    .select("article_mp_id, depot_id, numero_lot, quantite, quantite_initiale")
    .in("production_code_termine_id", codeTermineIds);
  if (reserveFetchError) return { error: reserveFetchError };

  const reserves = (reserveRows ?? []) as {
    article_mp_id: number;
    depot_id: number;
    numero_lot: string | null;
    quantite: number;
    quantite_initiale: number;
  }[];
  const dateJour = new Date().toISOString().slice(0, 10);
  const restitutions = reserves
    .map((reserve) => ({
      article_id: reserve.article_mp_id,
      numero_lot: reserve.numero_lot,
      qte_entree: Math.round((reserve.quantite_initiale - reserve.quantite) * 1000) / 1000,
      qte_sortie: 0,
      depot_id: reserve.depot_id,
      date_jour: dateJour,
      utilisateur: currentUser,
      note: "Restitution stock (ligne/code supprime)",
    }))
    .filter((row) => row.qte_entree > 1e-9);

  if (restitutions.length > 0) {
    const { error: restitutionError } = await supabaseServer
      .from("lots_stock_matiere_premiere")
      .insert(restitutions);
    if (restitutionError) return { error: restitutionError };
  }

  const { error: reserveError } = await supabaseServer
    .from("production_mp_reserve")
    .delete()
    .in("production_code_termine_id", codeTermineIds);
  if (reserveError) return { error: reserveError };

  const { error: codeTermineError } = await supabaseServer
    .from("production_code_termine")
    .delete()
    .in("id", codeTermineIds);
  return { error: codeTermineError };
}

// Nettoyage complet de TOUTES les traces de production d'une ligne entiere
// (tous ses codes) - Fabrication, Conditionnement, Emballage, Rapports,
// marqueurs Besoin valide/reserves MP, et leurs ecritures comptables
// (fabrication_vrac/conditionnement_mp). Reutilise ici pour que "Supprimer"
// depuis le Dashboard/Rapport Ecarts efface vraiment tout comme promis,
// au lieu de ne supprimer que la ligne et laisser des restes orphelins
// (bug reel : Cout Reel continuait a compter une fabrication dont la ligne
// parente n'existait plus). Ne touche jamais au stock Produit Fini deja
// entre (lots_stock) ni a son ecriture entree_production - un stock deja
// entre peut deja avoir ete vendu/livre, sa suppression reste un choix
// separe et explicite (Gestion Stock PF), jamais automatique ici.
export async function supprimerToutesTracesProductionPourLigne(
  ligneId: number,
  currentUser: string | null
): Promise<{ error: string | null }> {
  const [{ data: vracRows }, { data: cartonRows }, { data: emballageRows }, { data: rapportRows }, { data: codeTermineRows }] =
    await Promise.all([
      supabaseServer.from("production_vrac_entries").select("id, code").eq("programme_ligne_id", ligneId),
      supabaseServer.from("production_carton_entries").select("id, code").eq("programme_ligne_id", ligneId),
      supabaseServer.from("production_emballage_entries").select("id").eq("programme_ligne_id", ligneId),
      supabaseServer.from("production_rapports").select("id").eq("programme_ligne_id", ligneId),
      supabaseServer.from("production_code_termine").select("code").eq("programme_ligne_id", ligneId),
    ]);

  const vrac = (vracRows ?? []) as { id: number; code: string }[];
  const carton = (cartonRows ?? []) as { id: number; code: string }[];
  const emballage = (emballageRows ?? []) as { id: number }[];
  const rapports = (rapportRows ?? []) as { id: number }[];
  const codes = new Set<string>([
    ...vrac.map((row) => row.code),
    ...carton.map((row) => row.code),
    ...((codeTermineRows ?? []) as { code: string }[]).map((row) => row.code),
  ]);

  const deletions: PromiseLike<{ error: { message: string } | null } | void>[] = [];

  for (const row of vrac) {
    deletions.push(supabaseServer.from("production_vrac_entries").delete().eq("id", row.id));
    deletions.push(supprimerEcriturePourSource("fabrication_vrac", `${ligneId}-${row.code}`));
  }
  for (const row of carton) {
    deletions.push(supabaseServer.from("production_carton_entries").delete().eq("id", row.id));
    deletions.push(supprimerEcriturePourSource("conditionnement_mp", `${ligneId}-${row.code}`));
  }
  if (emballage.length > 0) {
    deletions.push(supabaseServer.from("production_emballage_entries").delete().in("id", emballage.map((row) => row.id)));
  }
  if (rapports.length > 0) {
    deletions.push(supabaseServer.from("production_rapports").delete().in("id", rapports.map((row) => row.id)));
  }
  for (const code of codes) {
    deletions.push(deleteCodeTermineEtReserves(ligneId, code, currentUser));
  }

  const results = await Promise.all(deletions);
  const failed = results.find((result) => result?.error);
  return { error: failed?.error?.message ?? null };
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
  // Present seulement quand le formulaire a ete pre-rempli depuis une
  // fournee existante (voir la page) - id de CETTE fournee, pour corriger
  // sa ligne au lieu d'en creer une nouvelle. Vide sur "Nouvelle fournee"
  // (lien explicite sur la page, formulaire remis a zero).
  const fourneeId = Number(String(formData.get("fournee_id") || "0")) || null;

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const erreurConditionnement = await messageSiConditionnementInvalide(ligneId, code);
  if (erreurConditionnement) {
    redirect(
      `/production/suivi-production/conditionnement/${ligneId}?code=${encodeURIComponent(code)}&erreur=${encodeURIComponent(erreurConditionnement)}`
    );
  }

  const qtFabriquer = parseOptionalNumber(formData, "qt_fabriquer");
  const dateFabricationConditionnement = parseOptionalText(formData, "date_fabrication_conditionnement");

  // date_fabrication_conditionnement/date_peremption restent sur
  // production_rapports (proprietes du LOT/code, pas de la fournee physique
  // - la meme date vaut pour toutes les fournees d'un code, y compris celle
  // saisie depuis Fabrication - voir fabrication-form.tsx). Tout le reste
  // (chef/ravitailleur/dechets/arrets...) va desormais directement sur la
  // ligne production_carton_entries de CETTE fournee (voir plus bas) - bug
  // reel corrige : ces champs etaient avant ecrases a chaque nouvelle
  // fournee du meme code (cas reel AA4238V, 3 fournees sur 3 chaines,
  // seule la derniere survivait).
  //
  // upsertRapport et la verification anti-doublon (dernierEntreeQuantiteIdentique)
  // ne dependent pas l'une de l'autre - lancees en parallele. NB: le
  // Conditionnement se saisit en realite comme un AJOUT (chaque fournee
  // produite depuis la derniere saisie), pas un total cumule - confirme par
  // le cas WA1219 (240 puis 42 etaient 2 vraies fournees distinctes, 282 au
  // total) apres qu'un remplacement automatique ait par erreur efface la
  // 2e. Seul un doublon EXACT (meme quantite que la toute derniere saisie -
  // rouvrir la fiche et re-Enregistrer sans rien changer) est ignore ;
  // toute quantite differente s'ajoute normalement.
  // Chaine/zone figees au moment de CETTE fournee (voir insert plus bas) -
  // bug reel corrige : avant lues depuis programme_lignes.chaine/zone (un
  // seul champ partage par ligne), le selecteur Zone/Chaine de la page
  // Conditionnement (updateLigneZoneChaineAction, modification immediate
  // independante du Save) repeignait alors RETROACTIVEMENT la chaine de
  // TOUTES les fournees deja saisies pour cette ligne des qu'on changeait la
  // chaine pour la fournee suivante (cas reel : chaine 7 -> 2 -> 3, les 3
  // fournees affichaient "chaine 3" a la fin).
  const [{ data: ligneChaineData }, , dejaCompteIdentique, fourneeExistanteResult] = await Promise.all([
    supabaseServer.from("programme_lignes").select("chaine, zone").eq("id", ligneId).maybeSingle(),
    upsertRapport(ligneId, code, {
      date_fabrication_conditionnement: dateFabricationConditionnement,
      date_peremption: parseOptionalText(formData, "date_peremption"),
    }),
    qtFabriquer && qtFabriquer > 0
      ? dernierEntreeQuantiteIdentique("production_carton_entries", ligneId, code, qtFabriquer)
      : Promise.resolve(false),
    fourneeId
      ? supabaseServer.from("production_carton_entries").select("qt_fabriquer").eq("id", fourneeId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const ligneChaine = ligneChaineData as { chaine: string | null; zone: string | null } | null;
  // Correction d'une fournee DEJA saisie (voir la page, hidden "fournee_id")
  // plutot qu'un ajout : seulement si la quantite n'a pas change, car
  // consommerCartonProportionnel a deja deduit la reservation MP pour cette
  // quantite exacte a la creation - la re-deduire ici ferait une 2e
  // deduction fictive pour la MEME production reelle (bug reel confirme,
  // code AA4252 : "Consommation production" x2 pour le meme lot). Si la
  // quantite a change, on retombe sur le comportement normal (nouvelle
  // ligne, nouvelle deduction proportionnelle a la difference reelle
  // produite) - une quantite differente est une vraie nouvelle information
  // de production, pas juste une correction de saisie.
  const fourneeExistante = fourneeExistanteResult.data as { qt_fabriquer: number | null } | null;
  const modeCorrection =
    fourneeId !== null && fourneeExistante !== null && Number(fourneeExistante.qt_fabriquer ?? 0) === Number(qtFabriquer ?? 0);

  // Alimente le journal carton (meme principe que le Dashboard) pour que le
  // "reste" par rapport a la quantite prevue se recalcule tout seul.
  // date_jour vient de la date saisie sur le rapport (Date fabrication) au
  // lieu de la date automatique (aujourd'hui, valeur par defaut) - c'est ce
  // qui alimente la colonne "Date conditionnement" de Suivi Production.
  // Toutes les infos de CETTE fournee (chef/ravitailleur/dechets/arrets...)
  // sont portees directement par cette ligne, plus jamais partagees avec
  // les autres fournees du meme code.
  const fourneeFields = {
    chef_zone: parseOptionalText(formData, "chef_zone"),
    chef_ligne: parseOptionalText(formData, "chef_ligne"),
    ravitailleur: parseOptionalText(formData, "ravitailleur"),
    tireur: parseOptionalText(formData, "tireur"),
    nb_journaliers_conditionnement: parseOptionalNumber(formData, "nb_journaliers_conditionnement"),
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
  };

  const cartonInsert =
    modeCorrection && fourneeId
      ? await supabaseServer
          .from("production_carton_entries")
          .update({
            ...fourneeFields,
            quantite: qtFabriquer,
            qt_fabriquer: qtFabriquer,
            ...(dateFabricationConditionnement ? { date_jour: dateFabricationConditionnement } : {}),
            chaine: ligneChaine?.chaine ?? null,
            zone: ligneChaine?.zone ?? null,
            utilisateur_conditionnement: currentUser,
            date_saisie_conditionnement: new Date().toISOString(),
          })
          .eq("id", fourneeId)
      : qtFabriquer && qtFabriquer > 0 && !dejaCompteIdentique
        ? await supabaseServer.from("production_carton_entries").insert([
            {
              programme_ligne_id: ligneId,
              code,
              quantite: qtFabriquer,
              ...(dateFabricationConditionnement ? { date_jour: dateFabricationConditionnement } : {}),
              chaine: ligneChaine?.chaine ?? null,
              zone: ligneChaine?.zone ?? null,
              ...fourneeFields,
              qt_fabriquer: qtFabriquer,
              utilisateur_conditionnement: currentUser,
              date_saisie_conditionnement: new Date().toISOString(),
            },
          ])
        : { error: null };

  if (cartonInsert.error) {
    throw new Error(cartonInsert.error.message);
  }

  if (!modeCorrection && qtFabriquer && qtFabriquer > 0 && !dejaCompteIdentique) {
    await consommerCartonProportionnel(ligneId, code, qtFabriquer, currentUser);
  }

  revalidateRapportPages();
  redirect("/production/suivi/dashboard");
}

// Recalcule (efface + recree si un cout est trouve) l'ecriture comptable
// "fabrication_vrac" d'un code precis, a partir de l'etat ACTUELLEMENT
// enregistre (production_rapports.vrac_fabrique) - jamais depuis des
// valeurs de formulaire, pour pouvoir etre rappelee hors d'un Enregistrer
// (voir lib/ecriture-recompute.ts, quand le prix d'un lot MP deja utilise
// ici est corrige apres coup). Exportee pour ca ; appelee aussi directement
// par saveFabricationRapportAction juste apres avoir enregistre le rapport.
export async function recalculerEcritureFabricationVrac(
  ligneId: number,
  code: string,
  currentUser: string | null,
  options?: { requireTrace?: boolean }
): Promise<void> {
  const sourceId = `${ligneId}-${code}`;
  await supprimerEcriturePourSource("fabrication_vrac", sourceId);

  const { data: rapportData } = await supabaseServer
    .from("production_rapports")
    .select("vrac_fabrique, date_fabrication_conditionnement")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .maybeSingle();
  const rapport = rapportData as
    | { vrac_fabrique: number | null; date_fabrication_conditionnement: string | null }
    | null;
  const vracFabrique = rapport?.vrac_fabrique ?? null;
  if (!vracFabrique || vracFabrique <= 0) return;

  const { data: ligneData } = await supabaseServer
    .from("programme_lignes")
    .select("article_id")
    .eq("id", ligneId)
    .maybeSingle();
  const articleId = (ligneData as { article_id: number | null } | null)?.article_id ?? null;
  const vracArticleId = articleId ? await resolveVracArticleId(articleId) : null;
  if (!vracArticleId) return;

  // Prefere le cout REEL des lots effectivement reserves/consommes pour ce
  // (ligneId, code) en salle de pesage (production_mp_reserve garde la trace
  // exacte, meme si ces lots sont aujourd'hui epuises) - ne se rabat sur une
  // estimation FEFO du stock actuel que si aucune reservation n'a jamais
  // existe pour cette production (systeme trop ancien).
  const { data: codeTermineData } = await supabaseServer
    .from("production_code_termine")
    .select("id")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .eq("stage", "pesage")
    .maybeSingle();
  const codeTermine = codeTermineData as { id: number } | null;
  const coutReel = codeTermine ? await fetchCoutReelDepuisReservation(codeTermine.id) : null;

  let montant: number;
  let lotsAEnregistrer;
  if (coutReel && coutReel.lotsUtilises.length > 0) {
    montant = coutReel.coutFcfa;
    lotsAEnregistrer = coutReel.lotsUtilises;
  } else {
    // Aucune reservation tracee (systeme trop ancien) : le mode strict
    // (utilise par le rattrapage historique) refuse d'inventer un cout
    // approximatif plutot que d'estimer via FEFO sur le stock actuel.
    if (options?.requireTrace) return;
    const coutVrac = await fetchCoutVracParKg(vracArticleId, vracFabrique);
    if (coutVrac.coutParKg === null) return;
    montant = coutVrac.coutTotal;
    lotsAEnregistrer = coutVrac.lotsUtilises;
  }
  if (montant <= 0) return;

  const ecritureId = await creerEcriture({
    dateEcriture: rapport?.date_fabrication_conditionnement || new Date().toISOString().slice(0, 10),
    pieceReference: code,
    libelle: `Fabrication - ${code}`,
    sourceType: "fabrication_vrac",
    sourceId,
    createdBy: currentUser,
    lignes: [
      { compteCode: COMPTE_EN_COURS_PRODUCTION, debit: montant, credit: 0 },
      { compteCode: COMPTE_STOCK_MP, debit: 0, credit: montant },
    ],
  });
  await enregistrerLotsUtilisesPourEcriture(ecritureId, lotsAEnregistrer);
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

  const erreurTestLabo = await messageSiTestLaboInvalide(ligneId, code);
  if (erreurTestLabo) {
    redirect(
      `/production/suivi-production/fabrication/${ligneId}?code=${encodeURIComponent(code)}&erreur=${encodeURIComponent(erreurTestLabo)}`
    );
  }

  const vracFabrique = parseOptionalNumber(formData, "vrac_fabrique");
  const dateFabricationConditionnement = parseOptionalText(formData, "date_fabrication_conditionnement");

  // upsertRapport (production_rapports) et la suppression de l'ancienne
  // entree vrac ne dependent pas l'une de l'autre - lancees en parallele ;
  // l'insertion de la nouvelle entree n'a besoin d'attendre que cette
  // suppression (le resultat d'upsertRapport ne l'affecte pas).
  const [, vracDelete] = await Promise.all([
    upsertRapport(ligneId, code, {
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
      nb_journaliers_fabrication: parseOptionalNumber(formData, "nb_journaliers_fabrication"),
      temps_debut_preparation: parseOptionalText(formData, "temps_debut_preparation"),
      temps_envoi_echantillon_labo: parseOptionalText(formData, "temps_envoi_echantillon_labo"),
      temps_fin_test: parseOptionalText(formData, "temps_fin_test"),
      temps_vidange: parseOptionalText(formData, "temps_vidange"),
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
    }),
    // La Fabrication d'un code est un seul evenement (une seule "cuvee"),
    // pas une accumulation au fil des saisies comme Conditionnement/
    // Emballage - vrac_fabrique est deja LA SOMME des 4 cuves a chaque
    // Save (voir fabrication-form.tsx). Retirer l'ancienne entree avant
    // d'inserer la nouvelle evite qu'une correction (ex: cuve 2 remplie
    // apres coup) ne s'AJOUTE a l'ancien total au lieu de le remplacer -
    // sans ca, un code fabrique en plusieurs saisies progressives (cuve 1
    // puis cuve 2...) finissait avec autant de lignes "Fabrication" que de
    // saisies, chacune montrant les memes cuves (upsertRapport n'a qu'une
    // valeur courante) mais un total vrac different.
    vracFabrique && vracFabrique > 0
      ? supabaseServer.from("production_vrac_entries").delete().eq("programme_ligne_id", ligneId).eq("code", code)
      : Promise.resolve({ error: null }),
  ]);

  if (vracDelete.error) {
    throw new Error(vracDelete.error.message);
  }

  // Alimente le journal vrac (meme principe que le Dashboard) pour que le
  // "reste" par rapport a la quantite prevue se recalcule tout seul.
  // date_jour vient de la date saisie sur le rapport (Date fabrication) au
  // lieu de la date automatique (aujourd'hui, valeur par defaut) - c'est ce
  // qui alimente la colonne "Date fabrication" de Suivi Production.
  const vracInsert =
    vracFabrique && vracFabrique > 0
      ? await supabaseServer.from("production_vrac_entries").insert([
          {
            programme_ligne_id: ligneId,
            code,
            quantite: vracFabrique,
            ...(dateFabricationConditionnement ? { date_jour: dateFabricationConditionnement } : {}),
          },
        ])
      : { error: null };

  if (vracInsert.error) {
    throw new Error(vracInsert.error.message);
  }

  // Ecriture comptable automatique (En-cours de production/Stock MP) - meme
  // remplacement que production_vrac_entries (une Fabrication = un seul
  // evenement, jamais un ajout). Try/catch qui n'interrompt pas
  // l'enregistrement du rapport si la comptabilite echoue.
  if (vracFabrique && vracFabrique > 0) {
    try {
      await recalculerEcritureFabricationVrac(ligneId, code, currentUser);
    } catch (comptaError) {
      console.error("Ecriture comptable fabrication echouee:", comptaError);
    }
  }

  revalidateRapportPages();
  redirect("/production/suivi/dashboard");
}

export async function saveTestLaboAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionTestLabo"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer de test labo.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const ph = parseOptionalNumber(formData, "ph");
  const densite = parseOptionalNumber(formData, "densite");
  const viscosite = parseOptionalNumber(formData, "viscosite");
  const degreAlcool = parseOptionalNumber(formData, "degre_alcool");
  const stabilite = parseOptionalText(formData, "stabilite");
  const couleur = parseOptionalText(formData, "couleur");
  const odeur = parseOptionalText(formData, "odeur");
  const tauxHumidite = parseOptionalNumber(formData, "taux_humidite");
  const pressionAtmospherique = parseOptionalNumber(formData, "pression_atmospherique");
  const texture = parseOptionalText(formData, "texture");
  const temperatureTest = parseOptionalNumber(formData, "temperature_test");
  const sousDerogation = formData.get("sous_derogation") === "on";
  const motifDerogation = parseOptionalText(formData, "motif_derogation");

  // Recalcule le hors-spec cote serveur (meme logique que le formulaire) -
  // jamais confiance au seul calcul client pour bloquer l'enregistrement.
  // Odeur "Non OK" compte aussi comme hors-spec meme si elle n'a pas de
  // borne min/max dans articles_specs_qualite.
  const erreurHorsSpec = await messageSiHorsSpecSansDerogation(ligneId, {
    ph,
    densite,
    viscosite,
    degreAlcool,
    stabilite,
    couleur,
    odeur,
    tauxHumidite,
    pressionAtmospherique,
    texture,
    temperatureTest,
    sousDerogation,
  });
  if (erreurHorsSpec) {
    redirect(
      `/production/suivi-production/fabrication/${ligneId}/test-labo?code=${encodeURIComponent(code)}&erreur=${encodeURIComponent(erreurHorsSpec)}`
    );
  }

  await upsertRapport(ligneId, code, {
    ph,
    densite,
    viscosite,
    degre_alcool: degreAlcool,
    stabilite,
    couleur,
    temperature_test: temperatureTest,
    odeur,
    taux_humidite: tauxHumidite,
    pression_atmospherique: pressionAtmospherique,
    texture,
    remarque: parseOptionalText(formData, "remarque"),
    disposition_qualite: parseOptionalText(formData, "disposition_qualite"),
    sous_derogation: sousDerogation,
    motif_derogation: motifDerogation,
    date_prise_echantillon: parseOptionalText(formData, "date_prise_echantillon"),
    heure_prise_echantillon: parseOptionalText(formData, "heure_prise_echantillon"),
    heure_debut_analyse: parseOptionalText(formData, "heure_debut_analyse"),
    heure_fin_analyse: parseOptionalText(formData, "heure_fin_analyse"),
    // Jamais tape a la main, meme principe que utilisateur_test_labo -
    // constant tant qu'il n'existe qu'un seul labo.
    nom_labo: "Laboratoire Rodis",
    utilisateur_test_labo: currentUser,
    date_saisie_test_labo: new Date().toISOString(),
  });

  revalidateRapportPages();
  revalidatePath(`/production/suivi-production/fabrication/${ligneId}/test-labo`);
  redirect("/production/suivi/dashboard");
}

// Ajout ponctuel de matiere premiere pour corriger un parametre non
// conforme constate au Test labo (ex: ajuster le pH) - action separee du
// Save du test (pas un champ a re-upserter a l'identique a chaque
// correction de couleur/remarque) : chaque clic est une VRAIE sortie de
// stock physique, jamais reversible/idempotente comme le reste du rapport.
export async function ajouterAjustementMpTestLaboAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionTestLabo"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer d'ajustement.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();
  const articleId = Number(String(formData.get("article_id") || "0"));
  const numeroLot = parseOptionalText(formData, "numero_lot");
  const quantite = parseOptionalNumber(formData, "quantite");
  const note = parseOptionalText(formData, "note");

  if (!ligneId || !articleId || !numeroLot || !quantite || quantite <= 0) {
    throw new Error("Ajustement matiere premiere invalide.");
  }

  const depotId = await fetchDepotBId();

  const { error } = await supabaseServer.from("lots_stock_matiere_premiere").insert({
    article_id: articleId,
    numero_lot: numeroLot,
    code_normalise: numeroLot.toUpperCase(),
    qte_entree: 0,
    qte_sortie: quantite,
    depot_id: depotId,
    date_jour: new Date().toISOString().slice(0, 10),
    utilisateur: currentUser,
    note: note ? `Ajustement qualite fabrication - ${note}` : "Ajustement qualite fabrication",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/production/suivi-production/fabrication/${ligneId}/test-labo`);
  revalidatePath("/stock/matiere-premiere/stock-actuel");
  revalidatePath("/produit");
  redirect(`/production/suivi-production/fabrication/${ligneId}/test-labo?code=${encodeURIComponent(code)}&ajuste=1`);
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

  // date_emballage/date_peremption restent sur production_rapports
  // (proprietes du lot/code) - tout le reste (chef/machine/operateur/
  // scotcheuse/arrets/temps...) va desormais directement sur la ligne
  // production_emballage_entries de CETTE fournee (meme correctif que
  // Conditionnement juste au-dessus - bug reel d'ecrasement entre plusieurs
  // fournees du meme code).
  const fields: Record<string, unknown> = {
    date_emballage: dateEmballage,
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
  // Production. L'emballage se saisit comme un AJOUT (voir Conditionnement
  // plus haut, meme conclusion apres le cas WA1219). Toutes les infos de
  // CETTE fournee sont portees directement par cette ligne, plus jamais
  // partagees avec les autres fournees du meme code.
  //
  // PAS de dernierEntreeQuantiteIdentique ici, contrairement a Vrac/Carton :
  // ce champ "quantite" repart TOUJOURS de 0 sur ce formulaire (pas de
  // colonne dediee sur production_rapports pour le pre-remplir avec la
  // derniere valeur, contrairement a qt_fabriquer pour Conditionnement) -
  // "meme quantite que la derniere fois" ne peut donc jamais venir d'une
  // reouverture-resaisie-sans-rien-changer, seulement d'une 2e fournee
  // reelle de la meme taille (cas reel observe : KI0298, 2 fournees de 39
  // cartons chacune, la 2e silencieusement ignoree par cette verification).
  if (quantite && quantite > 0) {
    const { error: emballageError } = await supabaseServer.from("production_emballage_entries").insert([
      {
        programme_ligne_id: ligneId,
        code,
        quantite,
        ...(dateEmballage ? { date_jour: dateEmballage } : {}),
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
        utilisateur_emballage: currentUser,
        date_saisie_emballage: new Date().toISOString(),
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
