import { supabaseServer } from "@/lib/supabase-server";
import { categorieStatut } from "@/app/qualite/statut-couleur";

// Analyse des NC et des TAF du processus PR4 pour l'annee du trimestre ouvert : combien il y en a et combien sont
// terminees, au total et par audit (A1, A2...). Les chiffres viennent de Qualite > NC et TAF (donnees confidentielles :
// la diapositive ne montre que des nombres, jamais le contenu d'une fiche).
//
// Terminee = Statut cloture "CLOTUREE" pour une NC (Correction ET AC realisees), Statut "CLOTUREE" pour un TAF.
// NC et TAF restent toujours comptes separement : jamais un total ni un pourcentage "NC + TAF".

export type Compte = {
  total: number;
  terminees: number;
  enCours: number;
  // en attente / pas d'action / non realisee (rouge dans les tableaux)
  enAttente: number;
};

export type CompteNc = Compte & {
  correctionRealisees: number;
  acRealisees: number;
};

export type LigneAudit = { audit: string; nc: CompteNc; taf: Compte };

export type SuiviNcTaf = {
  annee: number;
  nc: CompteNc;
  taf: Compte;
  parAudit: LigneAudit[];
  // Des NC "Correction et AC realisees" mais dont le Statut cloture n'est pas CLOTUREE (restent comptees en cours)
  ncAcheveesNonCloturees: number;
};

type NcLigne = {
  numero: string | null;
  audit: string | null;
  processus_concerne: string | null;
  statut_correction: string | null;
  statut_ac: string | null;
  statut_cloture: string | null;
};

type TafLigne = {
  numero: string | null;
  audit: string | null;
  processus_concerne: string | null;
  statut: string | null;
};

async function toutLire<T>(table: string, colonnes: string): Promise<T[]> {
  const lignes: T[] = [];
  const taillePage = 1000;
  for (let debut = 0; ; debut += taillePage) {
    const { data, error } = await supabaseServer.from(table).select(colonnes).range(debut, debut + taillePage - 1);
    if (error) throw new Error(`Lecture de ${table} impossible : ${error.message}`);
    const lot = (data ?? []) as T[];
    lignes.push(...lot);
    if (lot.length < taillePage) break;
  }
  return lignes;
}

// "AI-1-2026-NC-033" -> 2026
function anneeDuNumero(numero: string | null): number | null {
  const m = String(numero ?? "").match(/-(\d{4})-/);
  return m ? Number(m[1]) : null;
}

// Meme lecture que le Rapport NC & TAF : le chiffre en tete de la colonne Audit, sinon le numero d'audit lu dans le
// numero de la ligne ("AI-2-2026-NC-016" -> A2) ; un report sur l'annee suivante a son propre libelle.
function libelleAudit(audit: string | null, numero: string | null): string {
  const brut = String(audit ?? "").trim();
  const majuscules = brut.toUpperCase();
  if (majuscules.includes("NOUVELLE NC OUVERTE") || majuscules.includes("REPORT ")) return "Reportée N+1";
  const chiffre = brut.match(/^(\d+)/);
  if (chiffre) return `A${chiffre[1]}`;
  const parNumero = String(numero ?? "").match(/^AI[-.](\d+)[-.]\d{4}/i);
  return parNumero ? `A${parNumero[1]}` : "Non classé";
}

function rangAudit(audit: string): number {
  const m = audit.match(/^A(\d+)$/);
  return m ? Number(m[1]) : 1000 + (audit === "Reportée N+1" ? 0 : 1);
}

// Seul ce processus est compte (jamais les autres processus, meme s'ils commencent aussi par "PR4") : comparaison sur
// le libelle complet, sans tenir compte des majuscules, des accents ni des espaces en trop.
export const PROCESSUS_PR4 = "PR4 Gérer la fabrication des produits cosmétique, le stockage et l'expédition des PF";

function normaliserProcessus(valeur: string | null): string {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const estPr4 = (processus: string | null) => normaliserProcessus(processus) === normaliserProcessus(PROCESSUS_PR4);

// L'utilisateur a-t-il le droit de voir les NC / TAF du processus PR4 ?
export const peutVoirNcTafPr4 = (processusAutorises: string[] | "all") =>
  processusAutorises === "all" || processusAutorises.some((processus) => estPr4(processus));

function compteVide(): Compte {
  return { total: 0, terminees: 0, enCours: 0, enAttente: 0 };
}

function compteNcVide(): CompteNc {
  return { ...compteVide(), correctionRealisees: 0, acRealisees: 0 };
}

function ajouter(compte: Compte, statut: string | null) {
  compte.total += 1;
  const categorie = categorieStatut(statut);
  if (categorie === "fait") compte.terminees += 1;
  else if (categorie === "rouge") compte.enAttente += 1;
  // en cours, vide ou valeur libre : pas encore terminee
  else compte.enCours += 1;
}

// processusAutorises : les processus que l'utilisateur a le droit de voir dans NC / TAF ("all" = tous, voir
// getNcTafProcessusAutorisesUser) - meme regle que les pages NC et TAF.
export async function lireSuiviNcTafPr4(annee: number, processusAutorises: string[] | "all"): Promise<SuiviNcTaf> {
  const [ncLues, tafLues] = await Promise.all([
    toutLire<NcLigne>("qualite_nc_confidentiel", "numero, audit, processus_concerne, statut_correction, statut_ac, statut_cloture"),
    toutLire<TafLigne>("qualite_taf_confidentiel", "numero, audit, processus_concerne, statut"),
  ]);

  const visible = (processus: string | null) =>
    processusAutorises === "all" || processusAutorises.includes(String(processus ?? "").trim());
  const retenue = (ligne: { numero: string | null; processus_concerne: string | null }) =>
    estPr4(ligne.processus_concerne) && visible(ligne.processus_concerne) && anneeDuNumero(ligne.numero) === annee;

  const nc = compteNcVide();
  const taf = compteVide();
  const parAudit = new Map<string, LigneAudit>();
  const ligneAudit = (audit: string) => {
    let ligne = parAudit.get(audit);
    if (!ligne) {
      ligne = { audit, nc: compteNcVide(), taf: compteVide() };
      parAudit.set(audit, ligne);
    }
    return ligne;
  };

  let ncAcheveesNonCloturees = 0;
  for (const ligne of ncLues.filter(retenue)) {
    const audit = ligneAudit(libelleAudit(ligne.audit, ligne.numero));
    const correction = categorieStatut(ligne.statut_correction) === "fait";
    const ac = categorieStatut(ligne.statut_ac) === "fait";
    for (const cible of [nc, audit.nc]) {
      ajouter(cible, ligne.statut_cloture);
      if (correction) cible.correctionRealisees += 1;
      if (ac) cible.acRealisees += 1;
    }
    if (correction && ac && categorieStatut(ligne.statut_cloture) !== "fait") ncAcheveesNonCloturees += 1;
  }

  for (const ligne of tafLues.filter(retenue)) {
    const audit = ligneAudit(libelleAudit(ligne.audit, ligne.numero));
    ajouter(taf, ligne.statut);
    ajouter(audit.taf, ligne.statut);
  }

  return {
    annee,
    nc,
    taf,
    parAudit: [...parAudit.values()].sort((a, b) => rangAudit(a.audit) - rangAudit(b.audit)),
    ncAcheveesNonCloturees,
  };
}
