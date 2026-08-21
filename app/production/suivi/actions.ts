"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";
import { fetchLotsInDepot } from "@/app/depots/transfer-order/stock-lots";

function revalidateSuiviPages() {
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
  revalidatePath("/production/suivi/en-cours");
  revalidatePath("/production/suivi-production");
  revalidatePath("/production/rapport/ecarts");
}

// Supprime TOUT le programme (la ligne entiere - tous ses codes, toutes
// les etapes deja saisies) directement depuis le Dashboard, pour corriger
// une erreur de saisie sans devoir aller chercher la ligne ailleurs (ex:
// Programme par ligne) - demande explicite. Meme suppression que
// deleteProgrammeLigneRapportAction (Rapport Ecarts), gardee separee pour
// sa propre permission (productionSuiviDashboard) plutot que d'emprunter
// celle d'un autre rapport.
export async function deleteProgrammeLigneDashboardAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "productionSuiviDashboard"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer ce programme.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));

  if (!ligneId) {
    throw new Error("Ligne invalide.");
  }

  const { error } = await supabaseServer.from("programme_lignes").delete().eq("id", ligneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

type CodeTermineStage = "vrac" | "carton" | "emballage" | "pesage" | "salle_conditionnement";

// Insere le code precis dans production_code_termine plutot que de mettre a
// jour un flag ligne entiere - une ligne decoupee en plusieurs codes (voir
// numero_lot_detail) doit pouvoir terminer UN SEUL de ses codes sans cacher
// les autres du Dashboard (bug corrige : Terminer un code y cachait avant
// tous les codes freres, puisque le flag etait au niveau de la ligne).
// Retourne l'id de la ligne production_code_termine (utilise par
// validerBatchAction pour y rattacher les reservations MP).
async function markCodeTermine(formData: FormData, stage: CodeTermineStage): Promise<number> {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();
  const numeroLot = String(formData.get("numero_lot") || "").trim() || null;

  if (!ligneId || !code) {
    throw new Error("Ligne ou code invalide.");
  }

  const { data, error } = await supabaseServer
    .from("production_code_termine")
    .upsert(
      [{ programme_ligne_id: ligneId, code, stage, numero_lot: numeroLot, utilisateur: currentUser }],
      { onConflict: "programme_ligne_id,code,stage" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
  return (data as { id: number }).id;
}

// "Fin programme" declare qu'aucune autre production ne viendra pour ce
// code sur cette etape - la part de reservation MP encore marquee
// "reservee" a ce moment-la (ex: production arretee a 2950 sur 3000
// prevus, ou tout simplement rien n'a decremente la reservation au fil
// des saisies) doit etre reellement deduite du stock (consommerRemainingMpReserve),
// que ce soit la Salle de pesage (matiere premiere Fabrication) OU la
// Salle de conditionnement (carton/sleeve...) : dans les 2 cas, une fois
// prelevee de l'entrepot elle ne revient jamais au stock, meme si la
// quantite finalement produite differe de ce qui etait prevu - bug reel
// corrige : la Salle de conditionnement faisait juste disparaitre la
// reservation SANS creer de sortie de stock reelle, laissant le stock MP
// inchange malgre une vraie production (cas confirme AA4263V, 313 cartons
// produits, stock MP jamais sorti).
async function fetchReservesRestantes(ligneId: number, code: string, stage: "pesage" | "salle_conditionnement") {
  const { data: codeTermineData } = await supabaseServer
    .from("production_code_termine")
    .select("id, numero_lot")
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .eq("stage", stage)
    .maybeSingle();
  const codeTermine = codeTermineData as { id: number; numero_lot: string | null } | null;
  if (!codeTermine) return null;

  const { data: reserveData } = await supabaseServer
    .from("production_mp_reserve")
    .select("id, article_mp_id, depot_id, quantite, numero_lot")
    .eq("production_code_termine_id", codeTermine.id)
    .gt("quantite", 0);
  const reserves = (reserveData ?? []) as {
    id: number;
    article_mp_id: number;
    depot_id: number;
    quantite: number;
    numero_lot: string | null;
  }[];

  return { codeTermine, reserves };
}

async function consommerRemainingMpReserve(
  ligneId: number,
  code: string,
  currentUser: string | null,
  stage: "pesage" | "salle_conditionnement"
) {
  const found = await fetchReservesRestantes(ligneId, code, stage);
  if (!found || found.reserves.length === 0) return;

  const dateJour = new Date().toISOString().slice(0, 10);

  for (const reserve of found.reserves) {
    const { error: insertError } = await supabaseServer.from("lots_stock_matiere_premiere").insert({
      article_id: reserve.article_mp_id,
      numero_lot: reserve.numero_lot || found.codeTermine.numero_lot,
      qte_entree: 0,
      qte_sortie: reserve.quantite,
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
      .update({ quantite: 0 })
      .eq("id", reserve.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}

export async function markVracTermineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  await markCodeTermine(formData, "vrac");

  if (ligneId && code) {
    await consommerRemainingMpReserve(ligneId, code, currentUser, "pesage");
  }
}

// Fin programme independante par colonne du Dashboard : fermer Fabrication
// ne ferme plus Conditionnement/Emballage (et inversement) - chaque etape a
// son propre flag "termine".
export async function markCartonTermineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  await markCodeTermine(formData, "carton");

  if (ligneId && code) {
    await consommerRemainingMpReserve(ligneId, code, currentUser, "salle_conditionnement");
  }
}

// Annule un "Fin programme" Conditionnement clique par erreur - supprime
// juste la ligne production_code_termine (stage "carton") pour ce code, ce
// qui le fait immediatement reapparaitre dans la colonne Conditionnement du
// Dashboard (isCodeTerminated ne le trouve plus). Ne touche pas aux
// reservations MP (consommerRemainingMpReserve porte sur le stage separe
// "salle_conditionnement", jamais "carton", et a deja cree la sortie de
// stock reelle - annuler "carton" ne l'annule pas).
export async function unmarkCartonTermineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  if (!ligneId || !code) {
    throw new Error("Ligne ou code invalide.");
  }

  const { error } = await supabaseServer
    .from("production_code_termine")
    .delete()
    .eq("programme_ligne_id", ligneId)
    .eq("code", code)
    .eq("stage", "carton");

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

// Lots reellement disponibles pour une MP dans un depot, pour la Salle de
// pesage/conditionnement - solde net des Transfer Orders en cours (deja
// fait par fetchLotsInDepot) ET des reservations Salle de pesage/
// conditionnement (production_mp_reserve) deja posees sur CE MEME lot
// precis. Partagee entre fetchBesoinArticleInfoAction (affichage) et
// validerBatchAction (re-verification serveur) pour que les 2 restent
// TOUJOURS coherents - avant, le disponible etait calcule sur le TOTAL de
// l'article (tous lots confondus, fetchTotalStockInDepot) alors que la
// validation ne consomme qu'UN SEUL lot choisi dans le select : un besoin
// de 200kg pouvait etre valide en choisissant un lot qui n'en a que 100,
// simplement parce qu'un AUTRE lot du meme article avait les 100 restants
// (bug confirme, cas reel LANETTE SX 100kg + 100kg pour un besoin de 200kg).
export type LotDisponible = { numeroLot: string; solde: number };

async function fetchLotsDisponiblesPourBesoin(articleMpId: number, depotId: number): Promise<LotDisponible[]> {
  const [lots, { data: reserveData }] = await Promise.all([
    fetchLotsInDepot("MP", articleMpId, depotId),
    supabaseServer
      .from("production_mp_reserve")
      .select("quantite, numero_lot")
      .eq("depot_id", depotId)
      .eq("article_mp_id", articleMpId),
  ]);

  const reserveParLot = new Map<string, number>();
  for (const r of (reserveData ?? []) as { quantite: number; numero_lot: string | null }[]) {
    const key = r.numero_lot || "";
    reserveParLot.set(key, (reserveParLot.get(key) ?? 0) + Number(r.quantite ?? 0));
  }

  return lots
    .map((l) => ({ numeroLot: l.numeroLot, solde: l.solde - (reserveParLot.get(l.numeroLot) ?? 0) }))
    .filter((l) => l.solde > 1e-6);
}

// Utilise par la page "Besoin" quand l'utilisateur choisit/change un
// article MP sur une ligne (ligne auto-calculee depuis la recette ou
// ligne ajoutee a la main) - renvoie l'unite, le disponible reel (stock -
// deja reserve ailleurs, meme calcul que le chargement initial de la
// page) et les lots existants au Depot B pour peupler le select.
export async function fetchBesoinArticleInfoAction(articleMpId: number, depotId: number) {
  if (!articleMpId || !depotId) {
    return { unite: "-", disponible: 0, lots: [] as LotDisponible[] };
  }

  const [{ data: articleData }, lots] = await Promise.all([
    supabaseServer.from("articles_matiere_premiere").select("unite").eq("id", articleMpId).maybeSingle(),
    fetchLotsDisponiblesPourBesoin(articleMpId, depotId),
  ]);

  return {
    unite: (articleData as { unite: string | null } | null)?.unite ?? "-",
    disponible: lots.reduce((sum, l) => sum + l.solde, 0),
    lots,
  };
}

// Utilise depuis la page "Besoin" (Salle de pesage/conditionnement,
// accessible depuis le Dashboard) - suivi INDEPENDANT de Fabrication/
// Conditionnement (stage "pesage"/"salle_conditionnement", jamais "vrac"/
// "carton" - sinon Valider ici faisait aussi disparaitre la ligne des
// colonnes Fabrication/Conditionnement, qui partagent leur propre suivi
// via Fin programme). Reserve aussi chaque MP besoin (article_mp_id[]/
// besoin[] - meme convention getAll() indexee que partout ailleurs) dans
// Depot B, pour qu'un AUTRE batch ayant besoin de la meme MP ne la voit
// plus comme disponible, meme si le stock reel n'a pas encore bouge.
// Redirige vers le Dashboard apres coup pour que la ligne validee
// disparaisse immediatement.
export async function validerBatchAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  const besoinStage = String(formData.get("stage") || "") === "carton" ? "carton" : "vrac";
  const storedStage: CodeTermineStage = besoinStage === "carton" ? "salle_conditionnement" : "pesage";

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();
  const qt = String(formData.get("qt") || "");
  const numeroLot = String(formData.get("numero_lot") || "").trim();

  // Ce numero de lot alimente ensuite lots_stock.numero_lot (NOT NULL) au
  // credit Fabrication et a la consommation Conditionnement - le laisser
  // vide ici faisait planter ces sauvegardes bien plus tard avec une
  // erreur Postgres illisible au lieu d'etre bloque des la validation.
  if (!numeroLot) {
    redirect(
      `/production/suivi/dashboard/besoin/${ligneId}?code=${encodeURIComponent(code)}&stage=${besoinStage}&qt=${encodeURIComponent(qt)}&erreur=${encodeURIComponent(
        "Le numero de lot est obligatoire pour valider."
      )}`
    );
  }

  const articleMpIds = formData.getAll("article_mp_id");
  const besoins = formData.getAll("besoin");
  const numeroLotsMp = formData.getAll("numero_lot_mp");
  const reservations = articleMpIds
    .map((raw, index) => ({
      articleMpId: Number(raw || "0"),
      quantite: Number(String(besoins[index] || "0").replace(",", ".")),
      numeroLot: String(numeroLotsMp[index] || "").trim(),
    }))
    .filter((r) => r.articleMpId > 0 && r.quantite > 0);

  // Chaque MP reservee doit avoir SON PROPRE numero de lot, distinct du
  // numero de lot du produit fini (code/batch) saisi plus haut - sinon
  // consommerReservationMp (Fabrication/Conditionnement) enregistrait a
  // tort la meme sortie de stock MP pour toutes les MP d'un code, alors
  // qu'elles proviennent chacune d'un lot physique different.
  if (reservations.some((r) => !r.numeroLot)) {
    redirect(
      `/production/suivi/dashboard/besoin/${ligneId}?code=${encodeURIComponent(code)}&stage=${besoinStage}&qt=${encodeURIComponent(qt)}&erreur=${encodeURIComponent(
        "Le numero de lot est obligatoire pour chaque matiere premiere."
      )}`
    );
  }

  let depotBId: number | null = null;

  if (reservations.length > 0) {
    const { data: depotBData } = await supabaseServer
      .from("depots")
      .select("id")
      .ilike("nom", "Depot B")
      .maybeSingle();
    depotBId = (depotBData as { id: number } | null)?.id ?? null;

    // Recalcule le meme disponible PAR LOT que la page Besoin affiche deja
    // (voir fetchLotsDisponiblesPourBesoin) - jamais confiance aux champs
    // caches du formulaire seuls, sinon la validation reste possible meme
    // si le stock a bouge entre l'affichage et le clic. La verification
    // porte sur le LOT precis choisi, jamais sur le total de l'article :
    // un besoin de 200kg couvert par 2 lots de 100kg doit forcement se
    // traduire par 2 lignes de reservation (voir Dispatch auto cote
    // client), jamais une seule ligne de 200kg sur un lot qui n'en a que
    // 100 (bug confirme, cas reel LANETTE SX). Bloque AVANT tout ecriture
    // (markCodeTermine inclus) des qu'un seul lot est en rupture.
    if (depotBId) {
      // Cumule d'abord la demande par (article, lot) - plusieurs lignes du
      // MEME formulaire (Dispatch auto ou ajout manuel) peuvent viser le
      // meme lot, la verification doit porter sur leur somme.
      const demandeParLot = new Map<string, number>();
      for (const r of reservations) {
        const key = `${r.articleMpId}|${r.numeroLot}`;
        demandeParLot.set(key, (demandeParLot.get(key) ?? 0) + r.quantite);
      }

      const articleMpIdsUniques = [...new Set(reservations.map((r) => r.articleMpId))];
      const disponibleParLotParArticle = new Map<number, Map<string, number>>();
      for (const articleMpId of articleMpIdsUniques) {
        const lots = await fetchLotsDisponiblesPourBesoin(articleMpId, depotBId);
        disponibleParLotParArticle.set(articleMpId, new Map(lots.map((l) => [l.numeroLot, l.solde])));
      }

      for (const r of reservations) {
        const key = `${r.articleMpId}|${r.numeroLot}`;
        const demandeTotale = demandeParLot.get(key) ?? 0;
        const disponible = disponibleParLotParArticle.get(r.articleMpId)?.get(r.numeroLot) ?? 0;

        if (demandeTotale > disponible + 1e-6) {
          redirect(
            `/production/suivi/dashboard/besoin/${ligneId}?code=${encodeURIComponent(code)}&stage=${besoinStage}&qt=${encodeURIComponent(qt)}&erreur=${encodeURIComponent(
              `Stock Depot B insuffisant sur le lot "${r.numeroLot}" - utilise Dispatch auto pour repartir sur plusieurs lots.`
            )}`
          );
        }
      }
    }
  }

  const codeTermineId = await markCodeTermine(formData, storedStage);

  if (reservations.length > 0 && depotBId) {
    // Salle de pesage : une fois pesee, la MP est physiquement sortie de
    // l'entrepot tout de suite (emmenee vers la cuve) - pas seulement
    // "reservee" jusqu'a un eventuel Fin Programme plus tard, qui peut ne
    // jamais arriver. quantite est donc ecrite a 0 des l'insertion (deja
    // sortie reellement, voir l'insert lots_stock_matiere_premiere
    // ci-dessous) ; quantite_initiale garde la trace de ce qui a ete pese.
    // Salle de conditionnement reste purement une reservation ici (voir
    // consommerRemainingMpReserve/releaseRemainingMpReserve a Fin
    // Programme) : la MP n'est physiquement consommee que si elle sert
    // vraiment, sinon elle redevient disponible.
    const quantiteReservee = storedStage === "pesage" ? 0 : undefined;

    const { error: reserveError } = await supabaseServer.from("production_mp_reserve").insert(
      reservations.map((r) => ({
        production_code_termine_id: codeTermineId,
        article_mp_id: r.articleMpId,
        depot_id: depotBId,
        quantite: quantiteReservee ?? r.quantite,
        quantite_initiale: r.quantite,
        numero_lot: r.numeroLot,
      }))
    );
    if (reserveError) {
      throw new Error(reserveError.message);
    }

    if (storedStage === "pesage") {
      const dateJour = new Date().toISOString().slice(0, 10);
      const { error: sortieError } = await supabaseServer.from("lots_stock_matiere_premiere").insert(
        reservations.map((r) => ({
          article_id: r.articleMpId,
          numero_lot: r.numeroLot,
          qte_entree: 0,
          qte_sortie: r.quantite,
          depot_id: depotBId,
          date_jour: dateJour,
          utilisateur: currentUser,
          note: "Consommation production (pesage)",
        }))
      );
      if (sortieError) {
        throw new Error(sortieError.message);
      }
    }
  }

  redirect("/production/suivi/dashboard");
}

// Filet de securite : si "Fin programme" Conditionnement n'a jamais ete
// clique pour ce code (ex: on enchaine directement sur Emballage), sa
// reservation MP "salle_conditionnement" resterait sinon indefiniment
// bloquee sans jamais sortir du stock reel - consommerRemainingMpReserve
// ne fait rien si elle a deja ete traitee (quantite deja a 0).
export async function markEmballageTermineAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  await markCodeTermine(formData, "emballage");

  if (ligneId && code) {
    await consommerRemainingMpReserve(ligneId, code, currentUser, "salle_conditionnement");
  }
}

export async function addCartonEntryAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const quantite = Number(String(formData.get("quantite") || "0").replace(",", "."));
  const dateJour = String(formData.get("date_jour") || "").trim() || new Date().toISOString().slice(0, 10);

  if (!ligneId || !quantite || quantite <= 0) {
    throw new Error("Quantite invalide.");
  }

  const { error } = await supabaseServer.from("production_carton_entries").insert([
    {
      programme_ligne_id: ligneId,
      quantite,
      date_jour: dateJour,
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

export async function addEmballageEntryAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const quantite = Number(String(formData.get("quantite") || "0").replace(",", "."));

  if (!ligneId || !quantite || quantite <= 0) {
    throw new Error("Quantite invalide.");
  }

  const { error } = await supabaseServer.from("production_emballage_entries").insert([
    { programme_ligne_id: ligneId, quantite },
  ]);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

export async function deleteCartonEntryAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "productionSuiviDashboard"))) {
    throw new Error("Cet utilisateur ne peut pas modifier le suivi production.");
  }

  const entryId = Number(String(formData.get("entry_id") || "0"));

  if (!entryId) {
    throw new Error("Entree invalide.");
  }

  const { error } = await supabaseServer.from("production_carton_entries").delete().eq("id", entryId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
}

// Correction manuelle du numero de lot d'un code deja dispatche (ex: typo
// venu du Dispatcher) - reservee aux comptes admin (isAdminUser), pas au
// simple droit d'ecriture du Dashboard deja accorde a plusieurs employes
// pour la saisie de production. Renomme en cascade tout ce qui est deja
// rattache a l'ancien code SUR CETTE MEME LIGNE (programme_ligne_id) :
// sinon les saisies deja enregistrees (vrac/carton/emballage, Fin
// programme, rapports/tests labo) resteraient invisibles sous le nouveau
// code affiche.
export async function renameLotCodeAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!isAdminUser(currentUser)) {
    throw new Error("Seul un compte administrateur peut modifier le numero de lot.");
  }

  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const oldCode = String(formData.get("old_code") || "").trim();
  const newCode = String(formData.get("new_code") || "").trim();

  if (!ligneId || !oldCode || !newCode || oldCode === newCode) return;

  const { data: ligneData, error: ligneError } = await supabaseServer
    .from("programme_lignes")
    .select("id, numero_lot, numero_lot_detail")
    .eq("id", ligneId)
    .maybeSingle();

  if (ligneError || !ligneData) {
    throw new Error(ligneError?.message || "Ligne introuvable.");
  }

  const ligne = ligneData as {
    id: number;
    numero_lot: string | null;
    numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
  };

  const codes = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!codes.includes(oldCode)) {
    throw new Error("Ce code n'existe plus sur cette ligne (page pas a jour, recharge-la).");
  }
  if (codes.includes(newCode)) {
    throw new Error("Ce numero de lot est deja utilise sur cette meme ligne.");
  }

  const newNumeroLot = codes.map((c) => (c === oldCode ? newCode : c)).join(", ");
  const newDetail = Array.isArray(ligne.numero_lot_detail)
    ? ligne.numero_lot_detail.map((entry) => (entry.code === oldCode ? { ...entry, code: newCode } : entry))
    : ligne.numero_lot_detail;

  const { error: updateLigneError } = await supabaseServer
    .from("programme_lignes")
    .update({ numero_lot: newNumeroLot, numero_lot_detail: newDetail })
    .eq("id", ligneId);
  if (updateLigneError) {
    throw new Error(updateLigneError.message);
  }

  await Promise.all([
    supabaseServer
      .from("production_carton_entries")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
    supabaseServer
      .from("production_vrac_entries")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
    supabaseServer
      .from("production_emballage_entries")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
    supabaseServer
      .from("production_code_termine")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
    supabaseServer
      .from("production_rapports")
      .update({ code: newCode })
      .eq("programme_ligne_id", ligneId)
      .eq("code", oldCode),
  ]);

  revalidateSuiviPages();
}
