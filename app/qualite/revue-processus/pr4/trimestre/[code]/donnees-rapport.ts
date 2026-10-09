import { cache } from "react";
import { trouverTrimestrePr4, type TrimestrePr4 } from "@/lib/trimestres-pr4";
import { lireIndicateursAnnee, type TrimestreIndicateurs } from "./indicateurs-trimestre";
import { dernierMoisAffiche, lireKpiArretProduction, lireKpiCoutCarton } from "./kpi-donnees";

// Chiffres du rapport d'un trimestre (page, cartes de resume, PowerPoint) : calcules en direct depuis l'ERP, une seule
// fois par requete (les cartes, les diapositives et le PowerPoint partagent le meme calcul).

export type DonneesRapport = {
  indicateurs: TrimestreIndicateurs[];
  arretProduction: Awaited<ReturnType<typeof lireKpiArretProduction>>;
  coutCarton: Awaited<ReturnType<typeof lireKpiCoutCarton>>;
};

// Une partie qui n'a pas pu etre calculee vaut null (la diapositive correspondante affiche "indisponible")
export type DonneesRapportPartielles = { [K in keyof DonneesRapport]: DonneesRapport[K] | null };

export type RapportCharge = {
  donnees: DonneesRapportPartielles;
  // moment du calcul
  calculeLe: string;
};

async function essayer<T>(calcul: () => Promise<T>): Promise<T | null> {
  try {
    return await calcul();
  } catch {
    return null;
  }
}

async function calculerDonnees(trimestre: TrimestrePr4): Promise<DonneesRapportPartielles> {
  const dernierMois = dernierMoisAffiche(trimestre.annee, trimestre.trimestre);
  const [indicateurs, arretProduction, coutCarton] = await Promise.all([
    essayer(() => lireIndicateursAnnee(trimestre.annee)),
    essayer(() => lireKpiArretProduction(dernierMois)),
    essayer(() => lireKpiCoutCarton(trimestre.annee, dernierMois)),
  ]);
  return { indicateurs, arretProduction, coutCarton };
}

export const chargerRapport = cache(async (code: string): Promise<RapportCharge> => {
  const trimestre = trouverTrimestrePr4(code);
  if (!trimestre) throw new Error(`Trimestre inconnu : ${code}`);
  return { donnees: await calculerDonnees(trimestre), calculeLe: new Date().toISOString() };
});

// Rapport complet (aucune partie manquante), pour le PowerPoint
export async function chargerRapportComplet(trimestre: TrimestrePr4): Promise<DonneesRapport> {
  const { indicateurs, arretProduction, coutCarton } = (await chargerRapport(trimestre.code)).donnees;
  if (!indicateurs || !arretProduction || !coutCarton) {
    throw new Error("Les chiffres du rapport n'ont pas pu etre calcules : reessayez dans un instant.");
  }
  return { indicateurs, arretProduction, coutCarton };
}
