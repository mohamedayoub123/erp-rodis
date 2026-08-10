"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { fetchLotsInDepot, totalAvailable } from "@/app/depots/transfer-order/stock-lots";

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

export async function markVracTermineAction(formData: FormData) {
  await markCodeTermine(formData, "vrac");
}

// Fin programme independante par colonne du Dashboard : fermer Fabrication
// ne ferme plus Conditionnement/Emballage (et inversement) - chaque etape a
// son propre flag "termine".
export async function markCartonTermineAction(formData: FormData) {
  await markCodeTermine(formData, "carton");
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
  const reservations = articleMpIds
    .map((raw, index) => ({
      articleMpId: Number(raw || "0"),
      quantite: Number(String(besoins[index] || "0").replace(",", ".")),
    }))
    .filter((r) => r.articleMpId > 0 && r.quantite > 0);

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
        const lots = await fetchLotsInDepot("MP", r.articleMpId, depotBId);
        const stockReel = totalAvailable(lots);

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
