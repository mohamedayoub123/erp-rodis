"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { canViewPageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { logAudit } from "@/lib/audit-log";
import {
  CLE_PAGE_SUIVI_CONTENEURS,
  URL_PAGE_IMPORT_MP,
  URL_PAGE_SUIVI_CONTENEURS,
  lireNumerosConteneurs,
  normaliserNumeroDocument,
  suiviConfigure,
} from "@/lib/suivi-conteneur";
import { COLONNES_SUIVI, actualiserLigneSuivi, actualiserLignesSuivi, type LigneSuivi } from "@/lib/suivi-conteneur-db";

type Message = { erreur?: string; ok?: string; avertissement?: string };

// Un throw depuis une Server Action donne la page d'erreur generique en production : on revient sur la page d'ou l'on vient
// (champ cache "retour", limite aux pages Import MP / Suivi conteneurs) avec le vrai message.
function retourner(retour: string, message: Message): never {
  const autorise = retour.startsWith(URL_PAGE_IMPORT_MP) ? retour : URL_PAGE_IMPORT_MP;
  const [chemin, requete = ""] = autorise.split("?");
  const params = new URLSearchParams(requete);
  for (const cle of ["erreur", "ok", "avertissement"] as const) {
    params.delete(cle);
    const valeur = message[cle];
    if (valeur) params.set(cle, valeur);
  }
  redirect(`${chemin}?${params.toString()}`);
}

function lireRetour(formData: FormData): string {
  return String(formData.get("retour") || URL_PAGE_IMPORT_MP);
}

function texteOptionnel(formData: FormData, nom: string): string | null {
  const valeur = String(formData.get(nom) ?? "").trim();
  return valeur || null;
}

function revalider() {
  revalidatePath(URL_PAGE_IMPORT_MP);
  revalidatePath(URL_PAGE_SUIVI_CONTENEURS);
}

// Ajoute un ou plusieurs conteneurs a un dossier Import et lance tout de suite leur suivi (le service met ensuite quelques minutes a
// retrouver l'expedition : la page se met a jour toute seule).
export async function enregistrerConteneursDossierAction(formData: FormData) {
  const retour = lireRetour(formData);
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, "commandeMp"))) {
      retourner(retour, { erreur: "Cet utilisateur ne peut pas modifier les imports." });
    }

    const nDoss4d = texteOptionnel(formData, "n_doss_4d");
    const nDossErp = texteOptionnel(formData, "n_doss_erp");
    if (!nDoss4d && !nDossErp) {
      retourner(retour, { erreur: "Ecris le dossier (Doss. 4D ou Doss. ERP) du conteneur." });
    }

    const { valides, invalides, chiffreControleFaux } = lireNumerosConteneurs(String(formData.get("numeros") ?? ""));
    if (invalides.length > 0) {
      retourner(retour, {
        erreur: `Numero de conteneur invalide : ${invalides.join(", ")} - il faut 4 lettres puis 7 chiffres (exemple MSCU1234567).`,
      });
    }
    if (valides.length === 0) {
      retourner(retour, { erreur: "Ecris au moins un numero de conteneur (4 lettres puis 7 chiffres, exemple MSCU1234567)." });
    }
    const numeroBl = normaliserNumeroDocument(String(formData.get("numero_bl") ?? "")) || null;

    let requete = supabaseServer.from("suivi_conteneurs_import").select(COLONNES_SUIVI);
    requete = nDoss4d ? requete.eq("n_doss_4d", nDoss4d) : requete.is("n_doss_4d", null);
    requete = nDossErp ? requete.eq("n_doss_erp", nDossErp) : requete.is("n_doss_erp", null);
    const { data: existants, error: erreurLecture } = await requete;
    if (erreurLecture) {
      retourner(retour, {
        erreur: "Le suivi des conteneurs n'est pas encore active : lance le SQL create_suivi_conteneurs_import.sql dans Supabase (SQL Editor).",
      });
    }

    const lignesExistantes = (existants ?? []) as LigneSuivi[];
    const nouveaux: string[] = [];
    for (const numero of valides) {
      const existante = lignesExistantes.find((ligne) => ligne.numero_conteneur === numero);
      if (existante) {
        // Meme conteneur retape : on met a jour le BL s'il est donne maintenant, et on remet le suivi a zero pour relancer la recherche
        if (numeroBl && numeroBl !== existante.numero_bl) {
          await supabaseServer
            .from("suivi_conteneurs_import")
            .update({ numero_bl: numeroBl, demande_id: null, expedition_id: null, etat: null, message: null, derniere_maj: null })
            .eq("id", existante.id);
        }
        continue;
      }
      const { error } = await supabaseServer.from("suivi_conteneurs_import").insert({
        n_doss_4d: nDoss4d,
        n_doss_erp: nDossErp,
        numero_conteneur: numero,
        numero_bl: numeroBl,
        cree_par: utilisateur,
      });
      if (error) retourner(retour, { erreur: error.message });
      nouveaux.push(numero);
    }

    // Premiere interrogation du service tout de suite (demande de suivi + premiere recherche), pour les conteneurs ajoutes ou
    // dont le BL vient de changer.
    if (suiviConfigure()) {
      const { data: aLancer } = await supabaseServer
        .from("suivi_conteneurs_import")
        .select(COLONNES_SUIVI)
        .in("numero_conteneur", valides)
        .is("derniere_maj", null);
      const lignes = ((aLancer ?? []) as LigneSuivi[]).filter(
        (ligne) => (ligne.n_doss_4d ?? null) === nDoss4d && (ligne.n_doss_erp ?? null) === nDossErp
      );
      await Promise.all(lignes.map((ligne) => actualiserLigneSuivi(ligne)));
    }

    if (nouveaux.length > 0) {
      await logAudit({
        utilisateur,
        module: "SuiviConteneurs",
        action: "creation",
        cible: nDoss4d || nDossErp,
        resume: `Conteneur(s) ${nouveaux.join(", ")} ajoute(s) au dossier ${nDoss4d || nDossErp}${numeroBl ? ` (BL ${numeroBl})` : ""}`,
      });
    }

    revalider();
    const avertissement = chiffreControleFaux.length
      ? `Le chiffre de controle de ${chiffreControleFaux.join(", ")} ne correspond pas : verifie le numero (faute de frappe possible).`
      : undefined;
    const message = suiviConfigure()
      ? nouveaux.length > 0
        ? `${nouveaux.length} conteneur(s) ajoute(s) : le suivi est lance (le resultat peut prendre quelques minutes).`
        : "Conteneur(s) deja enregistre(s) pour ce dossier."
      : "Conteneur(s) enregistre(s). Le suivi automatique demarrera quand la cle du service sera ajoutee (TERMINAL49_API_KEY).";
    retourner(retour, { ok: message, avertissement });
  } catch (erreur) {
    if (erreur && typeof erreur === "object" && "digest" in erreur && String(erreur.digest).startsWith("NEXT_REDIRECT")) {
      throw erreur;
    }
    retourner(retour, { erreur: erreur instanceof Error ? erreur.message : "Erreur pendant l'enregistrement du conteneur." });
  }
}

