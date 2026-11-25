import { after } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRowsFirstPageCount } from "@/lib/fetch-all-rows-parallel";
import { calculerConsommationVrac, cleLigneCode, type DemandeLigneCode } from "@/lib/vrac-consommation";
import { codeEffectifEntree, kgParCarton, type ArticleInfo } from "@/lib/conditionnement-codes-vrac";
import { SOURCE_VRAC_A_RECUPERER } from "@/lib/vrac-a-recuperer";
import { aujourdhuiIso, calculerClotures, datePerteDe, resteEstPerdu, type MarqueTermine } from "@/lib/vrac-perte";

// STOCK DE VRAC DU DEPOT B. Le vrac fabrique pour un code ENTRE dans le Depot B (article vrac du produit, numero de lot = le code) et SORT avec
// les cartons produits (cartons x contenance x pieces par carton, plafonne au vrac fabrique : lib/vrac-consommation.ts). Le reste du code =
// son stock reel dans le Depot B (page Depot, historique des mouvements).
//
// Ces lignes de lots_stock (source SOURCE_VRAC_PRODUCTION) sont un MIROIR de la production : elles ne se saisissent jamais a la main, elles sont
// recalculees depuis les saisies (Fabrication, Conditionnement, choix des codes vrac). Par code vrac, UNE ligne d'entree (vrac fabrique) et UNE
// ligne de sortie (vrac consomme par les cartons). Corriger, supprimer ou deplacer une saisie remet donc le stock juste au prochain calcul, il ne
// peut pas se desynchroniser. Elles sont SEPAREES du module "Vrac a recuperer" (autre source) : le module et la liste "Code vrac recupere" de
// la Fabrication ne comptent pas ces lignes (voir lireSoldesVracProduction), le vrac encore en cours de conditionnement n'est pas "a recuperer".
//
// PERTE : une fois le Conditionnement du code termine (Fin programme), le reste garde sa place 5 jours (lib/vrac-perte.ts) ; passe ce delai
// une 3eme ligne, la PERTE, sort ce qui reste : le stock du code retombe a 0 et le rapport des pertes de vrac le signale au-dela de 100 kg.

export const SOURCE_VRAC_PRODUCTION = "web:vrac-production";
export const UTILISATEUR_VRAC_PRODUCTION = "Production (automatique)";

// Commence par "Fabrication vrac" : la page Depot affiche alors le statut du lot (Conforme / A recuperer) comme pour tout vrac fabrique
const NOTE_ENTREE = "Fabrication vrac - entree du vrac fabrique (recalcule automatiquement)";
const NOTE_SORTIE = "Fabrication vrac - sortie des cartons produits (recalcule automatiquement)";
const MARQUE_PERTE = "perte du reste";
const NOTE_PERTE = `Fabrication vrac - ${MARQUE_PERTE} (Conditionnement termine depuis plus de 5 jours, recalcule automatiquement)`;
const NOTE_A_RECUPERER = " A recuperer";

// Un code qui n'a pas encore de lignes de stock n'en recoit que s'il lui reste du vrac a ce point (en dessous, ce sont les pertes habituelles d'un
// lot deja conditionne : sinon des centaines de vieux codes avec quelques kg encombreraient le Depot B). Un code qui a deja ses lignes les garde
// toujours a jour.
export const RESTE_MIN_NOUVEAU_CODE_KG = 1;
export const RESTE_MIN_NOUVEAU_CODE_RATIO = 0.05;

// ... et seulement pour un code ACTIF : fabrique ou conditionne depuis moins de ce nombre de jours. Les anciens codes (fabriques avant que le
// Depot B porte le vrac) restent comme avant, sans stock de vrac : leur reste est de la perte deja soldee, pas du vrac qui attend. Un code
// qui a deja ses lignes les garde a jour sans limite d'age.
export const FENETRE_CODE_ACTIF_JOURS = 21;

// Un calcul AUTOMATIQUE (apres une saisie, a l'ouverture du Dashboard) ne touche pas a plus de lignes que ca d'un coup : au-dela (premiere reprise
// des anciens codes, grosse correction), il ne fait rien et attend un lancement volontaire.
export const LIMITE_CHANGEMENTS_AUTOMATIQUE = 150;

const TOLERANCE = 0.0005;
const arrondi3 = (valeur: number) => Math.round(valeur * 1000) / 1000;
const arrondi2 = (valeur: number) => Math.round(valeur * 100) / 100;

