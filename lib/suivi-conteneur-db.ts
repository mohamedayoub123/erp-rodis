// Base du Suivi conteneurs (table suivi_conteneurs_import, voir scripts/sql/create_suivi_conteneurs_import.sql) : lecture des lignes
// et rafraichissement de leur etat aupres du service de suivi (lib/suivi-conteneur.ts).
import { supabaseServer } from "@/lib/supabase-server";
import {
  chercherExpedition,
  creerDemandeSuivi,
  lireEchecDemande,
  PREFIXE_MESSAGE_PLAN,
  suiviConfigure,
  type EtatSuivi,
} from "@/lib/suivi-conteneur";

export type LigneSuivi = {
  id: number;
  n_doss_4d: string | null;
  n_doss_erp: string | null;
  numero_conteneur: string;
  numero_bl: string | null;
  demande_id: string | null;
  expedition_id: string | null;
  etat: EtatSuivi | null;
  message: string | null;
  derniere_maj: string | null;
  created_at: string;
};

export const COLONNES_SUIVI =
  "id, n_doss_4d, n_doss_erp, numero_conteneur, numero_bl, demande_id, expedition_id, etat, message, derniere_maj, created_at";

// Toutes les lignes de suivi. La table peut ne pas exister encore (SQL pas lance) : on renvoie alors une liste vide et
// tableDisponible = false, sans jamais casser la page Import.
export async function lireLignesSuivi(): Promise<{ lignes: LigneSuivi[]; tableDisponible: boolean }> {
  const { data, error } = await supabaseServer
    .from("suivi_conteneurs_import")
    .select(COLONNES_SUIVI)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return { lignes: [], tableDisponible: false };
  return { lignes: (data ?? []) as LigneSuivi[], tableDisponible: true };
}

export function cleDossier(nDoss4d: string | null, nDossErp: string | null): string {
  return `${nDoss4d ?? ""}|||${nDossErp ?? ""}`;
}

const HEURE_MS = 3_600_000;
const DELAI_RECHERCHE_MS = 2 * 60_000;
const DELAI_ACTUALISATION_MS = 3 * HEURE_MS;
const DELAI_FORCE_MINIMUM_MS = 60_000;
const JOURS_AVANT_INTROUVABLE_MS = 3 * 24 * HEURE_MS;
const MAX_LIGNES_PAR_PASSAGE = 10;

// Faut-il interroger le service pour cette ligne ? Les conteneurs deja sortis du port ne bougent plus ; ceux qui n'ont pas encore
// d'expedition sont recherches toutes les 2 minutes (le service met quelques minutes a la creer), les autres toutes les 3 heures
// (quota). "forcer" (bouton Actualiser) ignore ces delais mais jamais plus d'une fois par minute pour une meme ligne.
export function doitActualiser(ligne: LigneSuivi, forcer: boolean, maintenant: Date = new Date()): boolean {
  if (!ligne.derniere_maj) return true;
  const age = maintenant.getTime() - new Date(ligne.derniere_maj).getTime();
  if (forcer) return age >= DELAI_FORCE_MINIMUM_MS;
  if (ligne.etat?.phase === "sorti_port") return false;
  // Plan gratuit : le refus ne change pas tant que l'abonnement ne change pas - on ne reinterroge que toutes les 6 heures
  if (!ligne.etat && ligne.message?.startsWith(PREFIXE_MESSAGE_PLAN)) return age >= 6 * HEURE_MS;
  return age >= (ligne.etat ? DELAI_ACTUALISATION_MS : DELAI_RECHERCHE_MS);
}

// Interroge le service pour UNE ligne et enregistre le resultat. Ne leve jamais d'erreur : un probleme est range dans "message".
export async function actualiserLigneSuivi(ligne: LigneSuivi): Promise<void> {
  if (!suiviConfigure()) return;

  const maj: Partial<Pick<LigneSuivi, "demande_id" | "expedition_id" | "etat" | "message" | "derniere_maj">> = {
    derniere_maj: new Date().toISOString(),
  };

  try {
    // Demande pas encore envoyee (par exemple la cle API a ete ajoutee apres la saisie du conteneur)
    if (!ligne.demande_id && !ligne.expedition_id) {
      const demande = await creerDemandeSuivi({
        numeroConteneur: ligne.numero_conteneur,
        numeroBl: ligne.numero_bl,
        reference: ligne.n_doss_erp || ligne.n_doss_4d,
      });
      if (!demande.ok) {
        maj.message = demande.message;
        await enregistrer(ligne.id, maj);
        return;
      }
      maj.demande_id = demande.demandeId ?? "existante";
    }

    const recherche = await chercherExpedition({ numeroConteneur: ligne.numero_conteneur, numeroBl: ligne.numero_bl });

    if (recherche.erreur) {
      maj.message = recherche.erreur;
    } else if (recherche.expeditionId && recherche.etat) {
      maj.expedition_id = recherche.expeditionId;
      maj.etat = recherche.etat;
      maj.message = null;
    } else {
      // Pas encore d'expedition : la compagnie n'a pas encore renvoye ce numero. Au bout de 3 jours on cherche la raison.
      const age = Date.now() - new Date(ligne.created_at).getTime();
      const demandeId = maj.demande_id ?? ligne.demande_id;
      const echec =
        demandeId && demandeId !== "existante" && age >= DELAI_RECHERCHE_MS * 2 ? await lireEchecDemande(demandeId) : null;
      maj.message =
        echec ??
        (age >= JOURS_AVANT_INTROUVABLE_MS
          ? "Introuvable depuis plus de 3 jours : verifie le numero ou ajoute le numero BL / booking."
          : "Recherche en cours : la compagnie n'a pas encore renvoye ce conteneur (quelques minutes a quelques heures).");
    }
  } catch (erreur) {
    maj.message = erreur instanceof Error ? erreur.message : "Erreur pendant la mise a jour du suivi.";
  }

  await enregistrer(ligne.id, maj);
}

async function enregistrer(id: number, maj: Record<string, unknown>) {
  await supabaseServer.from("suivi_conteneurs_import").update(maj).eq("id", id);
}

// Rafraichit les lignes qui en ont besoin (au plus MAX_LIGNES_PAR_PASSAGE par passage, en parallele). "ids" limite aux lignes
// affichees ; sans "ids", toutes les lignes sont candidates. Renvoie le nombre de lignes interrogees.
export async function actualiserLignesSuivi(options: { ids?: number[]; forcer?: boolean } = {}): Promise<number> {
  if (!suiviConfigure()) return 0;

  const { lignes } = await lireLignesSuivi();
  const candidates = lignes
    .filter((ligne) => !options.ids || options.ids.includes(ligne.id))
    .filter((ligne) => doitActualiser(ligne, Boolean(options.forcer)))
    .slice(0, MAX_LIGNES_PAR_PASSAGE);

  await Promise.all(candidates.map((ligne) => actualiserLigneSuivi(ligne)));
  return candidates.length;
}
