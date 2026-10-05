import { supabaseServer } from "@/lib/supabase-server";
import {
  calculerCartonsDuMois,
  calculerEauDuMois,
  familleSansEau,
  type CartonsDuMois,
  type EauDuMois,
} from "@/lib/cout-eau-fabrication";
import { normaliserConfig } from "@/lib/cout-eau";
import { debutMoisSuivant, premierDuMois, type SaisieConsoEau } from "@/lib/cout-eau-conso";

type LigneProgrammeDuMois = {
  id: number;
  produit: string | null;
  type_article: string | null;
  vrac_a_fabriquer: number | null;
  qt_carton: number | null;
  numero_lot: string | null;
  numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
};

// Quantites du PD d'une ligne de programme, comme le Dashboard : si la ligne est
// decoupee en plusieurs codes avec le detail de chaque code, on additionne le
// detail ; sinon on prend les quantites de la ligne (vrac en kg, cartons).
function quantitesDuPd(ligne: LigneProgrammeDuMois): { vrac: number; carton: number } {
  const codes = (ligne.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
  const detail = ligne.numero_lot_detail ?? [];
  if (codes.length > 1 && detail.length === codes.length) {
    return {
      vrac: detail.reduce((somme, d) => somme + Number(d.qt_vrac ?? 0), 0),
      carton: detail.reduce((somme, d) => somme + Number(d.qt_carton ?? 0), 0),
    };
  }
  return { vrac: Number(ligne.vrac_a_fabriquer ?? 0), carton: Number(ligne.qt_carton ?? 0) };
}

// Quantites des PD du mois choisi (celles du Dashboard : lignes de programme
// confirmees, comptees a la date du programme - PAS les quantites fabriquees) :
// vrac en kg -> eau utilisee = base avec eau x 60 %, et cartons. Les lignes
// terminees comptent aussi ; les lignes exclues des rapports ne comptent pas.
// Lecture seule.
export async function lireEauDuMois(
  annee: number,
  mois: number
): Promise<{ eau: EauDuMois | null; cartons: CartonsDuMois | null; erreur: string | null }> {
  const debut = premierDuMois(annee, mois);
  const fin = debutMoisSuivant(annee, mois);

  const lignes: LigneProgrammeDuMois[] = [];
  const taillePage = 1000;
  for (let depart = 0; ; depart += taillePage) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, produit, type_article, vrac_a_fabriquer, qt_carton, numero_lot, numero_lot_detail")
      .eq("exclu_rapports", false)
      .eq("confirme_production", true)
      .gte("date_jour", debut)
      .lt("date_jour", fin)
      .order("id", { ascending: true })
      .range(depart, depart + taillePage - 1);

    if (error) return { eau: null, cartons: null, erreur: error.message };
    const page = (data ?? []) as LigneProgrammeDuMois[];
    lignes.push(...page);
    if (page.length < taillePage) break;
  }

  const quantites = lignes.map((ligne) => ({
    ...quantitesDuPd(ligne),
    famille: familleSansEau(ligne.type_article, ligne.produit),
  }));

  return {
    eau: calculerEauDuMois(quantites.map((q) => ({ quantite: q.vrac, famille: q.famille }))),
    cartons: calculerCartonsDuMois(quantites.map((q) => ({ quantite: q.carton, famille: q.famille }))),
    erreur: null,
  };
}

export type ParametresLigneElectricite = {
  // null = pas encore saisi dans "Prix des consommables"
  debitLitresHeure: number | null;
  puissanceKw: number | null;
  prixKwh: number | null;
  // D'ou viennent les valeurs : ce mois, ou un mois precedent
  sourceDebit: string | null;
  sourcePuissance: string | null;
};

export type ParametresElectricite = {
  ligne1: ParametresLigneElectricite;
  ligne2: ParametresLigneElectricite;
};

// Debit de la machine (L/h) et consommation (kW) de CHAQUE ligne, saisis dans
// "Prix des consommables" : valeur du mois choisi, sinon celle du mois
// enregistre le plus recent AVANT (comme les prix). Rien n'est suppose : sans
// valeur saisie, l'electricite de la ligne n'est pas calculee.
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
      debitLitresHeure: debit?.valeur ?? null,
      puissanceKw: puissance?.valeur ?? null,
      prixKwh: trouver(ligne, "prixKwh")?.valeur ?? null,
      sourceDebit: debit?.source ?? null,
      sourcePuissance: puissance?.source ?? null,
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
