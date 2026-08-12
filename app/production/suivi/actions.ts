"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser, isAdminUser } from "@/lib/stock-auth";
import { fetchTotalStockInDepot, fetchLotsInDepot } from "@/app/depots/transfer-order/stock-lots";

function revalidateSuiviPages() {
  revalidatePath("/production/suivi");
  revalidatePath("/production/suivi/dashboard");
  revalidatePath("/production/suivi/calendrier");
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
    .upsert([{ programme_ligne_id: ligneId, code, stage, numero_lot: numeroLot }], {
      onConflict: "programme_ligne_id,code,stage",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidateSuiviPages();
  return (data as { id: number }).id;
}

// "Fin programme" declare qu'aucune autre production ne viendra pour ce
// code sur cette etape - la part de reservation MP jamais consommee (ex:
// production arretee a 2950 sur 3000 prevus, 5kg encore "reserves" sans
// jamais avoir ete sortis du stock reel, voir consommerReservationMp)
// est traitee differemment selon l'etape :
//  - Salle de conditionnement (carton/sleeve...) : jamais physiquement
//    consommee si non utilisee, elle redevient simplement disponible.
//  - Salle de pesage (matiere premiere Fabrication) : une fois pesee,
//    elle est physiquement sortie de l'entrepot (emmenee vers la cuve)
//    meme si le vrac produit est finalement moindre que prevu - elle ne
//    revient jamais au stock, elle doit etre reellement deduite.
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

async function releaseRemainingMpReserve(
  ligneId: number,
  code: string,
  stage: "pesage" | "salle_conditionnement"
) {
  const found = await fetchReservesRestantes(ligneId, code, stage);
  if (!found || found.reserves.length === 0) return;

  const { error } = await supabaseServer
    .from("production_mp_reserve")
    .update({ quantite: 0 })
    .in(
      "id",
      found.reserves.map((r) => r.id)
    );
  if (error) {
    throw new Error(error.message);
  }
}

async function consommerRemainingMpReserve(ligneId: number, code: string, currentUser: string | null) {
  const found = await fetchReservesRestantes(ligneId, code, "pesage");
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
    await consommerRemainingMpReserve(ligneId, code, currentUser);
  }
}

// Fin programme independante par colonne du Dashboard : fermer Fabrication
// ne ferme plus Conditionnement/Emballage (et inversement) - chaque etape a
// son propre flag "termine".
export async function markCartonTermineAction(formData: FormData) {
  const ligneId = Number(String(formData.get("ligne_id") || "0"));
  const code = String(formData.get("code") || "").trim();

  await markCodeTermine(formData, "carton");

  if (ligneId && code) {
    await releaseRemainingMpReserve(ligneId, code, "salle_conditionnement");
  }
}

// Utilise par la page "Besoin" quand l'utilisateur choisit/change un
// article MP sur une ligne (ligne auto-calculee depuis la recette ou
// ligne ajoutee a la main) - renvoie l'unite, le disponible reel (stock -
// deja reserve ailleurs, meme calcul que le chargement initial de la
// page) et les lots existants au Depot B pour peupler le select.
export async function fetchBesoinArticleInfoAction(articleMpId: number, depotId: number) {
  if (!articleMpId || !depotId) {
    return { unite: "-", disponible: 0, lots: [] as { numeroLot: string; solde: number }[] };
  }

  const [{ data: articleData }, stockReel, lots, { data: reserveData }] = await Promise.all([
    supabaseServer.from("articles_matiere_premiere").select("unite").eq("id", articleMpId).maybeSingle(),
    fetchTotalStockInDepot("MP", articleMpId, depotId),
    fetchLotsInDepot("MP", articleMpId, depotId),
    supabaseServer
      .from("production_mp_reserve")
      .select("quantite")
      .eq("depot_id", depotId)
      .eq("article_mp_id", articleMpId),
  ]);

  const dejaReserve = ((reserveData ?? []) as { quantite: number }[]).reduce(
    (sum, r) => sum + Number(r.quantite ?? 0),
    0
  );

  return {
    unite: (articleData as { unite: string | null } | null)?.unite ?? "-",
    disponible: Math.max(0, stockReel - dejaReserve),
    lots: lots.map((l) => ({ numeroLot: l.numeroLot, solde: l.solde })),
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

    // Recalcule le meme "stock reel - deja reserve ailleurs" que la page
    // Besoin affiche deja (badge Insuffisant/OK) - jamais confiance aux
    // champs caches du formulaire seuls, sinon la validation reste
    // possible meme si le stock a bouge entre l'affichage et le clic.
    // Bloque AVANT tout ecriture (markCodeTermine inclus) des qu'un seul
    // article MP est en rupture.
    if (depotBId) {
      for (const r of reservations) {
        const stockReel = await fetchTotalStockInDepot("MP", r.articleMpId, depotBId);

        const { data: reserveData } = await supabaseServer
          .from("production_mp_reserve")
          .select("quantite")
          .eq("depot_id", depotBId)
          .eq("article_mp_id", r.articleMpId);
        const dejaReserve = ((reserveData ?? []) as { quantite: number }[]).reduce(
          (sum, row) => sum + Number(row.quantite ?? 0),
          0
        );
        const disponible = Math.max(0, stockReel - dejaReserve);

        if (r.quantite > disponible + 1e-6) {
          redirect(
            `/production/suivi/dashboard/besoin/${ligneId}?code=${encodeURIComponent(code)}&stage=${besoinStage}&qt=${encodeURIComponent(qt)}&erreur=${encodeURIComponent(
              "Stock Depot B insuffisant pour valider ce batch - verifie la colonne Disponible."
            )}`
          );
        }
      }
    }
  }

  const codeTermineId = await markCodeTermine(formData, storedStage);

  if (reservations.length > 0 && depotBId) {
    const { error: reserveError } = await supabaseServer.from("production_mp_reserve").insert(
      reservations.map((r) => ({
        production_code_termine_id: codeTermineId,
        article_mp_id: r.articleMpId,
        depot_id: depotBId,
        quantite: r.quantite,
        quantite_initiale: r.quantite,
        numero_lot: r.numeroLot,
      }))
    );
    if (reserveError) {
      throw new Error(reserveError.message);
    }
  }

  redirect("/production/suivi/dashboard");
}

export async function markEmballageTermineAction(formData: FormData) {
  await markCodeTermine(formData, "emballage");
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
