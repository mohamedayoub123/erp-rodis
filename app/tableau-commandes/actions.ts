"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { buildAllFamiliesSheets, type FamilySheet } from "./family-data";
import { buildManquantSheet } from "./manquant-data";

// "tableauCommandes" est une page en lecture seule (hasWrite: false dans
// page-registry.ts) - la note est une edition de la commande elle-meme,
// donc on reutilise le droit d'ecriture "commandesDetail" (meme permission
// que /commandes/[id]) plutot que d'en creer un nouveau juste pour cette
// case - meme choix deja fait pour reassignArticlesGammeAction.
export async function updateCommandeNoteAction(formData: FormData) {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "commandesDetail"))) {
    throw new Error("Cet utilisateur ne peut pas modifier cette note.");
  }

  const commandeId = Number(String(formData.get("commande_id") || "0"));
  if (!commandeId) {
    throw new Error("Commande invalide.");
  }

  const note = String(formData.get("note") || "").trim() || null;

  const { error } = await supabaseServer
    .from("commandes")
    .update({ note_tableau_commande: note })
    .eq("id", commandeId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/tableau-commandes");
}

// Export Excel de toutes les familles en un seul fichier (une feuille par
// famille). Les donnees sont calculees ici (serveur), le fichier est construit
// dans le navigateur (voir export-toutes-familles-button.tsx). Renvoie un
// message d'erreur lisible au lieu de lever une exception : en production
// Next.js masque le texte des exceptions des Server Actions.
type ResultatExport = { ok: true; sheets: FamilySheet[]; avertissement?: string } | { ok: false; message: string };

// Cet export lit tout le stock et toutes les commandes (une dizaine de secondes de lecture soutenue sur la
// base). Protection : un seul calcul a la fois par instance du serveur, partage entre tous les clics
// (plusieurs personnes ou clics repetes), et le dernier resultat reussi est reutilise 60 s - sans ca, des
// exports lances en meme temps se multipliaient et saturaient la base pour tout le monde.
const DUREE_CACHE_EXPORT_MS = 60_000;
let exportEnCours: Promise<ResultatExport> | null = null;
let dernierExport: { jusqua: number; resultat: ResultatExport } | null = null;

export async function exportAllFamiliesAction(): Promise<ResultatExport> {
  const currentUser = await getCurrentStockUser();

  if (!(await canViewPageUser(currentUser, "tableauCommandes"))) {
    return { ok: false, message: "Tu n'as pas acces au Tableau de commande." };
  }

  if (dernierExport && dernierExport.jusqua > Date.now()) return dernierExport.resultat;
  if (exportEnCours) return exportEnCours;

  exportEnCours = calculerExportToutesFamilles()
    .then((resultat) => {
      if (resultat.ok) dernierExport = { jusqua: Date.now() + DUREE_CACHE_EXPORT_MS, resultat };
      return resultat;
    })
    .finally(() => {
      exportEnCours = null;
    });

  return exportEnCours;
}

async function calculerExportToutesFamilles(): Promise<ResultatExport> {
  try {
    const sheets = await buildAllFamiliesSheets();

    // Derniere feuille : "Article manquant" (meme contenu que la vue Article manquant). Si elle ne peut
    // pas etre calculee, le fichier des familles est quand meme livre, avec un avertissement.
    let avertissement: string | undefined;
    try {
      const manquant = await buildManquantSheet();
      if (manquant) sheets.push(manquant);
    } catch (error) {
      avertissement =
        "La feuille Article manquant n'a pas pu etre ajoutee : " +
        (error instanceof Error ? error.message : "erreur inconnue.");
    }

    return { ok: true, sheets, avertissement };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Export impossible, reessaie dans un instant.",
    };
  }
}
