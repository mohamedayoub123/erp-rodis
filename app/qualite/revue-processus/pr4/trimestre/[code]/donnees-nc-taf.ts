import { supabaseServer } from "@/lib/supabase-server";

// NC et TAF du processus PR4 pour l'audit interne du trimestre (T1 -> AI-1, T2 -> AI-2...), comme la diapositive
// "TAF et NC" de la presentation : un tableau NC "NC AI-2-2026" et un tableau TAF "TAF AI-2-2026", une ligne par
// libelle de processus PR4, puis un total. Source : NC Confidentiel et TAF Confidentiel (meme base que le Rapport NC & TAF).

type NcBrute = {
  audit: string | null;
  numero: string | null;
  processus_concerne: string | null;
  statut_correction: string | null;
  statut_ac: string | null;
  statut_cloture: string | null;
  mesure_efficacite_ac: string | null;
};
type TafBrute = {
  audit: string | null;
  numero: string | null;
  processus_concerne: string | null;
  statut: string | null;
  tx_progression: string | null;
};

export type LigneNc = {
  processus: string;
  nc: number;
  partPourcent: number | null;
  correction: number;
  correctionPourcent: number | null;
  ac: number;
  acPourcent: number | null;
  acEfficace: number;
  acEfficacePourcent: number | null;
  cloturees: number;
  clotureesPourcent: number | null;
};

export type LigneTaf = {
  processus: string;
  taf: number;
  partPourcent: number | null;
  realisees: number;
  realiseesPourcent: number | null;
  // moyenne du taux de progression des TAF pas encore realisees (null = aucune TAF a suivre)
  progressionNonRealisees: number | null;
};

export type NcTafPr4 = {
  // "AI-2-2026"
  audit: string;
  nc: { lignes: LigneNc[]; total: LigneNc };
  taf: { lignes: LigneTaf[]; total: LigneTaf };
};

async function lireTout<T>(table: string, colonnes: string): Promise<T[]> {
  const lignes: T[] = [];
  const taille = 1000;
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await supabaseServer.from(table).select(colonnes).range(debut, debut + taille - 1);
    if (error) throw new Error(`Lecture de ${table} impossible : ${error.message}`);
    const paquet = (data ?? []) as T[];
    lignes.push(...paquet);
    if (paquet.length < taille) break;
  }
  return lignes;
}

// Audit et annee d'une ligne : le numero ("AI-2-2026-NC-033") les contient ; a defaut, le chiffre de tete de la colonne
// audit + l'annee du numero (meme lecture que le Rapport NC & TAF).
function auditDeLaLigne(numero: string | null, audit: string | null): { numeroAudit: number; annee: number } | null {
  const parNumero = String(numero ?? "").match(/^AI-(\d+)-(\d{4})/i);
  if (parNumero) return { numeroAudit: Number(parNumero[1]), annee: Number(parNumero[2]) };
  const annee = String(numero ?? "").match(/-(\d{4})-/);
  const chiffre = String(audit ?? "").trim().match(/^(\d+)/);
  if (annee && chiffre) return { numeroAudit: Number(chiffre[1]), annee: Number(annee[1]) };
  return null;
}

const estPr4 = (processus: string | null) => /^\s*PR4\b/i.test(String(processus ?? ""));
const majuscules = (valeur: string | null) => String(valeur ?? "").trim().toUpperCase();
const pourcent = (partie: number, total: number) => (total > 0 ? Math.round((partie / total) * 1000) / 10 : null);

function ligneNc(processus: string, lignes: NcBrute[], totalNc: number): LigneNc {
  const nc = lignes.length;
  const correction = lignes.filter((l) => majuscules(l.statut_correction) === "REALISEE").length;
  const ac = lignes.filter((l) => majuscules(l.statut_ac) === "REALISEE").length;
  const acEfficace = lignes.filter((l) => majuscules(l.mesure_efficacite_ac).startsWith("EFFICACE")).length;
  const cloturees = lignes.filter((l) => majuscules(l.statut_cloture) === "CLOTUREE").length;
  return {
    processus,
    nc,
    partPourcent: pourcent(nc, totalNc),
    correction,
    correctionPourcent: pourcent(correction, nc),
    ac,
    acPourcent: pourcent(ac, nc),
    acEfficace,
    acEfficacePourcent: pourcent(acEfficace, nc),
    cloturees,
    clotureesPourcent: pourcent(cloturees, nc),
  };
}

function ligneTaf(processus: string, lignes: TafBrute[], totalTaf: number): LigneTaf {
  const taf = lignes.length;
  const realisees = lignes.filter((l) => majuscules(l.statut) === "CLOTUREE").length;
  const progressions = lignes
    .filter((l) => majuscules(l.statut) !== "CLOTUREE")
    .map((l) => parseFloat(String(l.tx_progression ?? "").replace(",", ".")))
    .map((valeur) => (Number.isFinite(valeur) ? valeur : 0));
  return {
    processus,
    taf,
    partPourcent: pourcent(taf, totalTaf),
    realisees,
    realiseesPourcent: pourcent(realisees, taf),
    progressionNonRealisees: progressions.length > 0 ? Math.round((progressions.reduce((a, b) => a + b, 0) / progressions.length) * 10) / 10 : null,
  };
}

function regrouper<T extends { processus_concerne: string | null }>(lignes: T[]): [string, T[]][] {
  const groupes = new Map<string, T[]>();
  for (const ligne of lignes) {
    const cle = String(ligne.processus_concerne ?? "").trim();
    groupes.set(cle, [...(groupes.get(cle) ?? []), ligne]);
  }
  // le libelle le plus court d'abord (PR4 seul avant la version "... le stockage et l'expedition des PF")
  return [...groupes.entries()].sort((a, b) => a[0].length - b[0].length);
}

export async function lireNcTafPr4(annee: number, trimestre: number): Promise<NcTafPr4> {
  const [toutesNc, toutesTaf] = await Promise.all([
    lireTout<NcBrute>(
      "qualite_nc_confidentiel",
      "audit, numero, processus_concerne, statut_correction, statut_ac, statut_cloture, mesure_efficacite_ac"
    ),
    lireTout<TafBrute>("qualite_taf_confidentiel", "audit, numero, processus_concerne, statut, tx_progression"),
  ]);

  const duTrimestre = <T extends { numero: string | null; audit: string | null; processus_concerne: string | null }>(lignes: T[]) =>
    lignes.filter((ligne) => {
      const audit = auditDeLaLigne(ligne.numero, ligne.audit);
      return estPr4(ligne.processus_concerne) && audit !== null && audit.annee === annee && audit.numeroAudit === trimestre;
    });

  const nc = duTrimestre(toutesNc);
  const taf = duTrimestre(toutesTaf);

  return {
    audit: `AI-${trimestre}-${annee}`,
    nc: {
      lignes: regrouper(nc).map(([processus, lignes]) => ligneNc(processus, lignes, nc.length)),
      total: ligneNc("", nc, nc.length),
    },
    taf: {
      lignes: regrouper(taf).map(([processus, lignes]) => ligneTaf(processus, lignes, taf.length)),
      total: ligneTaf("", taf, taf.length),
    },
  };
}
