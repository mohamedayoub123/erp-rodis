import { supabaseServer } from "@/lib/supabase-server";
import {
  calculerCartonsDuMois,
  calculerElectriciteDuMois,
  calculerEauDuMois,
  coutDuLitre,
  coutElectriciteDuMois,
  familleSansEau,
  type CartonsDuMois,
  type EauDuMois,
} from "@/lib/cout-eau-fabrication";
import { libelleMois, normaliserConfig } from "@/lib/cout-eau";
import { lireLignesTestLabo } from "@/lib/test-labo-rapports";
import {
  debutMoisSuivant,
  premierDuMois,
  totauxAvecPrix,
  totauxDuMois,
  type LignePrixElement,
  type SaisieConsoEau,
} from "@/lib/cout-eau-conso";

// Quantites du mois : EXACTEMENT celles du Rapport Test labo (memes preparations,
// meme date - la date de prise d'echantillon -, memes quantites commandees PD
// par code, calculees par lib/test-labo-rapports.ts). Vrac en kg -> eau utilisee =
// base avec eau x 60 %, et cartons. Savon / huile / serum / talc sont comptes
// mais sans eau. Lecture seule.
export async function lireEauDuMois(
  annee: number,
  mois: number
): Promise<{ eau: EauDuMois | null; cartons: CartonsDuMois | null; erreur: string | null }> {
  try {
    const prefixeMois = `${annee}-${String(mois).padStart(2, "0")}`;
    const lignes = (await lireLignesTestLabo()).filter((ligne) => ligne.date.slice(0, 7) === prefixeMois);

    const quantites = lignes.map((ligne) => ({
      vrac: ligne.kgCommande,
      carton: ligne.cartonCommande,
      famille: familleSansEau(ligne.typeArticleLabel === "-" ? null : ligne.typeArticleLabel, ligne.produit),
    }));

    // Le nombre de preparations est celui du Rapport Test labo (toutes les
    // preparations du mois, meme celles sans quantite commandee).
    return {
      eau: { ...calculerEauDuMois(quantites.map((q) => ({ quantite: q.vrac, famille: q.famille }))), nombreEntrees: lignes.length },
      cartons: {
        ...calculerCartonsDuMois(quantites.map((q) => ({ quantite: q.carton, famille: q.famille }))),
        nombreEntrees: lignes.length,
      },
      erreur: null,
    };
  } catch (erreur) {
    return { eau: null, cartons: null, erreur: erreur instanceof Error ? erreur.message : "lecture impossible" };
  }
}

// Prix de chaque element (page "Prix des consommables") : ceux du mois choisi,
// sinon ceux du mois enregistre le plus recent AVANT (comme la page des prix).
export async function lirePrixDuMois(
  annee: number,
  mois: number
): Promise<{ lignes: LignePrixElement[]; source: string | null; erreur: string | null }> {
  const { data, error } = await supabaseServer
    .from("cout_eau_mois")
    .select("annee, mois, donnees")
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  const choisi = annee * 12 + mois;
  const retenu = ((data ?? []) as { annee: number; mois: number; donnees: unknown }[]).find(
    (m) => m.annee * 12 + m.mois <= choisi
  );
  if (!retenu) return { lignes: [], source: null, erreur: error ? error.message : null };

  const lignes = normaliserConfig(retenu.donnees).lignes.map((l) => ({
    cle: l.cle,
    libelle: l.libelle,
    prix: l.prix,
    precision: l.precision,
  }));
  const meme = retenu.annee === annee && retenu.mois === mois;
  return { lignes, source: meme ? "ce mois" : `repris de ${libelleMois(retenu.annee, retenu.mois)}`, erreur: null };
}

export type ParametresLigneElectricite = {
  // null = pas encore saisi dans "Prix des consommables"
  puissanceKw: number | null;
  prixKwh: number | null;
  // D'ou vient la consommation : ce mois, ou un mois precedent
  sourcePuissance: string | null;
};

