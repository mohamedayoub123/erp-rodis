import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import { trouverTrimestrePr4, type TrimestrePr4 } from "@/lib/trimestres-pr4";
import { lireIndicateursAnnee, type TrimestreIndicateurs } from "./indicateurs-trimestre";
import { dernierMoisAffiche, lireKpiArretProduction, lireKpiCoutCarton } from "./kpi-donnees";

// Chiffres du rapport d'un trimestre (page, cartes de resume, PowerPoint) : une seule source, soit calculee en direct
// ("Brouillon"), soit la PHOTO prise quand le rapport a ete fige ("Valide", table pr4_revue_figee).

export type DonneesRapport = {
  indicateurs: TrimestreIndicateurs[];
  arretProduction: Awaited<ReturnType<typeof lireKpiArretProduction>>;
  coutCarton: Awaited<ReturnType<typeof lireKpiCoutCarton>>;
};

// Une partie qui n'a pas pu etre calculee vaut null (la diapositive correspondante affiche "indisponible")
export type DonneesRapportPartielles = { [K in keyof DonneesRapport]: DonneesRapport[K] | null };

export type EtatFige = { par: string | null; le: string };

export type RapportCharge = {
  donnees: DonneesRapportPartielles;
  fige: EtatFige | null;
  // moment du calcul (ou de la photo si le rapport est fige)
  calculeLe: string;
};

// ---------------------------------------------------------------- calcul en direct
async function essayer<T>(calcul: () => Promise<T>): Promise<T | null> {
  try {
    return await calcul();
  } catch {
    return null;
  }
}

export async function calculerDonneesEnDirect(trimestre: TrimestrePr4): Promise<DonneesRapportPartielles> {
  const dernierMois = dernierMoisAffiche(trimestre.annee, trimestre.trimestre);
  const [indicateurs, arretProduction, coutCarton] = await Promise.all([
    essayer(() => lireIndicateursAnnee(trimestre.annee)),
    essayer(() => lireKpiArretProduction(dernierMois)),
    essayer(() => lireKpiCoutCarton(trimestre.annee, dernierMois)),
  ]);
  return { indicateurs, arretProduction, coutCarton };
}

// ---------------------------------------------------------------- rapport fige
export type LectureFige = {
  // faux tant que le SQL create_pr4_revue_production_et_figee.sql n'a pas ete execute
  disponible: boolean;
  fige: (EtatFige & { donnees: DonneesRapport }) | null;
};

export const lireRapportFige = cache(async (code: string): Promise<LectureFige> => {
  const { data, error } = await supabaseServer
    .from("pr4_revue_figee")
    .select("donnees, fige_par, fige_le")
    .eq("code", code)
    .maybeSingle();
  if (error) return { disponible: false, fige: null };
  if (!data) return { disponible: true, fige: null };
  const ligne = data as { donnees: DonneesRapport; fige_par: string | null; fige_le: string };
  return { disponible: true, fige: { donnees: ligne.donnees, par: ligne.fige_par, le: ligne.fige_le } };
});

// Charge le rapport d'un trimestre : la photo si le rapport est fige, sinon le calcul en direct.
// Dedoublonne dans une meme requete (cartes de resume, diapositives et en-tete partagent le meme calcul).
export const chargerRapport = cache(async (code: string): Promise<RapportCharge> => {
  const trimestre = trouverTrimestrePr4(code);
  if (!trimestre) throw new Error(`Trimestre inconnu : ${code}`);
  const { fige } = await lireRapportFige(code);
  if (fige) return { donnees: fige.donnees, fige: { par: fige.par, le: fige.le }, calculeLe: fige.le };
  return { donnees: await calculerDonneesEnDirect(trimestre), fige: null, calculeLe: new Date().toISOString() };
});

// Rapport complet (aucune partie manquante), pour le PowerPoint
export async function chargerRapportComplet(trimestre: TrimestrePr4): Promise<DonneesRapport & { fige: EtatFige | null }> {
  const rapport = await chargerRapport(trimestre.code);
  const { indicateurs, arretProduction, coutCarton } = rapport.donnees;
  if (!indicateurs || !arretProduction || !coutCarton) {
    throw new Error("Les chiffres du rapport n'ont pas pu etre calcules : reessayez dans un instant.");
  }
  return { indicateurs, arretProduction, coutCarton, fige: rapport.fige };
}

export async function figerRapport(trimestre: TrimestrePr4, utilisateur: string | null): Promise<void> {
  if (trimestre.enCours) {
    throw new Error("Le trimestre n'est pas termine : il sera possible de figer le rapport a la fin du trimestre.");
  }
  const { disponible, fige } = await lireRapportFige(trimestre.code);
  if (!disponible) {
    throw new Error("La table des rapports figes n'existe pas encore : executez d'abord le SQL create_pr4_revue_production_et_figee.sql dans Supabase.");
  }
  if (fige) throw new Error("Ce rapport est deja fige.");

  // Photo toujours prise sur les chiffres en direct, jamais sur une partie manquante
  const donnees = await calculerDonneesEnDirect(trimestre);
  if (!donnees.indicateurs || !donnees.arretProduction || !donnees.coutCarton) {
    throw new Error("Impossible de figer : certains chiffres n'ont pas pu etre calcules. Reessayez dans un instant.");
  }
  const { error } = await supabaseServer.from("pr4_revue_figee").insert({
    code: trimestre.code,
    donnees,
    fige_par: utilisateur,
    fige_le: new Date().toISOString(),
  });
  if (error) throw new Error(`Impossible de figer le rapport : ${error.message}`);
}

export async function rouvrirRapport(trimestre: TrimestrePr4): Promise<void> {
  const { error } = await supabaseServer.from("pr4_revue_figee").delete().eq("code", trimestre.code);
  if (error) throw new Error(`Impossible de rouvrir le rapport : ${error.message}`);
}
