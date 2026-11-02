"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";

const PAGE_EQUIPEMENTS = "productionPlastiqueEquipements";

function lireNom(formData: FormData): string {
  const nom = String(formData.get("nom") || "").trim().slice(0, 100);
  if (!nom) throw new Error("Le nom de l'equipement est obligatoire.");
  return nom;
}

// TON / SECTION : texte libre court, vide = non renseigne. Renvoie les seuls champs presents dans le formulaire (ils n'y sont
// que si les colonnes existent, voir add_ton_section_equipements_plastique.sql) pour ne jamais ecrire dans une colonne absente.
function lireTonSection(formData: FormData): { ton?: string | null; section?: string | null } {
  const lire = (cle: string) => String(formData.get(cle) || "").trim().slice(0, 50) || null;
  return {
    ...(formData.has("ton") ? { ton: lire("ton") } : {}),
    ...(formData.has("section") ? { section: lire("section") } : {}),
  };
}

// Les memes pages montrent la liste (Equipements) ou la proposent (colonne Machine en cours de E3, depuis Rapport MP aussi)
function revalidateEquipementsPlastique() {
  revalidatePath("/production-plastique/equipements");
  revalidatePath("/production-plastique/statistique");
  revalidatePath("/stock/matiere-premiere/rapport/plastique");
}

// Deux equipements ne peuvent pas porter le meme nom, sans tenir compte des majuscules ("m3" = "M3")
async function nomDejaPris(nom: string, sauf?: number): Promise<boolean> {
  const { data, error } = await supabaseServer.from("equipements_plastique").select("id, nom");
  if (error) throw new Error(error.message);
  const cible = nom.toLowerCase();
  return ((data ?? []) as { id: number; nom: string }[]).some((e) => e.id !== sauf && e.nom.trim().toLowerCase() === cible);
}

export async function createEquipementPlastiqueAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, PAGE_EQUIPEMENTS))) {
    throw new Error("Cet utilisateur ne peut pas ajouter d'equipement.");
  }

  const nom = lireNom(formData);
  if (await nomDejaPris(nom)) throw new Error(`L'equipement "${nom}" existe deja.`);

  const { error } = await supabaseServer.from("equipements_plastique").insert({ nom, ...lireTonSection(formData) });
  if (error) throw new Error(error.message);

  revalidateEquipementsPlastique();
}

// Renommer un equipement renomme aussi la machine des articles de E3 qui l'utilisent (la machine d'un article est enregistree
// avec son nom) : aucun article ne se retrouve avec un ancien nom qui n'est plus dans la liste.
export async function renameEquipementPlastiqueAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!(await canWritePageUser(currentUser, PAGE_EQUIPEMENTS))) {
    throw new Error("Cet utilisateur ne peut pas modifier d'equipement.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Equipement invalide.");
  const nom = lireNom(formData);

  const { data: actuel, error: erreurLecture } = await supabaseServer
    .from("equipements_plastique")
    .select("id, nom")
    .eq("id", id)
    .maybeSingle();
  if (erreurLecture) throw new Error(erreurLecture.message);
  if (!actuel) throw new Error("Equipement introuvable.");

  const ancienNom = (actuel as { nom: string }).nom;
  const nomChange = ancienNom !== nom;
  if (nomChange && (await nomDejaPris(nom, id))) throw new Error(`L'equipement "${nom}" existe deja.`);

  const { error } = await supabaseServer
    .from("equipements_plastique")
    .update({ nom, ...lireTonSection(formData) })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (nomChange) {
    const { error: erreurArticles } = await supabaseServer
      .from("articles_matiere_premiere")
      .update({ machine_plastique: nom })
      .eq("machine_plastique", ancienNom);
    if (erreurArticles) throw new Error(erreurArticles.message);
  }

  revalidateEquipementsPlastique();
}

// Un equipement encore choisi sur des articles de E3 ne se supprime pas (il faudrait d'abord les changer).
export async function deleteEquipementPlastiqueAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();
  if (!(await canDeletePageUser(currentUser, PAGE_EQUIPEMENTS))) {
    throw new Error("Cet utilisateur ne peut pas supprimer d'equipement.");
  }

  const id = Number(String(formData.get("id") || "0"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Equipement introuvable.");

  const { data: actuel, error: erreurLecture } = await supabaseServer
    .from("equipements_plastique")
    .select("id, nom")
    .eq("id", id)
    .maybeSingle();
  if (erreurLecture) throw new Error(erreurLecture.message);
  if (!actuel) throw new Error("Equipement introuvable.");
  const nom = (actuel as { nom: string }).nom;

  const { count, error: erreurCompte } = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id", { count: "exact", head: true })
    .eq("machine_plastique", nom);
  if (erreurCompte) throw new Error(erreurCompte.message);
  if ((count ?? 0) > 0) {
    throw new Error(
      `L'equipement "${nom}" est encore utilise par ${count} article(s) dans Statistique Article Plastique (E3) - change leur machine avant de le supprimer.`
    );
  }

  const { error } = await supabaseServer.from("equipements_plastique").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidateEquipementsPlastique();
}
