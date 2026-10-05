import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import {
  calculerCartonsDuMois,
  calculerElectriciteDuMois,
  calculerEauDuMois,
  coutDuLitre,
  coutElectriciteDuMois,
  familleSansEau,
  POURCENTAGE_EAU,
  type CartonsDuMois,
  type EauDuMois,
} from "@/lib/cout-eau-fabrication";
import { libelleMois, normaliserConfig } from "@/lib/cout-eau";
import { lireLignesTestLabo } from "@/lib/test-labo-rapports";
import {
  ELEMENTS_AUTO_MP,
  debutMoisSuivant,
  premierDuMois,
  totauxAvecPrix,
  totauxDuMois,
  type ConsoAutoMp,
  type LignePrixElement,
  type SaisieConsoEau,
  type TotalElementAvecPrix,
} from "@/lib/cout-eau-conso";

// Mois de "Prix des consommables" (le plus recent d'abord), lus une seule fois par
// requete : prix, electricite et pourcentage d'eau viennent tous de cette table.
const chargerMoisPrix = cache(async () =>
  supabaseServer
    .from("cout_eau_mois")
    .select("annee, mois, donnees")
    .order("annee", { ascending: false })
    .order("mois", { ascending: false })
);

// Pourcentage d'eau du mois choisi (saisi dans "Prix des consommables") : celui du
// mois, sinon celui du mois enregistre le plus recent AVANT, sinon 60 %.
export async function lirePourcentageEau(
  annee: number,
  mois: number
): Promise<{ pourcentage: number; source: string }> {
  const { data } = await chargerMoisPrix();
  const choisi = annee * 12 + mois;
  for (const m of (data ?? []) as { annee: number; mois: number; donnees: unknown }[]) {
    if (m.annee * 12 + m.mois > choisi) continue;
    const valeur = normaliserConfig(m.donnees).pourcentageEau;
    if (valeur !== null) {
      return {
        pourcentage: valeur,
        source: m.annee === annee && m.mois === mois ? "ce mois" : `repris de ${libelleMois(m.annee, m.mois)}`,
      };
    }
  }
  return { pourcentage: POURCENTAGE_EAU, source: "valeur par defaut" };
}

// Quantites du mois : EXACTEMENT celles du Rapport Test labo (memes preparations,
// meme date - la date de prise d'echantillon -, memes quantites commandees PD
// par code, calculees par lib/test-labo-rapports.ts). Vrac en kg -> eau utilisee =
// base avec eau x 60 %, et cartons. Savon / huile / serum / talc sont comptes
// mais sans eau. Lecture seule.
export async function lireEauDuMois(
  annee: number,
  mois: number
): Promise<{
  eau: EauDuMois | null;
  cartons: CartonsDuMois | null;
  pourcentageSource: string | null;
  erreur: string | null;
}> {
  try {
    const { pourcentage, source: pourcentageSource } = await lirePourcentageEau(annee, mois);
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
      eau: {
        ...calculerEauDuMois(
          quantites.map((q) => ({ quantite: q.vrac, famille: q.famille })),
          pourcentage
        ),
        nombreEntrees: lignes.length,
      },
      cartons: {
        ...calculerCartonsDuMois(quantites.map((q) => ({ quantite: q.carton, famille: q.famille }))),
        nombreEntrees: lignes.length,
      },
      pourcentageSource,
      erreur: null,
    };
  } catch (erreur) {
    return { eau: null, cartons: null, pourcentageSource: null, erreur: erreur instanceof Error ? erreur.message : "lecture impossible" };
  }
}