export async function supprimerConteneurSuiviAction(formData: FormData) {
  const retour = lireRetour(formData);
  try {
    const utilisateur = await getCurrentStockUser();
    if (!(await canWritePageUser(utilisateur, "commandeMp"))) {
      retourner(retour, { erreur: "Cet utilisateur ne peut pas modifier les imports." });
    }

    const id = Number(String(formData.get("id") ?? "0"));
    if (!Number.isInteger(id) || id <= 0) retourner(retour, { erreur: "Conteneur invalide." });

    const { data } = await supabaseServer
      .from("suivi_conteneurs_import")
      .select("numero_conteneur, n_doss_4d, n_doss_erp")
      .eq("id", id)
      .maybeSingle();
    const ligne = data as { numero_conteneur: string; n_doss_4d: string | null; n_doss_erp: string | null } | null;
    if (!ligne) retourner(retour, { erreur: "Ce conteneur n'existe plus." });

    const { error } = await supabaseServer.from("suivi_conteneurs_import").delete().eq("id", id);
    if (error) retourner(retour, { erreur: error.message });

    await logAudit({
      utilisateur,
      module: "SuiviConteneurs",
      action: "suppression",
      cible: ligne.numero_conteneur,
      resume: `Conteneur ${ligne.numero_conteneur} retire du dossier ${ligne.n_doss_4d || ligne.n_doss_erp}`,
      avant: ligne,
    });

    revalider();
    retourner(retour, { ok: `Conteneur ${ligne.numero_conteneur} retire.` });
  } catch (erreur) {
    if (erreur && typeof erreur === "object" && "digest" in erreur && String(erreur.digest).startsWith("NEXT_REDIRECT")) {
      throw erreur;
    }
    retourner(retour, { erreur: erreur instanceof Error ? erreur.message : "Erreur pendant la suppression." });
  }
}

// Appelee par la page elle-meme (composant ActualisationAuto) : rafraichit les conteneurs affiches dont l'etat est trop ancien, ou
// tous (au plus une fois par minute chacun) quand "forcer" est vrai. Ne leve jamais d'erreur vers le navigateur.
export async function actualiserSuivisAction(ids: number[], forcer: boolean): Promise<{ interroges: number }> {
  try {
    const utilisateur = await getCurrentStockUser();
    const autorise =
      (await canViewPageUser(utilisateur, "commandeMp")) || (await canViewPageUser(utilisateur, CLE_PAGE_SUIVI_CONTENEURS));
    if (!autorise) return { interroges: 0 };

    const idsPropres = (Array.isArray(ids) ? ids : []).filter((id) => Number.isInteger(id) && id > 0).slice(0, 200);
    const interroges = await actualiserLignesSuivi({ ids: idsPropres, forcer });
    if (interroges > 0) revalider();
    return { interroges };
  } catch {
    return { interroges: 0 };
  }
}
