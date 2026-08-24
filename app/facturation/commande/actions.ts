"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "facturationCommande"))) {
    throw new Error("Cet utilisateur ne peut pas creer de commande.");
  }
  return currentUser;
}

// Meme principe que nextTransferOrderNumero (app/depots/transfer-order/actions.ts)
// : le plus grand numero existant cette annee-la + 1, fige a l'insertion.
async function nextCommandeNumero(dateJour: string): Promise<number> {
  const year = dateJour.slice(0, 4);
  const { data } = await supabaseServer
    .from("facturation_commandes")
    .select("numero")
    .gte("date_jour", `${year}-01-01`)
    .lte("date_jour", `${year}-12-31`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { numero: number | null } | null)?.numero ?? 0) + 1;
}

// Saisie de commande independante de app/commandes/ (jamais touche a cette
// table) - une ligne par article demande (article_id[]/quantite_demandee[]
// - meme convention getAll() indexee que Transfer Order). Pas de
// verification de stock ici : le stock n'est verifie/pris qu'au FIFO, puis
// reellement sorti qu'a la Livraison (etapes suivantes du cycle).
export async function createCommandeAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const client = String(formData.get("client") || "").trim();
  const depotSourceId = Number(formData.get("depot_source_id") || "0");

  if (!client) {
    throw new Error("Le client est obligatoire.");
  }
  if (!depotSourceId) {
    throw new Error("Choisis le depot source.");
  }

  const articleIds = formData.getAll("article_id");
  const quantites = formData.getAll("quantite_demandee");

  const lignes = articleIds
    .map((raw, index) => ({
      articleId: Number(raw || "0"),
      quantite: Number(String(quantites[index] || "0").replace(",", ".")),
    }))
    .filter((l) => l.articleId > 0 && l.quantite > 0);

  if (lignes.length === 0) {
    throw new Error("Ajoute au moins une ligne (article + quantite).");
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const numero = await nextCommandeNumero(dateJour);

  const { data: inserted, error: insertError } = await supabaseServer
    .from("facturation_commandes")
    .insert({ numero, date_jour: dateJour, client, depot_source_id: depotSourceId, cree_par: currentUser })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message || "Impossible de creer la commande.");
  }

  const { error: lignesError } = await supabaseServer.from("facturation_commande_lignes").insert(
    lignes.map((l) => ({ commande_id: inserted.id, article_id: l.articleId, quantite_demandee: l.quantite }))
  );

  if (lignesError) {
    throw new Error(lignesError.message);
  }

  revalidatePath("/facturation/commande");
  redirect(`/facturation/commande/${inserted.id}`);
}

async function deleteCommande(commandeId: number): Promise<void> {
  const { data: bl } = await supabaseServer
    .from("bons_livraison")
    .select("id")
    .eq("commande_id", commandeId)
    .maybeSingle();

  if (bl) {
    throw new Error("Impossible de supprimer : un Bon de Livraison existe deja pour cette commande.");
  }

  const { error } = await supabaseServer.from("facturation_commandes").delete().eq("id", commandeId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteCommandeAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, "facturationCommande"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer de commande.");
  }

  const commandeId = Number(formData.get("commande_id") || "0");
  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  try {
    await deleteCommande(commandeId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant la suppression.";
    redirect(`/facturation/commande/${commandeId}?avertissement=${encodeURIComponent(message)}`);
  }

  revalidatePath("/facturation/commande");
  redirect("/facturation/commande");
}
