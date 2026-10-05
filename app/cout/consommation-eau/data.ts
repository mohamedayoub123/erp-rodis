import { supabaseServer } from "@/lib/supabase-server";
import {
  DEBIT_MACHINE_PAR_DEFAUT,
  PUISSANCE_LIGNE_PAR_DEFAUT_KW,
  calculerEauDuMois,
  familleSansEau,
  type EauDuMois,
} from "@/lib/cout-eau-fabrication";
import { normaliserConfig } from "@/lib/cout-eau";
import { debutMoisSuivant, premierDuMois, type SaisieConsoEau } from "@/lib/cout-eau-conso";

type EntreeVrac = { id: number; programme_ligne_id: number; quantite: number | null };
type LigneProgramme = {
  id: number;
  produit: string | null;
  type_article: string | null;
  exclu_rapports: boolean | null;
};

// Vrac fabrique (kg) dans le mois choisi, d'apres la date du jour de chaque
// entree de fabrication, puis eau utilisee = base avec eau x 60 %. Les lignes
// exclues des rapports ne comptent pas (comme dans les autres rapports de
// production). Lecture seule.
export async function lireEauDuMois(
  annee: number,
  mois: number
): Promise<{ eau: EauDuMois | null; erreur: string | null }> {
  const debut = premierDuMois(annee, mois);
  const fin = debutMoisSuivant(annee, mois);

  const entrees: EntreeVrac[] = [];
  const taillePage = 1000;
  for (let depart = 0; ; depart += taillePage) {
    const { data, error } = await supabaseServer
      .from("production_vrac_entries")
      .select("id, programme_ligne_id, quantite")
      .gte("date_jour", debut)
      .lt("date_jour", fin)
      .order("id", { ascending: true })
      .range(depart, depart + taillePage - 1);

    if (error) return { eau: null, erreur: error.message };
    const page = (data ?? []) as EntreeVrac[];
    entrees.push(...page);
    if (page.length < taillePage) break;
  }

  const idsLignes = [...new Set(entrees.map((e) => e.programme_ligne_id))];
  const lignes = new Map<number, LigneProgramme>();
  const tailleLot = 200;
  for (let i = 0; i < idsLignes.length; i += tailleLot) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, produit, type_article, exclu_rapports")
      .in("id", idsLignes.slice(i, i + tailleLot));

    if (error) return { eau: null, erreur: error.message };
    for (const ligne of (data ?? []) as LigneProgramme[]) lignes.set(ligne.id, ligne);
  }

  const aCompter = entrees.flatMap((entree) => {
    const ligne = lignes.get(entree.programme_ligne_id);
    if (!ligne || ligne.exclu_rapports) return [];
    return [
      {
        quantite: Number(entree.quantite ?? 0),
        famille: familleSansEau(ligne.type_article, ligne.produit),
      },
    ];
  });

  return { eau: calculerEauDuMois(aCompter), erreur: null };
}

export type ParametresLigneElectricite = {
  debitLitresHeure: number;
  puissanceKw: number;
  prixKwh: number | null;
  // D'ou viennent les valeurs : ce mois, un mois precedent, ou les valeurs par
  // defaut (rien de saisi nulle part)
  sourceDebit: string;
  sourcePuissance: string;
};

export type ParametresElectricite = {
  ligne1: ParametresLigneElectricite;
  ligne2: ParametresLigneElectricite;
};