type EntreeVrac = { programme_ligne_id: number; code: string | null; quantite: number | string | null; date_jour: string | null };
type EntreeCarton = { programme_ligne_id: number; code: string | null; quantite: number | string | null; date_jour: string | null };
type LigneProgramme = { id: number; article_id: number | null; numero_lot: string | null; produit: string | null };
type ChoixBrut = { id: number; programme_ligne_id: number; code: string; code_vrac: string };

export type DonneesVrac = {
  entreesVrac: EntreeVrac[];
  entreesCarton: EntreeCarton[];
  lignes: LigneProgramme[];
  articles: ArticleInfo[];
  choix: ChoixBrut[];
  // Test labo "A detruire" : ce vrac ne credite jamais le stock ; "A recuperer" : il est credite avec le statut "A recuperer"
  codesADetruire: Set<string>;
  codesARecuperer: Set<string>;
  // Fin programme du Conditionnement (marques de production_code_termine) : sert a perdre le reste 5 jours apres
  termines: MarqueTermine[];
  aujourdhui: string;
};

export type CibleVrac = {
  code: string;
  articleId: number;
  produit: string | null;
  entree: number;
  sortie: number;
  // Vrac qui reste apres les cartons, AVANT la perte
  reste: number;
  // Part du reste deja PERDUE (Conditionnement termine depuis 5 jours ou plus) ; le stock du code = reste - perte
  perte: number;
  dateCloture: string | null;
  datePerte: string | null;
  dateFabrication: string | null;
  dateSortie: string | null;
  // Derniere date ou ce code a ete fabrique ou conditionne : sert a savoir s'il est encore actif
  derniereActivite: string | null;
  aRecuperer: boolean;
};

function jour(valeur: string | null | undefined): string | null {
  return valeur ? String(valeur).slice(0, 10) : null;
}