export type ParametresElectricite = {
  ligne1: ParametresLigneElectricite;
  ligne2: ParametresLigneElectricite;
};

// Consommation (kW) de CHAQUE ligne, saisie dans "Prix des consommables" :
// valeur du mois choisi, sinon celle du mois enregistre le plus recent AVANT
// (comme les prix). Rien n'est suppose : sans valeur saisie, l'electricite de la
// ligne n'est pas calculee. Le debit de l'osmose est fixe (9000 L/h).
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

  const trouver = (ligne: "ligne1" | "ligne2", champ: "puissanceKw" | "prixKwh") => {
    for (const { m, electricite } of configs) {
      const valeur = electricite[ligne][champ];
      if (valeur !== null && (champ === "prixKwh" || valeur > 0)) {
        return { valeur, source: m.annee * 12 + m.mois === choisi ? "ce mois" : `repris de ${m.mois}/${m.annee}` };
      }
    }
    return null;
  };

  const parLigne = (ligne: "ligne1" | "ligne2"): ParametresLigneElectricite => {
    const puissance = trouver(ligne, "puissanceKw");
    return {
      puissanceKw: puissance?.valeur ?? null,
      prixKwh: trouver(ligne, "prixKwh")?.valeur ?? null,
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

export type CoutDuLitreDuMois = {
  eau: EauDuMois | null;
  cartons: CartonsDuMois | null;
  parametres: ParametresElectricite;
  litres: number | null;
  coutConsommables: number;
  // Nombre d'elements consommes saisis ce mois-la (0 = aucune consommation saisie)
  nombreConsommables: number;
  consommablesSansPrix: number;
  coutElectricite: number | null;
  // Vrai tant que l'electricite d'une ligne n'est pas calculable (kW ou prix du kWh a saisir)
  electriciteIncomplete: boolean;
  coutLitre: number | null;
  erreur: string | null;
};

// Cout d'UN litre d'eau du mois = (cout des consommables + cout de l'electricite)
// / litres d'eau du mois.
export async function lireCoutDuLitre(annee: number, mois: number): Promise<CoutDuLitreDuMois> {
  const [eauDuMois, electricite, lecture, prix] = await Promise.all([
    lireEauDuMois(annee, mois),
    lireParametresElectricite(annee, mois),
    lireSaisiesDuMois(annee, mois),
    lirePrixDuMois(annee, mois),
  ]);

  const totaux = totauxAvecPrix(totauxDuMois(lecture.saisies), prix.lignes);
  const coutConsommables = totaux.reduce((somme, t) => somme + (t.cout ?? 0), 0);
  const consommablesSansPrix = totaux.filter((t) => t.prix === null).length;

  const parametres = electricite.parametres;
  const electriciteDuMois = eauDuMois.eau
    ? calculerElectriciteDuMois(eauDuMois.eau.litres, parametres.ligne1, parametres.ligne2)
    : null;
  const coutElectricite = electriciteDuMois
    ? coutElectriciteDuMois(electriciteDuMois, parametres.ligne1.prixKwh, parametres.ligne2.prixKwh)
    : null;
  const electriciteIncomplete =
    !electriciteDuMois ||
    !electriciteDuMois.ligne1 ||
    !electriciteDuMois.ligne2 ||
    parametres.ligne1.prixKwh === null ||
    parametres.ligne2.prixKwh === null;
  const litres = eauDuMois.eau?.litres ?? null;

  return {
    eau: eauDuMois.eau,
    cartons: eauDuMois.cartons,
    parametres,
    litres,
    coutConsommables,
    nombreConsommables: totaux.length,
    consommablesSansPrix,
    coutElectricite,
    electriciteIncomplete,
    coutLitre: litres === null ? null : coutDuLitre(coutConsommables, coutElectricite, litres),
    erreur: eauDuMois.erreur ?? lecture.erreur,
  };
}