// Debit de la machine (L/h) et consommation (kW) de CHAQUE ligne, saisis dans
// "Prix des consommables" : valeur du mois choisi, sinon celle du mois
// enregistre le plus recent AVANT (comme les prix), sinon valeurs par defaut.
export async function lireParametresElectricite(
  annee: number,
  mois: number
): Promise<{ parametres: ParametresElectricite; erreur: string | null }> {
  const { data, error } = await supabaseServer
    .from("cout_eau_mois")
    .select("annee, mois, donnees")
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  const choisi = annee * 12 + mois;
  const mesMois = ((data ?? []) as { annee: number; mois: number; donnees: unknown }[]).filter(
    (m) => m.annee * 12 + m.mois <= choisi
  );

  const configs = mesMois.map((m) => ({ m, electricite: normaliserConfig(m.donnees).electricite }));

  const trouver = (ligne: "ligne1" | "ligne2", champ: "debitLitresHeure" | "puissanceKw" | "prixKwh") => {
    for (const { m, electricite } of configs) {
      const valeur = electricite[ligne][champ];
      if (valeur !== null && (champ === "prixKwh" || valeur > 0)) {
        return { valeur, source: m.annee * 12 + m.mois === choisi ? "ce mois" : `repris de ${m.mois}/${m.annee}` };
      }
    }
    return null;
  };

  const parLigne = (ligne: "ligne1" | "ligne2"): ParametresLigneElectricite => {
    const debit = trouver(ligne, "debitLitresHeure");
    const puissance = trouver(ligne, "puissanceKw");
    return {
      debitLitresHeure: debit?.valeur ?? DEBIT_MACHINE_PAR_DEFAUT,
      puissanceKw: puissance?.valeur ?? PUISSANCE_LIGNE_PAR_DEFAUT_KW,
      prixKwh: trouver(ligne, "prixKwh")?.valeur ?? null,
      sourceDebit: debit?.source ?? "valeur par defaut",
      sourcePuissance: puissance?.source ?? "valeur par defaut",
    };
  };

  return {
    parametres: { ligne1: parLigne("ligne1"), ligne2: parLigne("ligne2") },
    erreur: error ? error.message : null,
  };
}

type SaisieEnBase = {
  id: number;
  date_jour: string;
  cle: string;
  libelle: string;
  ligne1: number | null;
  ligne2: number | null;
  unite: string | null;
  created_by: string | null;
  updated_by: string | null;
};

// Saisies datees du mois choisi, de la plus ancienne a la plus recente.
export async function lireSaisiesDuMois(
  annee: number,
  mois: number
): Promise<{ saisies: SaisieConsoEau[]; erreur: string | null }> {
  const { data, error } = await supabaseServer
    .from("cout_eau_conso_saisies")
    .select("id, date_jour, cle, libelle, ligne1, ligne2, unite, created_by, updated_by")
    .gte("date_jour", premierDuMois(annee, mois))
    .lt("date_jour", debutMoisSuivant(annee, mois))
    .order("date_jour", { ascending: true })
    .order("id", { ascending: true })
    .limit(1000);

  if (error) return { saisies: [], erreur: error.message };

  return {
    saisies: ((data ?? []) as SaisieEnBase[]).map((r) => ({
      id: r.id,
      date: r.date_jour,
      cle: r.cle,
      libelle: r.libelle,
      ligne1: r.ligne1 === null ? null : Number(r.ligne1),
      ligne2: r.ligne2 === null ? null : Number(r.ligne2),
      unite: r.unite ?? "",
      par: r.updated_by ?? r.created_by,
    })),
    erreur: null,
  };
}

export type MoisAvecSaisies = {
  annee: number;
  mois: number;
  nombre: number;
  par: string | null;
  derniereSaisie: string | null;
};

// Mois qui ont au moins une saisie (le plus recent d'abord), avec le nombre de
// saisies et la derniere modification.
export async function lireMoisAvecSaisies(): Promise<MoisAvecSaisies[]> {
  const parMois = new Map<string, MoisAvecSaisies>();
  const taillePage = 1000;

  for (let depart = 0; ; depart += taillePage) {
    const { data, error } = await supabaseServer
      .from("cout_eau_conso_saisies")
      .select("id, date_jour, updated_by, updated_at")
      .order("id", { ascending: true })
      .range(depart, depart + taillePage - 1);

    if (error) break;
    const page = (data ?? []) as { id: number; date_jour: string; updated_by: string | null; updated_at: string | null }[];

    for (const r of page) {
      const annee = Number(r.date_jour.slice(0, 4));
      const mois = Number(r.date_jour.slice(5, 7));
      const cle = `${annee}-${mois}`;
      const existant = parMois.get(cle) ?? { annee, mois, nombre: 0, par: null, derniereSaisie: null };
      existant.nombre += 1;
      if (r.updated_at && (!existant.derniereSaisie || r.updated_at > existant.derniereSaisie)) {
        existant.derniereSaisie = r.updated_at;
        existant.par = r.updated_by;
      }
      parMois.set(cle, existant);
    }

    if (page.length < taillePage) break;
  }

  return [...parMois.values()].sort((a, b) => b.annee * 12 + b.mois - (a.annee * 12 + a.mois));
}
