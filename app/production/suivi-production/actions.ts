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

// La ligne appartient a un vrai Programme (MB) dispatche des que
// source_numero_programme est renseigne - une fiche "nouveau" (bouton "+" du
// Dashboard, cree a la volee sans passer par aucun programme) reste null et
// n'a donc jamais a passer par Salle de pesage/conditionnement, qui n'existe
// que pour ce flux-la.
async function ligneVientDunPogramme(ligneId: number): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("programme_lignes")
    .select("source_numero_programme")
    .eq("id", ligneId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { source_numero_programme: number | null } | null)?.source_numero_programme !== null;
}

async function codeTermineExiste(
  ligneId: number,
  code: string,
  stage: "pesage" | "salle_conditionnement"
): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("production_code_termine")
    .select("id")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .eq("stage", stage)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function fetchDepotBId(): Promise<number | null> {
  const { data } = await supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle();
  return (data as { id: number } | null)?.id ?? null;
}

async function fetchVracArticleId(ligneId: number): Promise<number | null> {
  const { data: ligneData } = await supabaseServer
    .from("programme_lignes")
    .select("article_id")
    .eq("id", ligneId)
    .maybeSingle();
  const articleId = (ligneData as { article_id: number | null } | null)?.article_id ?? null;
  if (!articleId) return null;

  const { data: articleData } = await supabaseServer
    .from("articles")
    .select("vrac_article_id")
    .eq("id", articleId)
    .maybeSingle();
  return (articleData as { vrac_article_id: number | null } | null)?.vrac_article_id ?? null;
}

async function fetchNumeroLotCodeTermine(
  ligneId: number,
  code: string,
  stage: "pesage" | "salle_conditionnement"
): Promise<string | null> {
  const { data } = await supabaseServer
    .from("production_code_termine")
    .select("numero_lot")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .eq("stage", stage)
    .maybeSingle();
  return (data as { numero_lot: string | null } | null)?.numero_lot ?? null;
}

// Vrac fabrique reellement produit : entre en stock reel Depot B des que la
// quantite saisie augmente (seule la DIFFERENCE avec ce qui etait deja
// enregistre avant cette saisie, jamais deux fois la meme part sur une
// correction/re-saisie). numero_lot vient de celui saisi a la validation
// Salle de pesage.
async function crediterVracFabrique(
  ligneId: number,
  code: string,
  ancienVracFabrique: number,
  nouveauVracFabrique: number,
  currentUser: string | null
) {
  if (!code) return;
  if (!(await ligneVientDunPogramme(ligneId))) return;

  const delta = round3(nouveauVracFabrique - ancienVracFabrique);
  if (delta <= 1e-6) return;

  const [depotBId, vracArticleId, numeroLot] = await Promise.all([
    fetchDepotBId(),
    fetchVracArticleId(ligneId),
    fetchNumeroLotCodeTermine(ligneId, code, "pesage"),
  ]);
  if (!depotBId || !vracArticleId) return;

  const { error } = await supabaseServer.from("lots_stock").insert({
    article_id: vracArticleId,
    numero_lot: numeroLot,
    qte_entree: delta,
    qte_sortie: 0,
    depot_id: depotBId,
    date_jour: new Date().toISOString().slice(0, 10),
    utilisateur: currentUser,
    note: "Fabrication vrac",
  });
  if (error) {
    throw new Error(error.message);
  }
}

