"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchCoutReelDepuisReservation, fetchCoutsParCartonProduitsFinis, type LotUtiliseInfo } from "@/lib/prix-revient";
import {
  COMPTE_EN_COURS_PRODUCTION,
  COMPTE_STOCK_MP,
  COMPTE_STOCK_PRODUIT_FINI,
  creerEcriture,
  enregistrerLotsUtilisesPourEcriture,
  supprimerEcriturePourSource,
} from "@/lib/comptabilite";

// Ecriture separee pour la consommation REELLE des articles de
// conditionnement (sleeve/capsule/carton/flacon...) d'un code precis - bug
// reel corrige : consommerCartonProportionnel
// (app/production/suivi-production/actions.ts) deduit deja ce stock
// physiquement (vraies sorties MP) a chaque fournee, mais aucune ecriture ne
// l'enregistrait jamais en comptabilite. Sans elle, l'ecriture
// "entree_production" credite l'En-cours du cout complet (vrac +
// conditionnement), alors que seul le vrac avait ete debite par
// "fabrication_vrac" - l'En-cours partait durablement negatif (cas reel :
// -787 600 FCFA sur AA4263V). Rejouable (efface + recree), meme convention
// de source_id que fabrication_vrac (ligneId-code) pour rester coherente et
// permettre le recalcul en cascade (voir lib/ecriture-recompute.ts).
export async function recalculerEcritureConditionnementMp(
  ligneId: number,
  code: string,
  currentUser: string | null
): Promise<void> {
  const sourceId = `${ligneId}-${code}`;
  await supprimerEcriturePourSource("conditionnement_mp", sourceId);

  const { data: termineData } = await supabaseServer
    .from("production_code_termine")
    .select("id")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .eq("stage", "salle_conditionnement")
    .maybeSingle();
  const termine = termineData as { id: number } | null;
  if (!termine) return;

  const coutConditionnement = await fetchCoutReelDepuisReservation(termine.id);
  if (!coutConditionnement || coutConditionnement.coutFcfa <= 0) return;

  const ecritureId = await creerEcriture({
    dateEcriture: new Date().toISOString().slice(0, 10),
    pieceReference: code,
    libelle: `Conditionnement - ${code}`,
    sourceType: "conditionnement_mp",
    sourceId,
    createdBy: currentUser,
    lignes: [
      { compteCode: COMPTE_EN_COURS_PRODUCTION, debit: coutConditionnement.coutFcfa, credit: 0 },
      { compteCode: COMPTE_STOCK_MP, debit: 0, credit: coutConditionnement.coutFcfa },
    ],
  });
  await enregistrerLotsUtilisesPourEcriture(ecritureId, coutConditionnement.lotsUtilises);
}

