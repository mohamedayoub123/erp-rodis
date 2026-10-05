"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import {
  ELEMENTS_CONSO,
  MAX_ELEMENTS_PAR_SAISIE,
  cleElementPerso,
  dateFr,
  dateValide,
  moisDeDate,
  nombreValide,
  texteNettoye,
} from "@/lib/cout-eau-conso";

const TABLE = "cout_eau_conso_saisies";

type Reponse = { ok: true; annee: number; mois: number } | { ok: false; message: string };

function messageTable(message: string) {
  // Seulement quand la table est vraiment absente (script SQL pas execute) : une
  // autre erreur garde son vrai message.
  return message.includes(TABLE) && (message.includes("schema cache") || message.includes("does not exist"))
    ? "La table de consommation de l'eau n'existe pas encore (script SQL a executer)."
    : message;
}

export type LigneNouvelleSaisie = {
  cle: string;
  libelle: string;
  unite: string;
  ligne1: number | null;
  ligne2: number | null;
  perso: boolean;
};

// Ajoute les consommations d'une date (une ligne par element renseigne).
// Renvoie un message lisible au lieu de lever une exception : en production
// Next.js masque le texte des exceptions des Server Actions.
export async function ajouterSaisiesAction(dateBrute: string, lignesBrutes: LigneNouvelleSaisie[]): Promise<Reponse> {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "coutEauConso"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier la consommation de l'eau." };
  }

  const date = dateValide(dateBrute);
  if (!date) return { ok: false, message: "Date invalide." };
  if (!Array.isArray(lignesBrutes) || lignesBrutes.length > ELEMENTS_CONSO.length + MAX_ELEMENTS_PAR_SAISIE) {
    return { ok: false, message: "Saisie invalide." };
  }

  const habituels = new Map(ELEMENTS_CONSO.map((e) => [e.cle, e]));
  const maintenant = new Date().toISOString();
  const lignes = [];

  for (const brute of lignesBrutes) {
    const ligne1 = nombreValide(brute?.ligne1);
    const ligne2 = nombreValide(brute?.ligne2);
    if (ligne1 === null && ligne2 === null) continue;

    const habituel = brute?.perso ? undefined : habituels.get(String(brute?.cle));
    const libelle = habituel ? habituel.libelle : texteNettoye(brute?.libelle, 80);
    if (!libelle) return { ok: false, message: "Un element ajoute n'a pas de nom." };

    lignes.push({
      date_jour: date,
      cle: habituel ? habituel.cle : cleElementPerso(libelle),
      libelle,
      ligne1,
      ligne2,
      unite: texteNettoye(brute?.unite, 20),
      created_by: currentUser,
      updated_by: currentUser,
      created_at: maintenant,
      updated_at: maintenant,
    });
  }

  if (lignes.length === 0) {
    return { ok: false, message: "Saisis au moins une quantite (Ligne 1 ou Ligne 2)." };
  }

  const { error } = await supabaseServer.from(TABLE).insert(lignes);
  if (error) return { ok: false, message: messageTable(error.message) };

  await logAudit({
    utilisateur: currentUser,
    module: "CoutEauConso",
    action: "creation",
    cible: `Consommation d'eau ${dateFr(date)}`,
    resume: `Consommation d'eau du ${dateFr(date)} : ${lignes.length} element(s) ajoute(s)`,
    apres: lignes.map((l) => ({ element: l.libelle, ligne1: l.ligne1, ligne2: l.ligne2, unite: l.unite })),
  });

  revalidatePath("/cout/consommation-eau");
  return { ok: true, ...moisDeDate(date) };
}

type SaisieEnBase = {
  id: number;
  date_jour: string;
  cle: string;
  libelle: string;
  ligne1: number | null;
  ligne2: number | null;
  unite: string | null;
};

async function lireSaisie(id: number) {
  const { data } = await supabaseServer
    .from(TABLE)
    .select("id, date_jour, cle, libelle, ligne1, ligne2, unite")
    .eq("id", id)
    .maybeSingle();
  return (data as SaisieEnBase | null) ?? null;
}

// Corrige une saisie : date, quantites, unite.
export async function modifierSaisieAction(
  id: number,
  dateBrute: string,
  ligne1Brute: string,
  ligne2Brute: string,
  uniteBrute: string
): Promise<Reponse> {
  const currentUser = await getCurrentStockUser();

  if (!(await canWritePageUser(currentUser, "coutEauConso"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas modifier la consommation de l'eau." };
  }

  const date = dateValide(dateBrute);
  if (!date) return { ok: false, message: "Date invalide." };

  const ligne1 = nombreValide(ligne1Brute);
  const ligne2 = nombreValide(ligne2Brute);
  if (ligne1 === null && ligne2 === null) {
    return { ok: false, message: "Saisis au moins une quantite (Ligne 1 ou Ligne 2)." };
  }

  const avant = await lireSaisie(Number(id));
  if (!avant) return { ok: false, message: "Cette saisie n'existe plus (recharge la page)." };

  const apres = { date_jour: date, ligne1, ligne2, unite: texteNettoye(uniteBrute, 20) };

  const { error } = await supabaseServer
    .from(TABLE)
    .update({ ...apres, updated_by: currentUser, updated_at: new Date().toISOString() })
    .eq("id", avant.id);

  if (error) return { ok: false, message: messageTable(error.message) };

  await logAudit({
    utilisateur: currentUser,
    module: "CoutEauConso",
    action: "modification",
    cible: `Consommation d'eau ${dateFr(avant.date_jour)} - ${avant.libelle}`,
    resume: `Consommation d'eau modifiee : ${avant.libelle} (${dateFr(avant.date_jour)}${
      avant.date_jour !== date ? ` -> ${dateFr(date)}` : ""
    })`,
    avant,
    apres: { ...avant, ...apres },
  });

  revalidatePath("/cout/consommation-eau");
  return { ok: true, ...moisDeDate(date) };
}

// Supprime une saisie (reserve a ceux qui ont le droit Supprimer).
export async function supprimerSaisieAction(id: number): Promise<Reponse> {
  const currentUser = await getCurrentStockUser();

  if (!(await canDeletePageUser(currentUser, "coutEauConso"))) {
    return { ok: false, message: "Cet utilisateur ne peut pas supprimer une saisie." };
  }

  const avant = await lireSaisie(Number(id));
  if (!avant) return { ok: false, message: "Cette saisie n'existe plus (recharge la page)." };

  const { error } = await supabaseServer.from(TABLE).delete().eq("id", avant.id);
  if (error) return { ok: false, message: messageTable(error.message) };

  await logAudit({
    utilisateur: currentUser,
    module: "CoutEauConso",
    action: "suppression",
    cible: `Consommation d'eau ${dateFr(avant.date_jour)} - ${avant.libelle}`,
    resume: `Consommation d'eau supprimee : ${avant.libelle} (${dateFr(avant.date_jour)})`,
    avant,
  });

  revalidatePath("/cout/consommation-eau");
  return { ok: true, ...moisDeDate(avant.date_jour) };
}