// Prix de chaque element (page "Prix des consommables") : ceux du mois choisi,
// sinon ceux du mois enregistre le plus recent AVANT (comme la page des prix).
export async function lirePrixDuMois(
  annee: number,
  mois: number
): Promise<{ lignes: LignePrixElement[]; source: string | null; erreur: string | null }> {
  const { data, error } = await chargerMoisPrix();

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
  const { data, error } = await chargerMoisPrix();

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

// Consommation automatique du mois (Sel, Produit chlore) : somme des sorties de leur article
// dans les mouvements MP (tous depots, comme le Rapport mouvements MP).
export async function lireConsoAutoMp(
  annee: number,
  mois: number
): Promise<{ elements: ConsoAutoMp[]; erreur: string | null }> {
  const noms = ELEMENTS_AUTO_MP.map((e) => e.articleMp);
  const articles = await supabaseServer
    .from("articles_matiere_premiere")
    .select("id, nom_article, unite")
    .in("nom_article", noms);
  if (articles.error) return { elements: [], erreur: articles.error.message };

  const parNom = new Map(
    ((articles.data ?? []) as { id: number; nom_article: string; unite: string | null }[]).map((a) => [a.nom_article, a])
  );
  const ids = [...parNom.values()].map((a) => a.id);

  const sorties = new Map<number, { quantite: number; nombre: number }>();
  if (ids.length > 0) {
    const taillePage = 1000;
    for (let depart = 0; ; depart += taillePage) {
      const { data, error } = await supabaseServer
        .from("lots_stock_matiere_premiere")
        .select("id, article_id, qte_sortie")
        .in("article_id", ids)
        .gt("qte_sortie", 0)
        .gte("date_jour", premierDuMois(annee, mois))
        .lt("date_jour", debutMoisSuivant(annee, mois))
        .order("id", { ascending: true })
        .range(depart, depart + taillePage - 1);
      if (error) return { elements: [], erreur: error.message };
      const page = (data ?? []) as { id: number; article_id: number; qte_sortie: number | null }[];
      for (const m of page) {
        const cumul = sorties.get(m.article_id) ?? { quantite: 0, nombre: 0 };
        cumul.quantite += Number(m.qte_sortie ?? 0);
        cumul.nombre += 1;
        sorties.set(m.article_id, cumul);
      }
      if (page.length < taillePage) break;
    }
  }

  const manquants = ELEMENTS_AUTO_MP.filter((e) => !parNom.has(e.articleMp)).map((e) => e.articleMp);
  return {
    elements: ELEMENTS_AUTO_MP.map((e) => {
      const article = parNom.get(e.articleMp);
      const cumul = article ? sorties.get(article.id) : undefined;
      return {
        cle: e.cle,
        libelle: e.libelle,
        unite: article?.unite || e.unite,
        quantite: cumul?.quantite ?? 0,
        nombre: cumul?.nombre ?? 0,
        articleMp: e.articleMp,
      };
    }),
    erreur: manquants.length > 0 ? `Article MP introuvable : ${manquants.join(", ")}` : null,
  };
}

export type CoutDuLitreDuMois = {
  eau: EauDuMois | null;
  cartons: CartonsDuMois | null;
  // Pourcentage d'eau utilise et d'ou il vient ("ce mois", "repris de ...", "valeur par defaut")
  pourcentage: number;
  pourcentageSource: string | null;
  parametres: ParametresElectricite;
  litres: number | null;
  coutConsommables: number;
  // Total du mois par element, avec prix d'une unite et cout (tableau des consommables)
  totaux: TotalElementAvecPrix[];
  // D'ou viennent les prix : "ce mois", "repris de ..." ou null (aucun prix saisi)
  sourcePrix: string | null;
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
  const [eauDuMois, electricite, lecture, prix, auto] = await Promise.all([
    lireEauDuMois(annee, mois),
    lireParametresElectricite(annee, mois),
    lireSaisiesDuMois(annee, mois),
    lirePrixDuMois(annee, mois),
    lireConsoAutoMp(annee, mois),
  ]);

  const totaux = totauxAvecPrix(totauxDuMois(lecture.saisies, auto.elements), prix.lignes);
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
    pourcentage: eauDuMois.eau?.pourcentage ?? POURCENTAGE_EAU,
    pourcentageSource: eauDuMois.pourcentageSource,
    parametres,
    litres,
    coutConsommables,
    totaux,
    sourcePrix: prix.source,
    nombreConsommables: totaux.filter((t) => t.total > 0).length,
    consommablesSansPrix,
    coutElectricite,
    electriciteIncomplete,
    coutLitre: litres === null ? null : coutDuLitre(coutConsommables, coutElectricite, litres),
    erreur: eauDuMois.erreur ?? lecture.erreur ?? auto.erreur,
  };
}
