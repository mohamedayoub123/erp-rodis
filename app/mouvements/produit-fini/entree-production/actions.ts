"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchCoutsParCartonProduitsFinis } from "@/lib/prix-revient";
import { COMPTE_EN_COURS_PRODUCTION, COMPTE_STOCK_PRODUIT_FINI, creerEcriture } from "@/lib/comptabilite";

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
  // une par article de ce lot - jamais generee si le cout de revient n'est
  // pas connu (jamais un montant devine). Try/catch qui n'interrompt pas la
  // validation du mouvement de stock si la comptabilite echoue.
  try {
    const toutesLignes = [...payload, ...extraPayload];
    const quantiteParArticle = new Map<number, number>();
    const lotsParArticle = new Map<number, Set<string>>();
    for (const ligne of toutesLignes) {
      quantiteParArticle.set(ligne.article_id, (quantiteParArticle.get(ligne.article_id) ?? 0) + ligne.qte_entree);
      const lots = lotsParArticle.get(ligne.article_id) ?? new Set<string>();
      if (ligne.numero_lot) lots.add(ligne.numero_lot);
      lotsParArticle.set(ligne.article_id, lots);
    }

    const articleIds = [...quantiteParArticle.keys()];
    const [couts, { data: articlesData }] = await Promise.all([
      fetchCoutsParCartonProduitsFinis(articleIds, quantiteParArticle),
      supabaseServer.from("articles").select("id, nom_article").in("id", articleIds),
    ]);
    const nomArticleById = new Map(
      ((articlesData ?? []) as { id: number; nom_article: string }[]).map((a) => [a.id, a.nom_article])
    );
    const dateEcriture = new Date().toISOString().slice(0, 10);

    for (const [articleId, quantite] of quantiteParArticle) {
      const coutInfo = couts.get(articleId);
      // lignesSansPrix.length === 0 obligatoire (pas seulement coutParCarton
      // non-nul) : un article ENTIEREMENT sans prix connu a Depot B donne
      // coutTotal=0 donc coutParCarton=0/qte=0, qui passerait a tort le
      // garde-fou coutParCarton!==null et creerait une ecriture 0/0.
      if (!coutInfo || coutInfo.coutParCarton === null || coutInfo.lignesSansPrix.length > 0) continue;

      const montant = coutInfo.coutParCarton * quantite;
      const nomArticle = nomArticleById.get(articleId) ?? `#${articleId}`;
      const lots = [...(lotsParArticle.get(articleId) ?? [])].join(", ");
      await creerEcriture({
        dateEcriture,
        pieceReference: String(groupeId),
        libelle: `Entree production - ${nomArticle}${lots ? ` - ${lots}` : ""}`,
        sourceType: "entree_production",
        sourceId: `${groupeId}-${articleId}`,
        createdBy: currentUser,
        lignes: [
          { compteCode: COMPTE_STOCK_PRODUIT_FINI, debit: montant, credit: 0 },
          { compteCode: COMPTE_EN_COURS_PRODUCTION, debit: 0, credit: montant },
        ],
      });
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
