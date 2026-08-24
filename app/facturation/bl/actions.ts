"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "facturationBl"))) {
    throw new Error("Cet utilisateur ne peut pas creer de Bon de Livraison.");
  }
  return currentUser;
}

// Meme principe que nextTransferOrderNumero (app/depots/transfer-order/actions.ts)
// : le plus grand numero existant cette annee-la + 1, fige a l'insertion.
async function nextBonLivraisonNumero(dateJour: string): Promise<number> {
  const year = dateJour.slice(0, 4);
  const { data } = await supabaseServer
    .from("bons_livraison")
    .select("numero")
    .gte("date_jour", `${year}-01-01`)
    .lte("date_jour", `${year}-12-31`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { numero: number | null } | null)?.numero ?? 0) + 1;
}

// Cree un BL a partir d'une commande deja livree - lit fifo_resultats (la
// vraie quantite/lot physiquement charge, pas commande_lignes.quantite_demandee
// qui est juste la demande initiale) et copie ca dans bon_livraison_lignes.
// Ne touche jamais a "commandes" - le module lit, n'ecrit jamais dedans.
export async function createBonLivraisonAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const commandeId = Number(formData.get("commande_id") || "0");
  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const { data: commandeData, error: commandeError } = await supabaseServer
    .from("commandes")
    .select("id, statut")
    .eq("id", commandeId)
    .maybeSingle();

  if (commandeError || !commandeData) {
    throw new Error("Commande introuvable.");
  }
  if ((commandeData as { statut: string }).statut !== "LIVREE") {
    throw new Error("Cette commande n'est pas encore livree - impossible de creer un Bon de Livraison.");
  }

  const { data: existingBl } = await supabaseServer
    .from("bons_livraison")
    .select("id")
    .eq("commande_id", commandeId)
    .maybeSingle();
  if (existingBl) {
    throw new Error("Un Bon de Livraison existe deja pour cette commande.");
  }

  const { data: fifoData, error: fifoError } = await supabaseServer
    .from("fifo_resultats")
    .select("article_id, numero_lot, quantite_chargee")
    .eq("commande_id", commandeId);

  if (fifoError) {
    throw new Error(fifoError.message);
  }

  const fifoRows = (fifoData ?? []) as { article_id: number; numero_lot: string | null; quantite_chargee: number }[];
  if (fifoRows.length === 0) {
    throw new Error("Aucune quantite chargee trouvee pour cette commande - rien a mettre sur le BL.");
  }

  const parCle = new Map<string, { articleId: number; numeroLot: string | null; quantite: number }>();
  for (const row of fifoRows) {
    const key = `${row.article_id}::${row.numero_lot ?? ""}`;
    const existing = parCle.get(key);
    if (existing) existing.quantite += Number(row.quantite_chargee ?? 0);
    else parCle.set(key, { articleId: row.article_id, numeroLot: row.numero_lot, quantite: Number(row.quantite_chargee ?? 0) });
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const numero = await nextBonLivraisonNumero(dateJour);

  const { data: inserted, error: insertError } = await supabaseServer
    .from("bons_livraison")
    .insert({ numero, date_jour: dateJour, commande_id: commandeId, cree_par: currentUser })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message || "Impossible de creer le Bon de Livraison.");
  }

  const { error: lignesError } = await supabaseServer.from("bon_livraison_lignes").insert(
    [...parCle.values()].map((ligne) => ({
      bon_livraison_id: inserted.id,
      article_id: ligne.articleId,
      numero_lot: ligne.numeroLot,
      quantite: ligne.quantite,
    }))
  );

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  revalidatePath("/facturation/proforma");
  revalidatePath("/facturation/bl");
  redirect(`/facturation/bl/${inserted.id}`);
}

export async function updateBonLivraisonRemarqueAction(formData: FormData) {
  await requireWriteAccess();

  const bonLivraisonId = Number(formData.get("bon_livraison_id") || "0");
  if (!bonLivraisonId) {
    throw new Error("Bon de Livraison invalide.");
  }

  const { error } = await supabaseServer
    .from("bons_livraison")
    .update({ remarque: String(formData.get("remarque") || "").trim() || null })
    .eq("id", bonLivraisonId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/facturation/bl/${bonLivraisonId}`);
}

async function deleteBonLivraison(bonLivraisonId: number): Promise<void> {
  const { data: facture } = await supabaseServer
    .from("factures")
    .select("id")
    .eq("bon_livraison_id", bonLivraisonId)
    .maybeSingle();

  if (facture) {
    throw new Error("Impossible de supprimer : une Facture existe deja pour ce Bon de Livraison. Supprime d'abord la Facture.");
  }

  const { error } = await supabaseServer.from("bons_livraison").delete().eq("id", bonLivraisonId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteBonLivraisonAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "facturationBl"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de Bon de Livraison.");
  }

  const bonLivraisonId = Number(formData.get("bon_livraison_id") || "0");
  if (!bonLivraisonId) {
    throw new Error("Bon de Livraison invalide.");
  }

  // Meme regle que partout ailleurs (formulaire natif <form action>, jamais
  // de catch cote client possible) : capture ici et redirige avec le vrai
  // message en avertissement plutot que la page d'erreur generique.
  try {
    await deleteBonLivraison(bonLivraisonId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant la suppression.";
    redirect(`/facturation/bl/${bonLivraisonId}?avertissement=${encodeURIComponent(message)}`);
  }

  revalidatePath("/facturation/bl");
  revalidatePath("/facturation/proforma");
  redirect("/facturation/bl");
}