// Calcul pur (aucun acces base) : pour chaque code vrac fabrique, ce qui est entre (vrac fabrique) et ce qui est sorti (cartons produits).
export function calculerCiblesVrac(donnees: DonneesVrac): { cibles: CibleVrac[]; sansArticle: string[] } {
  const articleParId = new Map(donnees.articles.map((a) => [a.id, a]));
  const ligneParId = new Map(donnees.lignes.map((l) => [l.id, l]));

  const fabriqueParCode = new Map<string, number>();
  const dateFabricationParCode = new Map<string, string>();
  const derniereFabricationParCode = new Map<string, string>();
  const produitParCode = new Map<string, string>();
  const articlesParCode = new Map<string, Map<number, number>>();
  for (const entree of donnees.entreesVrac) {
    const code = (entree.code ?? "").trim();
    if (!code) continue;
    const produit = ligneParId.get(entree.programme_ligne_id)?.produit;
    if (produit && !produitParCode.has(code)) produitParCode.set(code, produit);
    fabriqueParCode.set(code, (fabriqueParCode.get(code) ?? 0) + Number(entree.quantite ?? 0));
    const date = jour(entree.date_jour);
    if (date && (!dateFabricationParCode.has(code) || date < (dateFabricationParCode.get(code) as string))) dateFabricationParCode.set(code, date);
    if (date && date > (derniereFabricationParCode.get(code) ?? "")) derniereFabricationParCode.set(code, date);
    const vracArticleId = articleParId.get(ligneParId.get(entree.programme_ligne_id)?.article_id ?? -1)?.vrac_article_id ?? null;
    if (vracArticleId) {
      const compte = articlesParCode.get(code) ?? new Map<number, number>();
      compte.set(vracArticleId, (compte.get(vracArticleId) ?? 0) + 1);
      articlesParCode.set(code, compte);
    }
  }

  const demandes = new Map<string, DemandeLigneCode>();
  const dateCartonsParLigneCode = new Map<string, string>();
  for (const entree of donnees.entreesCarton) {
    const ligne = ligneParId.get(entree.programme_ligne_id);
    const code = codeEffectifEntree(entree.code, ligne?.numero_lot ?? null);
    if (!code) continue;
    const cle = cleLigneCode(entree.programme_ligne_id, code);
    const existante = demandes.get(cle) ?? {
      ligneId: entree.programme_ligne_id,
      code,
      cartons: 0,
      kgParCarton: kgParCarton(ligne?.article_id ? articleParId.get(ligne.article_id) : undefined),
    };
    const cartons = Number(entree.quantite ?? 0);
    existante.cartons += cartons;
    demandes.set(cle, existante);
    const date = jour(entree.date_jour);
    if (cartons > 0 && date && date > (dateCartonsParLigneCode.get(cle) ?? "")) dateCartonsParLigneCode.set(cle, date);
  }

  const choix = donnees.choix.map((c) => ({ id: c.id, ligneId: c.programme_ligne_id, code: c.code, codeVrac: c.code_vrac }));
  const resultat = calculerConsommationVrac({ choix, demandes: [...demandes.values()], fabriqueParCodeVrac: fabriqueParCode });

  // Date de la derniere fournee de cartons qui a consomme chaque code vrac (pour dater la sortie)
  const dateSortieParCode = new Map<string, string>();
  const noterDate = (codeVrac: string, cle: string) => {
    const date = dateCartonsParLigneCode.get(cle);
    if (date && date > (dateSortieParCode.get(codeVrac) ?? "")) dateSortieParCode.set(codeVrac, date);
  };
  const lignesAvecChoix = new Set(choix.map((c) => cleLigneCode(c.ligneId, c.code)));
  for (const unChoix of choix) {
    if ((resultat.parChoix.get(unChoix.id) ?? 0) > 0) noterDate(unChoix.codeVrac, cleLigneCode(unChoix.ligneId, unChoix.code));
  }
  for (const cle of demandes.keys()) {
    if (lignesAvecChoix.has(cle)) continue;
    noterDate(cle.slice(cle.indexOf("::") + 2), cle);
  }

  const clotures = calculerClotures(donnees.lignes, donnees.termines);

  const cibles: CibleVrac[] = [];
  const sansArticle: string[] = [];
  for (const [code, fabrique] of fabriqueParCode) {
    if (!(fabrique > 0) || donnees.codesADetruire.has(code)) continue;
    const comptes = articlesParCode.get(code);
    if (!comptes || comptes.size === 0) {
      sansArticle.push(code);
      continue;
    }
    const articleId = [...comptes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const bilan = resultat.parCodeVrac.get(code) ?? { fabrique, consomme: 0, reste: fabrique };
    const dateSortie = dateSortieParCode.get(code) ?? null;
    const derniereFabrication = derniereFabricationParCode.get(code) ?? null;
    // Conditionnement termine depuis 5 jours ou plus : tout ce qui reste est perdu
    const dateCloture = clotures.get(code) ?? null;
    const perdu = dateCloture !== null && resteEstPerdu(dateCloture, donnees.aujourdhui);
    cibles.push({
      code,
      articleId,
      produit: produitParCode.get(code) ?? null,
      entree: arrondi3(bilan.fabrique),
      sortie: arrondi3(bilan.consomme),
      reste: arrondi3(bilan.reste),
      perte: perdu ? arrondi3(bilan.reste) : 0,
      dateCloture,
      datePerte: dateCloture ? datePerteDe(dateCloture) : null,
      dateFabrication: dateFabricationParCode.get(code) ?? null,
      dateSortie,
      derniereActivite: [derniereFabrication, dateSortie].filter((d): d is string => !!d).sort().pop() ?? null,
      aRecuperer: donnees.codesARecuperer.has(code),
    });
  }
  return { cibles, sansArticle };
}

type LigneStock = {
  id: number;
  article_id: number;
  depot_id: number | null;
  date_jour: string | null;
  numero_lot: string | null;
  code_normalise: string | null;
  date_fabrication: string | null;
  qte_entree: number | string | null;
  qte_sortie: number | string | null;
  note: string | null;
};

type LigneVoulue = {
  cle: string;
  ligne: {
    article_id: number;
    depot_id: number;
    date_jour: string;
    numero_lot: string;
    code_normalise: string;
    date_fabrication: string;
    qte_entree: number;
    qte_sortie: number;
    source_import: string;
    note: string;
    utilisateur: string;
  };
};

// E = entree (vrac fabrique), S = sortie (cartons produits), P = perte du reste
type Genre = "E" | "S" | "P";

function cleLigne(articleId: number, numeroLot: string | null, genre: Genre): string {
  return `${articleId}|${(numeroLot ?? "").trim().toUpperCase()}|${genre}`;
}

function genreDeLigne(ligne: { qte_entree: number | string | null; note: string | null }): Genre {
  if (Number(ligne.qte_entree ?? 0) > 0) return "E";
  return (ligne.note ?? "").includes(MARQUE_PERTE) ? "P" : "S";
}

// Les lignes de stock voulues pour les cibles : par code, une entree (vrac fabrique) et, s'il y a eu des cartons, une sortie ; une 3eme ligne,
// la perte, quand le Conditionnement est termine depuis 5 jours ou plus et qu'il reste du vrac.
// ecritureExistante : ecriture exacte d'un code deja presente dans le Depot B (module Vrac a recuperer), pour que le stock reste groupe sous un
// seul numero de lot.
export function lignesVoulues(
  cibles: CibleVrac[],
  depotBId: number,
  aujourdhui: string,
  ecritureExistante: Map<string, string>,
  codesAvecLignes: Set<string>
): LigneVoulue[] {
  const voulues: LigneVoulue[] = [];
  const limiteActif = new Date(new Date(`${aujourdhui}T00:00:00Z`).getTime() - FENETRE_CODE_ACTIF_JOURS * 86400000).toISOString().slice(0, 10);
  for (const cible of cibles) {
    const cleCode = `${cible.articleId}|${cible.code.toUpperCase()}`;
    const aDejaSesLignes = codesAvecLignes.has(cleCode);
    // Ce qui reste APRES la perte : un code deja perdu en entier n'a plus de stock a creer
    const stockRestant = cible.reste - cible.perte;
    const assezDeReste = stockRestant >= RESTE_MIN_NOUVEAU_CODE_KG && stockRestant >= cible.entree * RESTE_MIN_NOUVEAU_CODE_RATIO;
    const actif = (cible.derniereActivite ?? cible.dateFabrication ?? aujourdhui) >= limiteActif;
    if (!aDejaSesLignes && !(assezDeReste && actif)) continue;
    const numeroLot = ecritureExistante.get(cleCode) ?? cible.code;
    const dateFabrication = cible.dateFabrication ?? aujourdhui;
    const suffixe = cible.aRecuperer ? NOTE_A_RECUPERER : "";
    const base = { depot_id: depotBId, article_id: cible.articleId, numero_lot: numeroLot, code_normalise: numeroLot.toUpperCase(), date_fabrication: dateFabrication, source_import: SOURCE_VRAC_PRODUCTION, utilisateur: UTILISATEUR_VRAC_PRODUCTION };
    // Les quantites du stock ont 2 decimales (la base arrondit sinon, et la ligne paraitrait changee a chaque calcul)
    const entree = arrondi2(cible.entree);
    const sortie = arrondi2(cible.sortie);
    const perte = arrondi2(cible.perte);
    if (entree > TOLERANCE) {
      voulues.push({
        cle: cleLigne(cible.articleId, numeroLot, "E"),
        ligne: { ...base, date_jour: dateFabrication, qte_entree: entree, qte_sortie: 0, note: NOTE_ENTREE.replace("Fabrication vrac", `Fabrication vrac${suffixe}`) },
      });
    }
    if (sortie > TOLERANCE) {
      voulues.push({
        cle: cleLigne(cible.articleId, numeroLot, "S"),
        ligne: { ...base, date_jour: cible.dateSortie ?? dateFabrication, qte_entree: 0, qte_sortie: sortie, note: NOTE_SORTIE.replace("Fabrication vrac", `Fabrication vrac${suffixe}`) },
      });
    }
    if (perte > TOLERANCE) {
      voulues.push({
        cle: cleLigne(cible.articleId, numeroLot, "P"),
        ligne: { ...base, date_jour: cible.datePerte ?? aujourdhui, qte_entree: 0, qte_sortie: perte, note: NOTE_PERTE.replace("Fabrication vrac", `Fabrication vrac${suffixe}`) },
      });
    }
  }
  return voulues;
}

export type PlanSynchro = {
  aInserer: LigneVoulue["ligne"][];
  // lignes existantes a retirer (remplacees, en double, ou dont le code n'existe plus)
  aSupprimer: LigneStock[];
  remplacees: number;
  inchangees: number;
};

// Compare les lignes voulues aux lignes existantes de ce miroir. Une ligne dont la quantite, le lot ou la note change est REMPLACEE (nouvelle
// ligne + suppression de l'ancienne) : ce sont les memes colonnes ecrites a la creation, jamais de mise a jour partielle. Deux lignes pour la meme
// cle (calcul lance deux fois en meme temps) : la plus recente est gardee.
export function planifierSynchro(voulues: LigneVoulue[], existantes: LigneStock[]): PlanSynchro {
  const parCle = new Map<string, LigneStock[]>();
  for (const ligne of existantes) {
    const cle = cleLigne(ligne.article_id, ligne.numero_lot, genreDeLigne(ligne));
    parCle.set(cle, [...(parCle.get(cle) ?? []), ligne]);
  }
  const plan: PlanSynchro = { aInserer: [], aSupprimer: [], remplacees: 0, inchangees: 0 };
  const clesVoulues = new Set(voulues.map((v) => v.cle));

  for (const voulue of voulues) {
    const lignes = (parCle.get(voulue.cle) ?? []).sort((a, b) => b.id - a.id);
    const [gardee, ...doublons] = lignes;
    plan.aSupprimer.push(...doublons);
    const identique =
      gardee &&
      Math.abs(Number(gardee.qte_entree ?? 0) - voulue.ligne.qte_entree) < TOLERANCE &&
      Math.abs(Number(gardee.qte_sortie ?? 0) - voulue.ligne.qte_sortie) < TOLERANCE &&
      (gardee.numero_lot ?? "") === voulue.ligne.numero_lot &&
      (gardee.note ?? "") === voulue.ligne.note &&
      gardee.depot_id === voulue.ligne.depot_id &&
      // la perte garde son jour (la date de fin de Conditionnement + 5 jours) : si la fin change, la ligne change
      (!voulue.cle.endsWith("|P") || String(gardee.date_jour ?? "").slice(0, 10) === voulue.ligne.date_jour);
    if (identique) {
      plan.inchangees++;
      continue;
    }
    plan.aInserer.push(voulue.ligne);
    if (gardee) {
      plan.aSupprimer.push(gardee);
      plan.remplacees++;
    }
  }
  for (const [cle, lignes] of parCle) {
    if (!clesVoulues.has(cle)) plan.aSupprimer.push(...lignes);
  }
  return plan;
}

function decouper<T>(liste: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let debut = 0; debut < liste.length; debut += taille) lots.push(liste.slice(debut, debut + taille));
  return lots;
}