// Recalcule (efface + recree si un cout est trouve) l'ecriture comptable
// "entree_production" d'un (groupeId, article) precis, a partir de ce qui
// est REELLEMENT dans lots_stock pour ce groupe - jamais depuis des
// valeurs de formulaire, pour pouvoir etre rappelee hors de l'action de
// transfert (voir lib/ecriture-recompute.ts, quand le prix d'un lot MP
// deja utilise ici est corrige apres coup).
export async function recalculerEcritureEntreeProduction(
  groupeId: number,
  articleId: number,
  currentUser: string | null,
  options?: { requireTrace?: boolean }
): Promise<void> {
  const sourceId = `${groupeId}-${articleId}`;
  await supprimerEcriturePourSource("entree_production", sourceId);

  const { data: lotsData } = await supabaseServer
    .from("lots_stock")
    .select("qte_entree, numero_lot")
    .eq("mouvement_groupe_id", groupeId)
    .eq("article_id", articleId);
  const lots = (lotsData as { qte_entree: number; numero_lot: string | null }[] | null) ?? [];
  if (lots.length === 0) return;

  const quantite = lots.reduce((sum, l) => sum + Number(l.qte_entree ?? 0), 0);
  if (quantite <= 0) return;
  const lotsLabels = [...new Set(lots.map((l) => l.numero_lot).filter(Boolean))].join(", ");

  const { data: articleData } = await supabaseServer
    .from("articles")
    .select("nom_article")
    .eq("id", articleId)
    .maybeSingle();
  const nomArticle = (articleData as { nom_article: string } | null)?.nom_article ?? `#${articleId}`;

  // Prefere le cout REEL des lots effectivement reserves/consommes pour ce
  // code (emballage en salle de conditionnement + vrac fabrique en salle de
  // pesage) - meme principe que recalculerEcritureFabricationVrac : trace
  // exacte via production_mp_reserve, jamais une estimation FEFO recalculee
  // sur le stock actuel, des que cette trace existe pour TOUS les codes de
  // ce groupe. Le "code" ici est celui tape a l'ecran Entree Production
  // (lots_stock.numero_lot), le meme code de dispatch que
  // production_code_termine dans le cas normal (non renomme depuis).
  const codesUtilises = [...new Set(lots.map((l) => l.numero_lot).filter(Boolean))] as string[];
  let coutReelTotal = 0;
  let lotsReelUtilises: LotUtiliseInfo[] = [];
  let coutReelDisponible = codesUtilises.length > 0;

  for (const code of codesUtilises) {
    const { data: termineData } = await supabaseServer
      .from("production_code_termine")
      .select("id, programme_ligne_id")
      .eq("code", code)
      .eq("stage", "salle_conditionnement")
      .maybeSingle();
    const termine = termineData as { id: number; programme_ligne_id: number } | null;
    if (!termine) {
      coutReelDisponible = false;
      break;
    }

    const [coutConditionnement, pesageTermineData] = await Promise.all([
      fetchCoutReelDepuisReservation(termine.id),
      supabaseServer
        .from("production_code_termine")
        .select("id")
        .eq("programme_ligne_id", termine.programme_ligne_id)
        .eq("code", code)
        .eq("stage", "pesage")
        .maybeSingle(),
    ]);
    const pesage = (pesageTermineData.data as { id: number } | null) ?? null;
    const coutVrac = pesage ? await fetchCoutReelDepuisReservation(pesage.id) : null;

    if (!coutConditionnement && !coutVrac) {
      coutReelDisponible = false;
      break;
    }

    coutReelTotal += (coutConditionnement?.coutFcfa ?? 0) + (coutVrac?.coutFcfa ?? 0);
    lotsReelUtilises = lotsReelUtilises.concat(coutConditionnement?.lotsUtilises ?? [], coutVrac?.lotsUtilises ?? []);

    // Ecriture separee (voir recalculerEcritureConditionnementMp plus haut)
    // pour la consommation REELLE des articles de conditionnement - sans
    // elle, l'ecriture "entree_production" ci-dessous credite l'En-cours du
    // cout complet (vrac + conditionnement), alors que seul le vrac avait
    // ete debite par "fabrication_vrac".
    await recalculerEcritureConditionnementMp(termine.programme_ligne_id, code, currentUser);
  }

  let montant: number;
  let lotsAEnregistrer: LotUtiliseInfo[];
  if (coutReelDisponible && lotsReelUtilises.length > 0) {
    montant = coutReelTotal;
    lotsAEnregistrer = lotsReelUtilises;
  } else {
    // Aucune reservation tracee pour un des codes (systeme trop ancien) : le
    // mode strict (rattrapage historique) refuse d'inventer un cout
    // approximatif plutot que d'estimer via FEFO sur le stock actuel.
    if (options?.requireTrace) return;
    const couts = await fetchCoutsParCartonProduitsFinis([articleId], new Map([[articleId, quantite]]));
    const coutInfo = couts.get(articleId);
    if (!coutInfo || coutInfo.coutParCarton === null) return;
    montant = coutInfo.coutParCarton * quantite;
    lotsAEnregistrer = coutInfo.lotsUtilises;
  }
  if (montant <= 0) return;

  const ecritureId = await creerEcriture({
    dateEcriture: new Date().toISOString().slice(0, 10),
    pieceReference: String(groupeId),
    libelle: `Entree production - ${nomArticle}${lotsLabels ? ` - ${lotsLabels}` : ""}`,
    sourceType: "entree_production",
    sourceId,
    createdBy: currentUser,
    lignes: [
      { compteCode: COMPTE_STOCK_PRODUIT_FINI, debit: montant, credit: 0 },
      { compteCode: COMPTE_EN_COURS_PRODUCTION, debit: 0, credit: montant },
    ],
  });
  await enregistrerLotsUtilisesPourEcriture(ecritureId, lotsAEnregistrer);
}