// Vrac consomme par le Conditionnement, AU PRORATA des cartons reellement
// produits pour ce code (meme principe que consommerReservationMp) - sort
// du stock reel Depot B seulement la part pas encore sortie lors d'une
// saisie precedente. ancienVracConsomme/nouveauVracConsomme (colonne
// production_rapports.vrac_consomme) gardent la trace de ce qui a deja ete
// sorti pour ce code, pour ne jamais sortir deux fois la meme part.
async function consommerVracConditionnement(
  ligneId: number,
  code: string,
  qtFabriquer: number,
  ancienVracConsomme: number,
  currentUser: string | null
): Promise<number> {
  if (!code) return ancienVracConsomme;
  if (!(await ligneVientDunPogramme(ligneId))) return ancienVracConsomme;

  const [cartonPrevu, vracPrevu] = await Promise.all([
    fetchQuantitePrevuePourCode(ligneId, code, "carton"),
    fetchQuantitePrevuePourCode(ligneId, code, "vrac"),
  ]);
  if (cartonPrevu <= 0 || vracPrevu <= 0) return ancienVracConsomme;

  const ratio = Math.min(1, qtFabriquer / cartonPrevu);
  const nouveauVracConsomme = round3(ratio * vracPrevu);
  const delta = round3(nouveauVracConsomme - ancienVracConsomme);
  if (delta <= 1e-6) return ancienVracConsomme;

  const [depotBId, vracArticleId, numeroLot] = await Promise.all([
    fetchDepotBId(),
    fetchVracArticleId(ligneId),
    fetchNumeroLotCodeTermine(ligneId, code, "salle_conditionnement"),
  ]);
  if (!depotBId || !vracArticleId) return ancienVracConsomme;

  // lots_stock.numero_lot est NOT NULL - une Salle de conditionnement
  // validee sans numero de lot saisi (champ optionnel jusqu'ici sur la page
  // Besoin) faisait planter cet insert avec une erreur Postgres illisible.
  if (!numeroLot) {
    throw new Error(
      "Le numero de lot de la Salle de conditionnement est manquant pour ce code - retourne le renseigner (Dashboard > Valider) avant de sauvegarder le Conditionnement."
    );
  }

  const { error } = await supabaseServer.from("lots_stock").insert({
    article_id: vracArticleId,
    numero_lot: numeroLot,
    qte_entree: 0,
    qte_sortie: delta,
    depot_id: depotBId,
    date_jour: new Date().toISOString().slice(0, 10),
    utilisateur: currentUser,
    note: "Consommation conditionnement",
  });
  if (error) {
    throw new Error(error.message);
  }

  return nouveauVracConsomme;
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

// Chaine obligatoire : Salle de pesage valide -> Fabrication possible ->
// Salle de conditionnement valide ET Fabrication reellement produite ->
// Conditionnement possible. Un code sans lien vers un vrai Programme (fiche
// manuelle) passe directement, voir ligneVientDunPogramme. Renvoie un
// message (au lieu de "throw") pour que l'appelant puisse rediriger vers la
// fiche avec une erreur lisible plutot que de planter la page (Next.js
// affiche un ecran d'erreur generique illisible sur une action qui "throw",
// faute d'error.tsx dans ce projet).
export async function messageSiPesageInvalide(ligneId: number, code: string): Promise<string | null> {
  if (!code) return null;
  if (!(await ligneVientDunPogramme(ligneId))) return null;
  if (!(await codeTermineExiste(ligneId, code, "pesage"))) {
    return "Le pesage (Salle de pesage) doit etre valide avant de pouvoir saisir la Fabrication pour ce code.";
  }
  return null;
}

// Le Test labo n'est pas reserve aux lignes issues d'un Programme (contrairement
// a Pesage/Salle de conditionnement) - un controle qualite doit se faire sur
// TOUT batch physiquement fabrique, y compris une fiche manuelle ("+" du
// Dashboard), donc aucune exemption via ligneVientDunPogramme ici.
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

export async function messageSiConditionnementInvalide(ligneId: number, code: string): Promise<string | null> {
  if (!code) return null;
  if (!(await ligneVientDunPogramme(ligneId))) return null;
  if (!(await fabricationDejaProduite(ligneId, code))) {
    return "La Fabrication doit etre faite (vrac produit) avant de pouvoir saisir le Conditionnement pour ce code.";
  }
  if (!(await codeTermineExiste(ligneId, code, "salle_conditionnement"))) {
    return "La Salle de conditionnement doit etre validee avant de pouvoir saisir le Conditionnement pour ce code.";
  }
  return null;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

// Quantite PREVUE pour ce code precis (pas toute la ligne) - meme repli que
// le Dashboard (voir vracPrevuByCode/cartonPrevuByCode, app/production/
// suivi/dashboard/page.tsx) : le detail par code s'il existe (ligne
// decoupee en plusieurs lots), sinon la quantite de la ligne entiere pour
// un seul code.
async function fetchQuantitePrevuePourCode(
  ligneId: number,
  code: string,
  kind: "vrac" | "carton"
): Promise<number> {
  const { data } = await supabaseServer
    .from("programme_lignes")
    .select("numero_lot, numero_lot_detail, vrac_a_fabriquer, qt_carton")
    .eq("id", ligneId)
    .maybeSingle();
  if (!data) return 0;

  const ligne = data as {
    numero_lot: string | null;
    numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
    vrac_a_fabriquer: number | null;
    qt_carton: number | null;
  };

  const codes = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
  const hasDetail = codes.length > 1 && ligne.numero_lot_detail && ligne.numero_lot_detail.length === codes.length;

  if (hasDetail) {
    const entry = ligne.numero_lot_detail!.find((e) => e.code === code);
    return Number((kind === "vrac" ? entry?.qt_vrac : entry?.qt_carton) ?? 0);
  }

  return Number((kind === "vrac" ? ligne.vrac_a_fabriquer : ligne.qt_carton) ?? 0);
}

// Transforme la reservation MP faite a la validation (Salle de pesage ou
// Salle de conditionnement, voir validerBatchAction) en vraie sortie de
// stock Depot B AU PRORATA de ce qui est reellement produit pour ce code -
// tant que ca reste juste "reserve", le stock n'a pas vraiment bouge
// (visible dans le "Reserve" de la page Produit, jamais dans le stock
// reel). production_mp_reserve.quantite est le reste ENCORE reserve
// (diminue a chaque saisie), quantite_initiale le besoin total fige a la
// validation - le ratio produit/prevu de CETTE saisie determine combien
// devrait etre consomme au total, la difference avec ce qui l'est deja
// donne exactement la part a sortir maintenant (jamais deux fois la meme
// part, correctement recalcule si la quantite saisie est corrigee/montee).
async function consommerReservationMp(
  ligneId: number,
  code: string,
  stage: "pesage" | "salle_conditionnement",
  quantiteProduite: number,
  currentUser: string | null
) {
  if (!code) return;

  const { data: codeTermineData } = await supabaseServer
    .from("production_code_termine")
    .select("id, numero_lot")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .eq("stage", stage)
    .maybeSingle();
  const codeTermine = codeTermineData as { id: number; numero_lot: string | null } | null;
  if (!codeTermine) return;

  const quantitePrevue = await fetchQuantitePrevuePourCode(
    ligneId,
    code,
    stage === "pesage" ? "vrac" : "carton"
  );
  if (quantitePrevue <= 0) return;
  const ratio = Math.min(1, quantiteProduite / quantitePrevue);

  const { data: reserveData } = await supabaseServer
    .from("production_mp_reserve")
    .select("id, article_mp_id, depot_id, quantite, quantite_initiale")
    .eq("production_code_termine_id", codeTermine.id);
  const reserves = (reserveData ?? []) as {
    id: number;
    article_mp_id: number;
    depot_id: number;
    quantite: number;
    quantite_initiale: number;
  }[];
  if (reserves.length === 0) return;

  const dateJour = new Date().toISOString().slice(0, 10);

  for (const reserve of reserves) {
    const cibleConsommee = round3(ratio * reserve.quantite_initiale);
    const dejaConsommee = round3(reserve.quantite_initiale - reserve.quantite);
    const delta = round3(cibleConsommee - dejaConsommee);
    if (delta <= 1e-6) continue;

    const { error: insertError } = await supabaseServer.from("lots_stock_matiere_premiere").insert({
      article_id: reserve.article_mp_id,
      numero_lot: codeTermine.numero_lot,
      qte_entree: 0,
      qte_sortie: delta,
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
      .update({ quantite: Math.max(0, round3(reserve.quantite_initiale - cibleConsommee)) })
      .eq("id", reserve.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }
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

  const erreurConditionnement = await messageSiConditionnementInvalide(ligneId, code);
  if (erreurConditionnement) {
    redirect(
      `/production/suivi-production/conditionnement/${ligneId}?code=${encodeURIComponent(code)}&erreur=${encodeURIComponent(erreurConditionnement)}`
    );
  }

  const qtFabriquer = parseOptionalNumber(formData, "qt_fabriquer");
  const dateFabricationConditionnement = parseOptionalText(formData, "date_fabrication_conditionnement");

  const { data: existingRapportData } = await supabaseServer
    .from("production_rapports")
    .select("vrac_consomme")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .maybeSingle();
  const ancienVracConsomme = Number((existingRapportData as { vrac_consomme: number | null } | null)?.vrac_consomme ?? 0);

  let nouveauVracConsomme = ancienVracConsomme;
  let erreurVracConsomme: string | null = null;
  if (qtFabriquer && qtFabriquer > 0) {
    try {
      nouveauVracConsomme = await consommerVracConditionnement(ligneId, code, qtFabriquer, ancienVracConsomme, currentUser);
    } catch (error) {
      erreurVracConsomme = error instanceof Error ? error.message : "Erreur lors de la consommation du vrac.";
    }
  }

  if (erreurVracConsomme) {
    redirect(
      `/production/suivi-production/conditionnement/${ligneId}?code=${encodeURIComponent(code)}&erreur=${encodeURIComponent(erreurVracConsomme)}`
    );
  }

  await upsertRapport(ligneId, code, {
    chef_zone: parseOptionalText(formData, "chef_zone"),
    chef_ligne: parseOptionalText(formData, "chef_ligne"),
    ravitailleur: parseOptionalText(formData, "ravitailleur"),
    tireur: parseOptionalText(formData, "tireur"),
    nb_journaliers_conditionnement: parseOptionalNumber(formData, "nb_journaliers_conditionnement"),
    qt_fabriquer: qtFabriquer,
    vrac_consomme: nouveauVracConsomme,
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
    await consommerReservationMp(ligneId, code, "salle_conditionnement", qtFabriquer, currentUser);

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

  const erreurPesage = await messageSiPesageInvalide(ligneId, code);
  if (erreurPesage) {
    redirect(
      `/production/suivi-production/fabrication/${ligneId}?code=${encodeURIComponent(code)}&erreur=${encodeURIComponent(erreurPesage)}`
    );
  }

  const erreurTestLabo = await messageSiTestLaboInvalide(ligneId, code);
  if (erreurTestLabo) {
    redirect(
      `/production/suivi-production/fabrication/${ligneId}?code=${encodeURIComponent(code)}&erreur=${encodeURIComponent(erreurTestLabo)}`
    );
  }

  const vracFabrique = parseOptionalNumber(formData, "vrac_fabrique");
  const dateFabricationConditionnement = parseOptionalText(formData, "date_fabrication_conditionnement");

  const { data: existingFabricationRapport } = await supabaseServer
    .from("production_rapports")
    .select("vrac_fabrique")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .maybeSingle();
  const ancienVracFabrique = Number((existingFabricationRapport as { vrac_fabrique: number | null } | null)?.vrac_fabrique ?? 0);

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
    await consommerReservationMp(ligneId, code, "pesage", vracFabrique, currentUser);
    await crediterVracFabrique(ligneId, code, ancienVracFabrique, vracFabrique, currentUser);

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

export async function saveTestLaboAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionFabrication"))) {
    throw new Error("Cet utilisateur ne peut pas enregistrer de test labo.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  await upsertRapport(ligneId, code, {
    ph: parseOptionalNumber(formData, "ph"),
    densite: parseOptionalNumber(formData, "densite"),
    viscosite: parseOptionalNumber(formData, "viscosite"),
    degre_alcool: parseOptionalNumber(formData, "degre_alcool"),
    stabilite: parseOptionalText(formData, "stabilite"),
    couleur: parseOptionalText(formData, "couleur"),
    temperature_test: parseOptionalNumber(formData, "temperature_test"),
    odeur: parseOptionalText(formData, "odeur"),
    remarque: parseOptionalText(formData, "remarque"),
    utilisateur_test_labo: currentUser,
    date_saisie_test_labo: new Date().toISOString(),
  });

  revalidateRapportPages();
  revalidatePath(`/production/suivi-production/fabrication/${ligneId}/test-labo`);
  redirect(`/production/suivi-production/fabrication/${ligneId}/test-labo?code=${encodeURIComponent(code)}&enregistre=1`);
}

// Ajout ponctuel de matiere premiere pour corriger un parametre non
// conforme constate au Test labo (ex: ajuster le pH) - action separee du
// Save du test (pas un champ a re-upserter a l'identique a chaque
// correction de couleur/remarque) : chaque clic est une VRAIE sortie de
// stock physique, jamais reversible/idempotente comme le reste du rapport.
export async function ajouterAjustementMpTestLaboAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviProductionFabrication"))) {
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