async function lireParIds<T>(table: string, colonnes: string, ids: number[]): Promise<T[]> {
  const resultats = await Promise.all(
    decouper([...new Set(ids)], 150).map(async (paquet) => {
      const { data, error } = await supabaseServer.from(table).select(colonnes).in("id", paquet);
      if (error) throw new Error(error.message);
      return (data ?? []) as T[];
    })
  );
  return resultats.flat();
}

function lireToutes<T>(table: string, colonnes: string, filtre?: (requete: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return fetchAllRowsFirstPageCount<T>(
    (debut, fin, avecCompte) => {
      let requete = supabaseServer.from(table).select(colonnes, avecCompte ? { count: "exact" } : undefined);
      if (filtre) requete = filtre(requete);
      return requete.order("id", { ascending: true }).range(debut, fin) as unknown as PromiseLike<{
        data: T[] | null;
        count?: number | null;
        error: { message: string } | null;
      }>;
    },
    1000
  );
}

export async function lireDepotBId(): Promise<number | null> {
  const { data } = await supabaseServer.from("depots").select("id").ilike("nom", "Depot B").maybeSingle();
  return (data as { id: number } | null)?.id ?? null;
}

// Tout ce que le calcul du vrac lit dans la production (partage avec le rapport des pertes de vrac) : vrac fabrique, cartons, lignes, articles,
// choix de code vrac, Test labo bloquants, Fin programme du Conditionnement.
export async function lireDonneesProductionVrac(): Promise<DonneesVrac> {
  const [entreesVrac, entreesCarton, lignes, choix, rapportsBloques, termines] = await Promise.all([
    lireToutes<EntreeVrac>("production_vrac_entries", "id, programme_ligne_id, code, quantite, date_jour"),
    lireToutes<EntreeCarton>("production_carton_entries", "id, programme_ligne_id, code, quantite, date_jour"),
    lireToutes<LigneProgramme>("programme_lignes", "id, article_id, numero_lot, produit"),
    lireToutes<ChoixBrut>("conditionnement_codes_vrac", "id, programme_ligne_id, code, code_vrac").catch((erreur: Error) => {
      // Table pas encore creee : aucun choix de code vrac, chaque ligne consomme son propre code
      if (/does not exist|schema cache|PGRST205|42P01/i.test(erreur.message)) return [] as ChoixBrut[];
      throw erreur;
    }),
    lireToutes<{ code: string | null; disposition_qualite: string | null }>("production_rapports", "id, code, disposition_qualite", (requete) =>
      requete.in("disposition_qualite", ["a_recuperer", "a_detruire"])
    ),
    lireToutes<MarqueTermine>("production_code_termine", "id, programme_ligne_id, code, stage, termine_date", (requete) => requete.eq("stage", "carton")),
  ]);

  const articles = await lireParIds<ArticleInfo>(
    "articles",
    "id, nom_article, vrac_article_id, contenance, piece_par_carton",
    lignes.map((l) => l.article_id).filter((id): id is number => id !== null)
  );

  const codesADetruire = new Set<string>();
  const codesARecuperer = new Set<string>();
  for (const rapport of rapportsBloques) {
    const code = (rapport.code ?? "").trim();
    if (!code) continue;
    (rapport.disposition_qualite === "a_detruire" ? codesADetruire : codesARecuperer).add(code);
  }

  return { entreesVrac, entreesCarton, lignes, articles, choix, codesADetruire, codesARecuperer, termines, aujourdhui: aujourdhuiIso() };
}

export type ResumeSynchro = {
  appliquee: boolean;
  raison: string | null;
  codesCalcules: number;
  codesSansArticle: string[];
  aInserer: number;
  aSupprimer: number;
  remplacees: number;
  inchangees: number;
  changements: number;
  plan: PlanSynchro | null;
};

// Recalcule le stock de vrac du Depot B depuis les saisies de production et met a jour le miroir (voir plus haut). Rien n'est ecrit si une
// lecture echoue. limiteChangements : au-dela, rien n'est ecrit (calcul automatique) ; simulation : calcule sans rien ecrire.
export async function synchroniserVracDepotB(options?: { limiteChangements?: number; simulation?: boolean }): Promise<ResumeSynchro> {
  const vide = (raison: string): ResumeSynchro => ({
    appliquee: false,
    raison,
    codesCalcules: 0,
    codesSansArticle: [],
    aInserer: 0,
    aSupprimer: 0,
    remplacees: 0,
    inchangees: 0,
    changements: 0,
    plan: null,
  });

  const depotBId = await lireDepotBId();
  if (!depotBId) return vide("Depot B introuvable.");

  const [donnees, existantes, lotsModule] = await Promise.all([
    lireDonneesProductionVrac(),
    lireToutes<LigneStock>(
      "lots_stock",
      "id, article_id, depot_id, date_jour, numero_lot, code_normalise, date_fabrication, qte_entree, qte_sortie, note",
      (requete) => requete.eq("source_import", SOURCE_VRAC_PRODUCTION)
    ),
    lireToutes<{ article_id: number; numero_lot: string | null }>("lots_stock", "id, article_id, numero_lot", (requete) =>
      requete.eq("source_import", SOURCE_VRAC_A_RECUPERER).eq("depot_id", depotBId)
    ),
  ]);

  const { cibles, sansArticle } = calculerCiblesVrac(donnees);

  const ecritureExistante = new Map<string, string>();
  for (const lot of lotsModule) {
    const numeroLot = (lot.numero_lot ?? "").trim();
    if (numeroLot) ecritureExistante.set(`${lot.article_id}|${numeroLot.toUpperCase()}`, numeroLot);
  }
  const codesAvecLignes = new Set(existantes.map((l) => `${l.article_id}|${(l.numero_lot ?? "").trim().toUpperCase()}`));

  const voulues = lignesVoulues(cibles, depotBId, donnees.aujourdhui, ecritureExistante, codesAvecLignes);
  const plan = planifierSynchro(voulues, existantes);
  // Une ligne remplacee compte pour UN changement (une nouvelle ligne + le retrait de l'ancienne)
  const changements = plan.aInserer.length + plan.aSupprimer.length - plan.remplacees;
  const resume: ResumeSynchro = {
    appliquee: false,
    raison: null,
    codesCalcules: cibles.length,
    codesSansArticle: sansArticle,
    aInserer: plan.aInserer.length,
    aSupprimer: plan.aSupprimer.length,
    remplacees: plan.remplacees,
    inchangees: plan.inchangees,
    changements,
    plan,
  };

  if (changements === 0) return { ...resume, appliquee: true };
  if (options?.simulation) return { ...resume, raison: "Simulation : rien n'a ete ecrit." };
  if (options?.limiteChangements !== undefined && changements > options.limiteChangements) {
    return { ...resume, raison: `${changements} lignes a changer (plus que la limite automatique de ${options.limiteChangements}) : calcul a lancer volontairement.` };
  }

  // Les nouvelles lignes d'abord, puis le retrait des anciennes : si l'ecriture echoue, rien n'est retire
  for (const paquet of decouper(plan.aInserer, 200)) {
    const { error } = await supabaseServer.from("lots_stock").insert(paquet);
    if (error) throw new Error(`Stock de vrac du Depot B : ecriture impossible (${error.message}).`);
  }
  for (const paquet of decouper(plan.aSupprimer.map((l) => l.id), 100)) {
    const { error } = await supabaseServer.from("lots_stock").delete().in("id", paquet).eq("source_import", SOURCE_VRAC_PRODUCTION);
    if (error) throw new Error(`Stock de vrac du Depot B : retrait des anciennes lignes impossible (${error.message}).`);
  }
  return { ...resume, appliquee: true };
}

// Stock actuel (entrees - sorties) de ce miroir par article + code dans le Depot B : sert a le RETIRER des soldes du module Vrac a recuperer
// (meme article et meme code que le vrac a recuperer, mais pas le meme vrac).
export async function lireSoldesVracProduction(depotBId: number): Promise<Map<string, number>> {
  const lignes = await lireToutes<{ article_id: number; numero_lot: string | null; qte_entree: number | null; qte_sortie: number | null }>(
    "lots_stock",
    "id, article_id, numero_lot, qte_entree, qte_sortie",
    (requete) => requete.eq("source_import", SOURCE_VRAC_PRODUCTION).eq("depot_id", depotBId)
  );
  const soldes = new Map<string, number>();
  for (const ligne of lignes) {
    const cle = `${ligne.article_id}::${(ligne.numero_lot ?? "").trim()}`;
    soldes.set(cle, (soldes.get(cle) ?? 0) + Number(ligne.qte_entree ?? 0) - Number(ligne.qte_sortie ?? 0));
  }
  return soldes;
}

// ---- Declenchement : apres une saisie, SANS ralentir la reponse (le calcul tourne apres) ----

let calculEnCours: Promise<void> | null = null;
let calculEnAttente: Promise<void> | null = null;
let dernierCalcul = 0;

function executerCalcul(): Promise<void> {
  const calcul: Promise<void> = synchroniserVracDepotB({ limiteChangements: LIMITE_CHANGEMENTS_AUTOMATIQUE })
    .then((resume) => {
      if (resume.raison) console.warn("Stock de vrac du Depot B :", resume.raison);
    })
    .catch((erreur) => console.error("Stock de vrac du Depot B : calcul impossible :", erreur instanceof Error ? erreur.message : erreur))
    .finally(() => {
      dernierCalcul = Date.now();
      if (calculEnCours === calcul) calculEnCours = null;
    });
  calculEnCours = calcul;
  return calcul;
}

async function lancerCalcul(minIntervalleMs: number): Promise<void> {
  // Rattrapage a l'ouverture d'une page : pas de calcul s'il y en a un en cours ou en attente, ou s'il date de moins de minIntervalleMs
  if (minIntervalleMs > 0 && (calculEnCours || calculEnAttente || Date.now() - dernierCalcul < minIntervalleMs)) return;
  if (!calculEnCours) return executerCalcul();
  // Un calcul tourne deja : il a peut-etre lu les donnees AVANT cette saisie. Un SEUL calcul suivant est mis en attente (il lira les donnees
  // apres toutes les saisies deja faites) : dix saisies de suite ne lancent pas dix calculs.
  if (!calculEnAttente) {
    calculEnAttente = calculEnCours.then(() => {
      calculEnAttente = null;
      return executerCalcul();
    });
  }
  return calculEnAttente;
}

// A appeler apres une saisie qui change le vrac (Fabrication, cartons, choix de code vrac, suppression). minIntervalleMs > 0 : calcul de
// rattrapage a l'ouverture d'une page (au plus un par intervalle). Ne remonte jamais d'erreur a la saisie.
export function planifierSynchroVrac(minIntervalleMs = 0): void {
  try {
    after(() => lancerCalcul(minIntervalleMs));
  } catch {
    // hors d'une requete (script, test) : pas de calcul automatique
  }
}