// Cree une entree stock produit fini a partir d'un groupe d'entrees
// emballage (Suivi Production) qui partagent toutes la meme date - meme
// mecanisme que l'entree manuelle (lots_stock + mouvement_groupe_id), mais
// avec sa propre etiquette "Entree Production N" (source_import distinct)
// pour rester reperable a part des entrees tapees a la main (TE).
export async function createEntreeProductionBatchAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsEntreeProduction"))) {
    throw new Error("Cet utilisateur ne peut pas saisir des mouvements.");
  }

  const entryIdsRaw = String(formData.get("entry_ids") || "").trim();

  if (!entryIdsRaw) {
    throw new Error("Aucune ligne a transferer.");
  }

  const entryIds = entryIdsRaw
    .split(",")
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (entryIds.length === 0) {
    throw new Error("Aucune ligne a transferer.");
  }

  const { data: entries, error: entriesError } = await supabaseServer
    .from("production_emballage_entries")
    .select("id, programme_ligne_id, quantite, date_jour, transfere_stock")
    .in("id", entryIds);

  if (entriesError) {
    throw new Error(entriesError.message);
  }

  const entryRows = (entries as
    | { id: number; programme_ligne_id: number; quantite: number; date_jour: string; transfere_stock: boolean }[]
    | null) ?? [];

  const pendingRows = entryRows.filter((row) => !row.transfere_stock);

  if (pendingRows.length === 0) {
    throw new Error("Ces lignes ont deja ete transferees en stock.");
  }

  const ligneIds = [...new Set(pendingRows.map((row) => row.programme_ligne_id))];

  const { data: lignes, error: lignesError } = await supabaseServer
    .from("programme_lignes")
    .select("id, article_id, numero_lot")
    .in("id", ligneIds);

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  const ligneById = new Map(
    ((lignes as { id: number; article_id: number | null; numero_lot: string | null }[] | null) ?? []).map(
      (ligne) => [ligne.id, ligne]
    )
  );

  const pendingById = new Map(pendingRows.map((row) => [row.id, row]));

  // Plusieurs entrees emballage (article + code identiques) peuvent avoir
  // ete fusionnees en une seule ligne a l'ecran (voir page.tsx) - "merge_group"
  // (un champ par ligne fusionnee, meme nom repete) porte
  // "<id representant>:<id1,id2,...>" pour retrouver quelles entrees
  // partagent le meme jeu de champs code_X/qty_X/... et doivent finir dans
  // le MEME lots_stock (une seule quantite totale), pas une par entree.
  const mergeGroupsRaw = formData.getAll("merge_group").map((value) => String(value));
  const seenEntryIds = new Set<number>();
  const mergedGroups: { representativeId: number; memberIds: number[] }[] = [];

  for (const raw of mergeGroupsRaw) {
    const [repPart, membersPart] = raw.split(":");
    const representativeId = Number(repPart);
    const memberIds = (membersPart || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0 && pendingById.has(id));

    if (!representativeId || memberIds.length === 0) continue;

    mergedGroups.push({ representativeId, memberIds });
    memberIds.forEach((id) => seenEntryIds.add(id));
  }

  // Toute entree en attente non couverte par "merge_group" (ancien lien
  // genere avant ce champ, ou incoherence) reste traitee seule - jamais
  // perdue silencieusement.
  for (const row of pendingRows) {
    if (!seenEntryIds.has(row.id)) {
      mergedGroups.push({ representativeId: row.id, memberIds: [row.id] });
    }
  }

  const payload = mergedGroups.map(({ representativeId, memberIds }) => {
    const members = memberIds.map((id) => pendingById.get(id)!).filter(Boolean);
    const first = members[0];
    const ligne = ligneById.get(first.programme_ligne_id);
    const articleId = ligne?.article_id;
    // Le code precis de ce groupe fusionne (modifiable a l'ecran juste avant
    // de valider) - jamais le numero_lot combine de la ligne source, qui
    // regrouperait a tort les autres codes d'une ligne decoupee en
    // plusieurs lots sur ce meme mouvement de stock.
    const numeroLot = String(formData.get(`code_${representativeId}`) || "").trim();

    if (!articleId || !numeroLot) {
      throw new Error("Une ligne de production n'a pas d'article ou de code associe.");
    }

    const totalQuantiteEntrees = members.reduce((sum, member) => sum + Number(member.quantite), 0);
    const quantite = Number(
      String(formData.get(`qty_${representativeId}`) || totalQuantiteEntrees).replace(",", ".")
    );
    const dateFabrication = String(formData.get(`datefab_${representativeId}`) || first.date_jour).trim();
    const datePeremption = String(formData.get(`dateperemption_${representativeId}`) || "").trim();
    const chambre = String(formData.get(`chambre_${representativeId}`) || "").trim();
    const codePays = String(formData.get(`codepays_${representativeId}`) || "").trim();

    if (!quantite || quantite <= 0 || !dateFabrication) {
      throw new Error("Quantite ou date de fabrication invalide sur une ligne.");
    }

    return {
      article_id: articleId,
      date_jour: new Date().toISOString().slice(0, 10),
      numero_lot: numeroLot,
      code_normalise: numeroLot.toUpperCase(),
      date_fabrication: dateFabrication,
      date_peremption: datePeremption || null,
      qte_entree: quantite,
      qte_sortie: 0,
      chambre: chambre || null,
      code_pays: codePays || null,
      source_import: "web:entree-production",
      note: null,
      utilisateur: currentUser,
    };
  });

  // Lignes ajoutees a la main sur ce groupe (article jamais passe par
  // l'Emballage/Suivi Production - arrivage exceptionnel, correction...) -
  // meme mouvement de stock que les lignes automatiques ci-dessus, portees
  // en JSON par ExtraLignesField dans le meme <form>.
  const extraLignesRaw = String(formData.get("extra_lignes") || "").trim();
  type ExtraLigne = {
    articleId: number;
    code: string;
    quantite: number;
    dateFabrication: string;
    datePeremption: string;
    chambre: string;
    codePays: string;
  };
  let extraLignes: ExtraLigne[] = [];
  if (extraLignesRaw) {
    try {
      extraLignes = JSON.parse(extraLignesRaw) as ExtraLigne[];
    } catch {
      throw new Error("Le contenu des lignes ajoutees a la main est invalide.");
    }
  }

  const extraPayload = extraLignes.map((ligne) => {
    const articleId = Number(ligne.articleId);
    const numeroLot = String(ligne.code || "").trim();
    const quantite = Number(ligne.quantite);
    const dateFabrication = String(ligne.dateFabrication || "").trim();

    if (!articleId || !numeroLot || !quantite || quantite <= 0 || !dateFabrication) {
      throw new Error("Une ligne ajoutee a la main est incomplete.");
    }

    return {
      article_id: articleId,
      date_jour: new Date().toISOString().slice(0, 10),
      numero_lot: numeroLot,
      code_normalise: numeroLot.toUpperCase(),
      date_fabrication: dateFabrication,
      date_peremption: String(ligne.datePeremption || "").trim() || null,
      qte_entree: quantite,
      qte_sortie: 0,
      chambre: String(ligne.chambre || "").trim() || null,
      code_pays: String(ligne.codePays || "").trim() || null,
      source_import: "web:entree-production",
      note: null,
      utilisateur: currentUser,
    };
  });

  const { data: inserted, error: insertError } = await supabaseServer
    .from("lots_stock")
    .insert([...payload, ...extraPayload])
    .select("id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  const insertedIds = ((inserted as { id: number }[] | null) ?? []).map((row) => row.id);
  const groupeId = Math.min(...insertedIds);

  const { error: groupError } = await supabaseServer
    .from("lots_stock")
    .update({ mouvement_groupe_id: groupeId })
    .in("id", insertedIds);

  if (groupError) {
    throw new Error(groupError.message);
  }

  const { error: markError } = await supabaseServer
    .from("production_emballage_entries")
    .update({ transfere_stock: true })
    .in(
      "id",
      pendingRows.map((row) => row.id)
    );

  if (markError) {
    throw new Error(markError.message);
  }

  // Ecriture comptable automatique (Produit fini/En-cours de production),
  // une par article de ce lot. Try/catch qui n'interrompt pas la validation
  // du mouvement de stock si la comptabilite echoue.
  try {
    const toutesLignes = [...payload, ...extraPayload];
    const articleIds = [...new Set(toutesLignes.map((l) => l.article_id))];
    for (const articleId of articleIds) {
      await recalculerEcritureEntreeProduction(groupeId, articleId, currentUser);
    }
  } catch (comptaError) {
    console.error("Ecriture comptable entree production echouee:", comptaError);
  }

  revalidatePath("/mouvements/produit-fini/entree-production");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
}

// Retire une ligne de cette liste d'attente sans la transferer en stock -
// supprime carrement la ou les entrees Emballage correspondantes (fausses/en
// trop), ce qui annule au passage la quantite correspondante du "deja
// emballe" (Suivi Production/Dashboard), exactement comme si elles n'avaient
// jamais ete saisies. Plusieurs ids quand la ligne affichee est une fusion de
// plusieurs entrees emballage (meme article + code) - voir page.tsx.
export async function deletePendingEmballageEntriesAction(entryIds: number[], _formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "mouvementsEntreeProduction"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette ligne.");
  }

  const validIds = (entryIds || []).filter((id) => Number.isFinite(id) && id > 0);

  if (validIds.length === 0) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer
    .from("production_emballage_entries")
    .delete()
    .in("id", validIds)
    .eq("transfere_stock", false);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/mouvements/produit-fini/entree-production");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi-production");
}
