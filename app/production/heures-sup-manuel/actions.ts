"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

async function requireWriteAccess() {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, "productionHeuresSupManuel"))) {
    throw new Error("Cet utilisateur ne peut pas ajouter de ligne.");
  }
  return currentUser;
}

// Retrouve l'activite par son nom (menu deroulant existant OU "+ Nouvelle
// activite" tape a la main) et la cree si elle n'existe pas encore - la
// liste s'enrichit ainsi toute seule au fil des saisies, jamais besoin d'un
// ecran de gestion separe (demande explicite : "laisse moi la possibilite
// d'ajouter des nouvelles choses").
async function resolveActiviteId(nomBrut: string): Promise<number> {
  const nom = nomBrut.trim();
  if (!nom) {
    throw new Error("L'activite est obligatoire.");
  }

  const { data: existing, error: existingError } = await supabaseServer
    .from("heures_sup_activites")
    .select("id")
    .ilike("nom", nom)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }
  if (existing) {
    return (existing as { id: number }).id;
  }

  const { data: created, error: createError } = await supabaseServer
    .from("heures_sup_activites")
    .insert({ nom })
    .select("id")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }
  return (created as { id: number }).id;
}

export async function createHeureSupManuelAction(formData: FormData) {
  const currentUser = await requireWriteAccess();

  const dateJour = String(formData.get("date_jour") || "").trim();
  if (!dateJour) {
    throw new Error("La date est obligatoire.");
  }

  const nbJournaliers = Number(String(formData.get("nb_journaliers") || "0").replace(",", "."));
  const nbHeures = Number(String(formData.get("nb_heures") || "0").replace(",", "."));
  if (!(nbJournaliers > 0)) {
    throw new Error("Le nombre de journaliers doit etre superieur a 0.");
  }
  if (!(nbHeures > 0)) {
    throw new Error("Le nombre d'heures doit etre superieur a 0.");
  }

  const activiteId = await resolveActiviteId(String(formData.get("activite") || ""));
  const remarque = String(formData.get("remarque") || "").trim() || null;

  const { error } = await supabaseServer.from("heures_sup_manuel").insert({
    date_jour: dateJour,
    activite_id: activiteId,
    nb_journaliers: nbJournaliers,
    nb_heures: nbHeures,
    remarque,
    cree_par: currentUser,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production/heures-sup-manuel");
}

export async function deleteHeureSupManuelAction(formData: FormData) {
  if (!(await canDeletePageUser(await getCurrentStockUser(), "productionHeuresSupManuel"))) {
    throw new Error("Cet utilisateur ne peut pas supprimer cette ligne.");
  }

  const id = Number(formData.get("id") || "0");
  if (!id) {
    throw new Error("Ligne introuvable.");
  }

  try {
    const { error } = await supabaseServer.from("heures_sup_manuel").delete().eq("id", id);
    if (error) throw new Error(error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur pendant la suppression.";
    redirect(`/production/heures-sup-manuel?avertissement=${encodeURIComponent(message)}`);
  }

  revalidatePath("/production/heures-sup-manuel");
}
