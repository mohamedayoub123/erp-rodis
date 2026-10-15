"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import {
  CLE_PAGE_NOMS_CONDITIONNEMENT,
  LIBELLE_TYPE_NOM,
  TYPES_NOM_CONDITIONNEMENT,
  URL_PAGE_NOMS_CONDITIONNEMENT,
  nettoyerNom,
  type TypeNomConditionnement,
} from "@/lib/noms-conditionnement";

// Un throw depuis une Server Action donne la page d'erreur generique en production : on revient sur la page avec le vrai message.
function retour(message: { erreur?: string; ok?: string }): never {
  const params = new URLSearchParams();
  if (message.erreur) params.set("erreur", message.erreur);
  if (message.ok) params.set("ok", message.ok);
  redirect(`${URL_PAGE_NOMS_CONDITIONNEMENT}?${params.toString()}`);
}

function lireType(valeur: FormDataEntryValue | null): TypeNomConditionnement | null {
  const texte = String(valeur ?? "");
  return (TYPES_NOM_CONDITIONNEMENT as readonly string[]).includes(texte) ? (texte as TypeNomConditionnement) : null;
}

const MESSAGE_TABLE_ABSENTE =
  "La table des noms n'existe pas encore : lance le SQL create_conditionnement_noms.sql dans Supabase (SQL Editor).";

export async function ajouterNomConditionnementAction(formData: FormData) {
  const utilisateur = await getCurrentStockUser();
  if (!(await canWritePageUser(utilisateur, CLE_PAGE_NOMS_CONDITIONNEMENT))) {
    retour({ erreur: "Cet utilisateur ne peut pas modifier les noms." });
  }

  const type = lireType(formData.get("type"));
  const nom = nettoyerNom(String(formData.get("nom") ?? ""));
  if (!type) retour({ erreur: "Liste invalide." });
  if (!nom) retour({ erreur: "Ecris un nom avant d'ajouter." });
  if (nom.length > 60) retour({ erreur: "Nom trop long (60 caracteres au maximum)." });

  const { error } = await supabaseServer.from("conditionnement_noms").insert({ type, nom, cree_par: utilisateur });
  if (error) {
    if (error.code === "23505") retour({ erreur: `"${nom}" est deja dans la liste ${LIBELLE_TYPE_NOM[type]}.` });
    if (/conditionnement_noms|does not exist|schema cache/i.test(error.message)) retour({ erreur: MESSAGE_TABLE_ABSENTE });
    retour({ erreur: error.message });
  }

  await logAudit({
    utilisateur,
    module: "NomsConditionnement",
    action: "creation",
    cible: nom,
    resume: `Nom "${nom}" ajoute a la liste ${LIBELLE_TYPE_NOM[type]} (Conditionnement)`,
  });

  revalidatePath(URL_PAGE_NOMS_CONDITIONNEMENT);
  retour({ ok: `"${nom}" ajoute a la liste ${LIBELLE_TYPE_NOM[type]}.` });
}

export async function supprimerNomConditionnementAction(formData: FormData) {
  const utilisateur = await getCurrentStockUser();
  if (!(await canWritePageUser(utilisateur, CLE_PAGE_NOMS_CONDITIONNEMENT))) {
    retour({ erreur: "Cet utilisateur ne peut pas modifier les noms." });
  }

  const id = Number(String(formData.get("id") ?? "0"));
  if (!Number.isInteger(id) || id <= 0) retour({ erreur: "Nom invalide." });

  const { data: existant } = await supabaseServer.from("conditionnement_noms").select("type, nom").eq("id", id).maybeSingle();
  const ligne = existant as { type: TypeNomConditionnement; nom: string } | null;
  if (!ligne) retour({ erreur: "Ce nom n'existe plus." });

  const { error } = await supabaseServer.from("conditionnement_noms").delete().eq("id", id);
  if (error) retour({ erreur: error.message });

  await logAudit({
    utilisateur,
    module: "NomsConditionnement",
    action: "suppression",
    cible: ligne.nom,
    resume: `Nom "${ligne.nom}" retire de la liste ${LIBELLE_TYPE_NOM[ligne.type]} (Conditionnement)`,
    avant: ligne,
  });

  revalidatePath(URL_PAGE_NOMS_CONDITIONNEMENT);
  retour({ ok: `"${ligne.nom}" retire de la liste ${LIBELLE_TYPE_NOM[ligne.type]}.` });
}
