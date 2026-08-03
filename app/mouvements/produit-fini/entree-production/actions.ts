"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

// Cree une entree stock produit fini a partir d'un groupe d'entrees
// emballage (Suivi Production) qui partagent toutes la meme date - meme
// mecanisme que l'entree manuelle (lots_stock + mouvement_groupe_id), mais
// avec sa propre etiquette "Entree Production N" (source_import distinct)
// pour rester reperable a part des entrees tapees a la main (TE).
export async function createEntreeProductionBatchAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!canWritePageUser(currentUser, "mouvementsEntreeProduction")) {
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

  const payload = pendingRows.map((entry) => {
    const ligne = ligneById.get(entry.programme_ligne_id);
    const articleId = ligne?.article_id;
    const numeroLot = (ligne?.numero_lot || "").trim();

    if (!articleId || !numeroLot) {
      throw new Error("Une ligne de production n'a pas d'article ou de code associe.");
    }

    const quantite = Number(String(formData.get(`qty_${entry.id}`) || entry.quantite).replace(",", "."));
    const dateFabrication = String(formData.get(`datefab_${entry.id}`) || entry.date_jour).trim();
    const datePeremption = String(formData.get(`dateperemption_${entry.id}`) || "").trim();
    const chambre = String(formData.get(`chambre_${entry.id}`) || "").trim();
    const codePays = String(formData.get(`codepays_${entry.id}`) || "").trim();

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
    };
  });

  const { data: inserted, error: insertError } = await supabaseServer
    .from("lots_stock")
    .insert(payload)
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

  revalidatePath("/mouvements/produit-fini/entree-production");
  revalidatePath("/mouvements/produit-fini");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
}
