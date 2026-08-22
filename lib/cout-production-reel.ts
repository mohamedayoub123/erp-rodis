import { supabaseServer } from "@/lib/supabase-server";
import {
  fetchCoutsReelsMpDepotB,
  computeRecetteCost,
  fetchCoutVracParKg,
  fetchCoutReelDepuisReservation,
} from "@/lib/prix-revient";
import { resolveVracArticleId } from "@/lib/vrac-article";
import { normalizeMachineName } from "@/lib/machine-match";
import { hhmmDiffMinutes, ddmmHhmmDiffMinutes } from "@/lib/suivi-tirage-time";
import { fetchAllVracEntries, fetchAllCartonEntries, fetchAllProgrammeLignes } from "@/app/production/suivi/data";

export type CoutReelPeriode = { dateFrom?: string; dateTo?: string; months?: string[]; code?: string };

export type LigneIncertaine = { ligneId: number; code: string; motifs: string[] };

export type CoutReelResult = {
  articleId: number;
  nomArticle: string;
  nature: "vrac" | "fini";
  quantiteTotaleProduite: number;
  uniteQuantite: "kg" | "carton";
  coutVracReel: number | null;
  coutConditionnementReel: number | null;
  coutElectricite: number;
  coutJournaliers: number;
  coutChargeGenerale: number;
  coutTotal: number;
  coutParCarton: number | null;
  coutParPiece: number | null;
  coutParGramme: number | null;
  prixVenteParGramme: number | null;
  margeParGramme: number | null;
  margeTotale: number | null;
  detailParMois: { mois: string; quantite: number; coutTotal: number; vente: number | null; marge: number | null }[];
  lignesIncertaines: LigneIncertaine[];
};

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function moisDe(dateJour: string) {
  return dateJour.slice(0, 7);
}

function matchesPeriode(dateJour: string, periode: CoutReelPeriode) {
  if (periode.months && periode.months.length > 0) {
    return periode.months.includes(moisDe(dateJour));
  }
  if (periode.dateFrom && dateJour < periode.dateFrom) return false;
  if (periode.dateTo && dateJour > periode.dateTo) return false;
  return true;
}

// Quantite reellement produite (cartons), par article fini, sur la periode -
// sert a construire la liste "tous les articles" (page
// /production/rapport/cout-reel) sans avoir a chiffrer inutilement des
// centaines d'articles jamais fabriques sur la periode choisie, et sans
// passer par computeCoutReelArticle (trop lourd - electricite/journaliers/
// charge generale - pour etre appele en boucle sur une liste entiere).
export async function fetchQuantitesProduitesParArticleSurPeriode(
  periode: CoutReelPeriode
): Promise<Map<number, number>> {
  const [{ rows: lignes }, cartonEntries] = await Promise.all([
    fetchAllProgrammeLignes(),
    fetchAllCartonEntries(),
  ]);
  const articleIdByLigneId = new Map(lignes.map((l) => [l.id, l.article_id]));

  const quantitesParArticle = new Map<number, number>();
  for (const entry of cartonEntries) {
    const quantite = Number(entry.quantite ?? 0);
    if (quantite <= 0) continue;
    if (!matchesPeriode(entry.date_jour, periode)) continue;
    const articleId = articleIdByLigneId.get(entry.programme_ligne_id);
    if (!articleId) continue;
    quantitesParArticle.set(articleId, (quantitesParArticle.get(articleId) ?? 0) + quantite);
  }
  return quantitesParArticle;
}

type ProgrammeLigneRow = { id: number; chaine: string | null };
type ArticleRow = {
  id: number;
  nom_article: string;
  nature: string | null;
  vrac_article_id: number | null;
  vrac_quantite_recette: number | null;
  quantite_recette_base: number | null;
  contenance: number | null;
  piece_par_carton: number | null;
  prix_vente: number | null;
};
type RecetteLigneRow = { article_pf_id: number; article_mp_id: number; quantite: number };
type MachineRow = {
  id: number;
  nom: string;
  type: string | null;
  consommation_electrique_kw: number | null;
  consommation_gaz_litres_heure: number | null;
  consommation_gasoil_litres_heure: number | null;
  energie_machine_ids: number[] | null;
};
type PrixMoisRow = {
  annee: number;
  mois: number;
  prix_kwh: number | null;
  prix_heure_journalier: number | null;
  prix_gaz: number | null;
  prix_gasoil: number | null;
  prix_essence: number | null;
};
type RapportCoutRow = {
  programme_ligne_id: number;
  code: string;
  machine: string | null;
  temps_debut_preparation: string | null;
  temps_vidange: string | null;
  nb_journaliers_fabrication: number | null;
  date_fabrication_conditionnement: string | null;
  qt_vrac_recupere: number | null;
  code_vrac_recupere: string | null;
};

// Temps/journaliers Conditionnement vivent desormais par FOURNEE reelle sur
// production_carton_entries (migration add_conditionnement_fields_to_carton_entries.sql,
// 2026-08-21) - jamais plus sur production_rapports (qui ne recoit plus que
// date_fabrication_conditionnement/date_peremption depuis ce meme jour, voir
// upsertRapport dans app/production/suivi-production/actions.ts). Un code
// peut avoir PLUSIEURS fournees, chacune avec son propre horaire/journaliers/
// date - jamais une seule valeur partagee comme avant.
type CartonEntryTempsRow = {
  programme_ligne_id: number;
  code: string;
  date_jour: string;
  temps_demarage_lot: string | null;
  temps_arret_batch: string | null;
  nb_journaliers_conditionnement: number | null;
  // Chaine figee au moment de CETTE fournee (ajoutee par
  // add_chaine_zone_to_carton_entries.sql) - jamais programme_lignes.chaine
  // (un seul champ partage par ligne, ecrase a chaque changement de chaine -
  // bug reel corrige, voir le commentaire sur updateLigneZoneChaineAction).
  // Repli sur chaineByLigneId (l'ancien champ partage) uniquement pour les
  // fournees saisies avant cette migration, qui n'ont pas ce champ.
  chaine: string | null;
};

// Meme motif que CartonEntryTempsRow/fetchCartonEntriesTemps, pour la
// fournee Emballage (production_emballage_entries) - jamais inclus avant
// dans le cout reel, alors que ses journaliers sont un vrai cout au meme
// titre que Fabrication/Conditionnement (bug reel signale : "pour
// l'emballage tu n'as pas calcule").
type EmballageEntryTempsRow = {
  programme_ligne_id: number;
  code: string;
  date_jour: string;
  emballage_temps_demarrer: string | null;
  emballage_temps_arret: string | null;
  nb_journaliers_emballage: number | null;
};

async function fetchEmballageEntriesTemps(ligneIds?: number[]): Promise<EmballageEntryTempsRow[]> {
  if (ligneIds && ligneIds.length === 0) return [];

  const rows: EmballageEntryTempsRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("production_emballage_entries")
      .select("programme_ligne_id, code, date_jour, emballage_temps_demarrer, emballage_temps_arret, nb_journaliers_emballage");
    if (ligneIds) {
      query = query.in("programme_ligne_id", ligneIds);
    }
    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as EmballageEntryTempsRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchProgrammeLignesForArticle(articleId: number): Promise<ProgrammeLigneRow[]> {
  const rows: ProgrammeLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, chaine")
      .eq("article_id", articleId)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as ProgrammeLigneRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchRecettesPfLignes(articlePfId: number): Promise<RecetteLigneRow[]> {
  const rows: RecetteLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("recettes_pf")
      .select("article_pf_id, article_mp_id, quantite")
      .eq("article_pf_id", articlePfId)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as RecetteLigneRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchRapportsCout(ligneIds: number[]): Promise<RapportCoutRow[]> {
  if (ligneIds.length === 0) return [];

  const rows: RapportCoutRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(
        "programme_ligne_id, code, machine, temps_debut_preparation, temps_vidange, nb_journaliers_fabrication, date_fabrication_conditionnement, qt_vrac_recupere, code_vrac_recupere"
      )
      .in("programme_ligne_id", ligneIds)
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as RapportCoutRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// ligneIds optionnel : omis pour une portee GLOBALE (toute l'usine, utilise
// par le partage des machines Energie qui doit voir toutes les fournees du
// jour, pas seulement celles de l'article en cours de calcul).
async function fetchCartonEntriesTemps(ligneIds?: number[]): Promise<CartonEntryTempsRow[]> {
  if (ligneIds && ligneIds.length === 0) return [];

  const rows: CartonEntryTempsRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabaseServer
      .from("production_carton_entries")
      .select("programme_ligne_id, code, date_jour, temps_demarage_lot, temps_arret_batch, nb_journaliers_conditionnement, chaine");
    if (ligneIds) {
      query = query.in("programme_ligne_id", ligneIds);
    }
    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as CartonEntryTempsRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Cout REEL trace (production_mp_reserve, jamais une estimation FEFO sur une
// recette theorique) pour chaque code de la periode, a un stage precis
// (pesage = matiere du vrac fabrique, salle_conditionnement = matiere de
// conditionnement) - demande explicite : Cout Reel affichait un cout
// FEFO/recette theorique qui pouvait diverger fortement du vrai cout trace
// (cas reel AA4251 : vrac FEFO 3 351 450 FCFA affiche, alors que le vrai
// trace par code vaut 4 950 000 FCFA - BASE BEAUTY PINK/LANETTE SX/ACIDE
// CITRIQUE ont tous un prix connu sur le lot reellement reserve). Chaque
// code sans trace disponible (systeme trop ancien) reste a la charge de
// l'appelant, qui doit se rabattre sur l'estimation FEFO pour SA seule
// quantite, jamais inventer un chiffre pour la partie tracee.
async function fetchCoutReelTraceParStage(
  entries: { programme_ligne_id: number; code: string; quantite: number }[],
  stage: "pesage" | "salle_conditionnement"
): Promise<{ coutTotal: number; quantiteTracee: number; quantiteNonTracee: number; certainesSansPrix: boolean }> {
  const quantiteParCode = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.programme_ligne_id}::${e.code}`;
    quantiteParCode.set(key, (quantiteParCode.get(key) ?? 0) + Number(e.quantite ?? 0));
  }

  let coutTotal = 0;
  let quantiteTracee = 0;
  let certainesSansPrix = false;

  for (const [key, quantite] of quantiteParCode.entries()) {
    const [ligneIdStr, code] = key.split("::");
    const { data: termineData } = await supabaseServer
      .from("production_code_termine")
      .select("id")
      .eq("programme_ligne_id", Number(ligneIdStr))
      .eq("code", code)
      .eq("stage", stage)
      .maybeSingle();
    const termine = termineData as { id: number } | null;
    if (!termine) continue;

    const info = await fetchCoutReelDepuisReservation(termine.id);
    if (!info || info.lotsUtilises.length === 0) continue;

    coutTotal += info.coutFcfa;
    quantiteTracee += quantite;
    if (info.lignesSansPrix.length > 0) certainesSansPrix = true;
  }

  const quantiteTotale = [...quantiteParCode.values()].reduce((sum, q) => sum + q, 0);
  return {
    coutTotal,
    quantiteTracee,
    quantiteNonTracee: Math.max(0, quantiteTotale - quantiteTracee),
    certainesSansPrix,
  };
}

async function fetchArticle(articleId: number): Promise<ArticleRow | null> {
  const { data } = await supabaseServer
    .from("articles")
    .select(
      "id, nom_article, nature, vrac_article_id, vrac_quantite_recette, quantite_recette_base, contenance, piece_par_carton, prix_vente"
    )
    .eq("id", articleId)
    .maybeSingle();
  return data as ArticleRow | null;
}

// Meme calcul (ratios) que la carte "Prix de revient" de
// recette-conditionnement/[id]/page.tsx, mais retourne les RATIOS par
// carton plutot qu'un total pour le lot theorique - ce module les multiplie
// ensuite par la quantite REELLEMENT produite sur la periode, pas par
// quantite_recette_base.
//
// quantiteReelleTotale (optionnel) : quantite reellement produite sur la
// periode - met a l'echelle les lignes de recette AVANT de resoudre le cout
// FEFO Depot B (comme fetchCoutVracParKg), pour que le tirage sur les lots
// reflete la VRAIE quantite consommee sur toute la periode plutot que juste
// la base theorique.
async function fetchRatiosConditionnement(article: ArticleRow, quantiteReelleTotale?: number) {
  const lignesConditionnement = await fetchRecettesPfLignes(article.id);
  const quantiteBase = article.quantite_recette_base;
  const ratio =
    quantiteReelleTotale !== undefined && quantiteBase && quantiteBase > 0
      ? quantiteReelleTotale / quantiteBase
      : 1;
  const lignesEchelle = lignesConditionnement.map((l) => ({ ...l, quantite: l.quantite * ratio }));

  const coutsMp = await fetchCoutsReelsMpDepotB(
    lignesEchelle.map((l) => ({ articleMpId: l.article_mp_id, quantite: l.quantite }))
  );
  const { coutTotal: coutConditionnementLot, lignesSansPrix: lignesSansPrixConditionnement } = computeRecetteCost(
    lignesEchelle,
    coutsMp
  );

  const quantiteUtilisee = quantiteReelleTotale ?? quantiteBase ?? 0;
  const coutConditionnementParCarton = quantiteUtilisee > 0 ? coutConditionnementLot / quantiteUtilisee : null;

  const qtVracAuto =
    article.contenance && article.piece_par_carton
      ? round((quantiteBase || 1) * article.piece_par_carton * article.contenance, 3)
      : null;
  const qtVracNecessaire = article.vrac_quantite_recette ?? qtVracAuto;
  const qtVracParCarton = quantiteBase && quantiteBase > 0 && qtVracNecessaire ? qtVracNecessaire / quantiteBase : null;

  return {
    coutConditionnementParCarton,
    qtVracParCarton,
    lignesSansPrixConditionnement: lignesSansPrixConditionnement.length > 0,
  };
}

async function fetchPrixMoisMap(mois: string[]): Promise<Map<string, PrixMoisRow>> {
  const map = new Map<string, PrixMoisRow>();
  if (mois.length === 0) return map;

  const annees = [...new Set(mois.map((m) => Number(m.slice(0, 4))))];
  const { data } = await supabaseServer
    .from("prix_carburant")
    .select("annee, mois, prix_kwh, prix_heure_journalier, prix_gaz, prix_gasoil, prix_essence")
    .in("annee", annees);

  for (const row of (data ?? []) as PrixMoisRow[]) {
    map.set(`${row.annee}-${String(row.mois).padStart(2, "0")}`, row);
  }
  return map;
}

type ProgrammeLigneChaineRow = { id: number; chaine: string | null };

async function fetchAllProgrammeLignesChaine(): Promise<ProgrammeLigneChaineRow[]> {
  const rows: ProgrammeLigneChaineRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, chaine")
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as ProgrammeLigneChaineRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type RapportEnergieRow = {
  programme_ligne_id: number;
  machine: string | null;
  temps_debut_preparation: string | null;
  temps_vidange: string | null;
  date_fabrication_conditionnement: string | null;
};

// Meme table que fetchRapportsCout mais SANS filtre sur un article - une
// machine Energie (groupe electrogene...) alimente plusieurs machines a la
// fois, donc "combien de machines actives ce jour-la" doit compter TOUTES
// les machines de l'usine ce jour-la, pas seulement celles de l'article en
// cours de calcul.
async function fetchAllRapportsForEnergie(): Promise<RapportEnergieRow[]> {
  const rows: RapportEnergieRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select("programme_ligne_id, machine, temps_debut_preparation, temps_vidange, date_fabrication_conditionnement")
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as RapportEnergieRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Pour chaque machine Energie et chaque jour, quelles machines (leur id)
// ont reellement tourne ce jour-la (meme condition "a un temps enregistre"
// que le calcul de cout normal ci-dessous) - sert de diviseur au cout de la
// machine Energie ce jour-la (voir addEnergieShare). cartonEntriesGlobal =
// TOUTES les fournees Conditionnement de l'usine (voir fetchCartonEntriesTemps
// sans ligneIds), meme portee globale que rapports pour la Fabrication.
function buildActiveMachinesByEnergieAndDate(
  rapports: RapportEnergieRow[],
  cartonEntriesGlobal: CartonEntryTempsRow[],
  chaineByLigneId: Map<number, string | null>,
  machineByName: Map<string, MachineRow>
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();

  function markActive(machine: MachineRow | null | undefined, date: string | null) {
    if (!machine || !date) return;
    for (const energieId of machine.energie_machine_ids ?? []) {
      const key = `${energieId}::${date}`;
      const set = map.get(key) ?? new Set<number>();
      set.add(machine.id);
      map.set(key, set);
    }
  }

  for (const rapport of rapports) {
    const date = rapport.date_fabrication_conditionnement;
    if (!date) continue;

    if (rapport.temps_debut_preparation && rapport.temps_vidange) {
      const machine = rapport.machine ? machineByName.get(normalizeMachineName(rapport.machine)) : null;
      markActive(machine, date);
    }
  }

  for (const entry of cartonEntriesGlobal) {
    if (!entry.temps_demarage_lot || !entry.temps_arret_batch) continue;
    const chaine = entry.chaine || chaineByLigneId.get(entry.programme_ligne_id);
    const machine = chaine ? machineByName.get(normalizeMachineName(chaine)) : null;
    markActive(machine, entry.date_jour);
  }

  return map;
}

// Part du cout d'une machine Energie partagee (ex: groupe electrogene
// alimentant 10 machines) attribuee a CETTE machine pour CE jour : chaque
// source de consommation qu'elle a (kW electrique, gaz, gasoil - une
// machine Energie peut cumuler plusieurs, ex: un groupe electrogene tourne
// au gasoil mais chauffe aussi au gaz) est divisee par le nombre de
// machines actives ce jour-la, x les heures de CETTE machine, x son propre
// prix (prix_kwh/prix_gaz/prix_gasoil du mois) - les 3 sont sommees.
// S'AJOUTE au cout electrique propre de la machine (consommation_electrique_kw),
// ne le remplace pas. Une machine peut dependre de PLUSIEURS machines
// Energie a la fois (ex: un groupe electrogene general + un compresseur
// d'air dedie) - chacune contribue sa propre part independamment, sommees
// ici.
function computeEnergieShareCout(
  machine: MachineRow | null | undefined,
  heures: number,
  date: string | null,
  prixMois: PrixMoisRow | undefined,
  energieMachineById: Map<number, MachineRow>,
  activeMachinesByEnergieAndDate: Map<string, Set<number>>,
  motifs: string[]
): number {
  if (!machine || !date) return 0;
  const energieIds = machine.energie_machine_ids ?? [];
  if (energieIds.length === 0) return 0;

  let total = 0;
  for (const energieId of energieIds) {
    const energieMachine = energieMachineById.get(energieId);
    if (!energieMachine) {
      motifs.push(`Machine Energie liee a "${machine.nom}" introuvable.`);
      continue;
    }

    const activeCount = Math.max(1, activeMachinesByEnergieAndDate.get(`${energieId}::${date}`)?.size ?? 1);
    let uneSourceUtilisee = false;

    const sources: { conso: number | null; prix: number | null; label: string }[] = [
      { conso: energieMachine.consommation_electrique_kw, prix: prixMois?.prix_kwh ?? null, label: "kWh" },
      { conso: energieMachine.consommation_gaz_litres_heure, prix: prixMois?.prix_gaz ?? null, label: "gaz" },
      { conso: energieMachine.consommation_gasoil_litres_heure, prix: prixMois?.prix_gasoil ?? null, label: "gasoil" },
    ];

    for (const source of sources) {
      if (source.conso === null) continue;
      if (source.prix === null) {
        motifs.push(`Prix ${source.label} non renseigne pour ce mois (machine Energie "${energieMachine.nom}").`);
        continue;
      }
      const part = heures * (source.conso / activeCount);
      total += part * source.prix;
      uneSourceUtilisee = true;
    }

    if (!uneSourceUtilisee && sources.every((s) => s.conso === null)) {
      motifs.push(`Machine Energie "${energieMachine.nom}" sans consommation renseignee (kW, gaz ou gasoil).`);
    }
  }

  return total;
}

type ChargeUsineRow = {
  annee: number;
  mois: number;
  electricite_plastique: number | null;
  electricite_cosmetique: number | null;
  gaz: number | null;
  gasoil_plastique: number | null;
  gasoil_cosmetique: number | null;
  essence: number | null;
  salaire_embauche: number | null;
  salaire_cadre: number | null;
  depense_usine: number | null;
};

async function fetchChargesUsineMap(mois: string[]): Promise<Map<string, ChargeUsineRow>> {
  const map = new Map<string, ChargeUsineRow>();
  if (mois.length === 0) return map;

  const annees = [...new Set(mois.map((m) => Number(m.slice(0, 4))))];
  const { data } = await supabaseServer
    .from("charges_usine")
    .select(
      "annee, mois, electricite_plastique, electricite_cosmetique, gaz, gasoil_plastique, gasoil_cosmetique, essence, salaire_embauche, salaire_cadre, depense_usine"
    )
    .in("annee", annees);

  for (const row of (data ?? []) as ChargeUsineRow[]) {
    map.set(`${row.annee}-${String(row.mois).padStart(2, "0")}`, row);
  }
  return map;
}

// Facture reelle du mois (Charges Usine, deja en FCFA sauf gaz/gasoil/essence
// qui sont en litres x prix du mois) pour electricite+gaz+gasoil+essence.
function factureEnergieMois(charge: ChargeUsineRow | undefined, prixMois: PrixMoisRow | undefined): number {
  if (!charge) return 0;
  const gazCout = prixMois?.prix_gaz != null ? (charge.gaz ?? 0) * prixMois.prix_gaz : 0;
  const gasoilCout =
    prixMois?.prix_gasoil != null
      ? ((charge.gasoil_plastique ?? 0) + (charge.gasoil_cosmetique ?? 0)) * prixMois.prix_gasoil
      : 0;
  const essenceCout = prixMois?.prix_essence != null ? (charge.essence ?? 0) * prixMois.prix_essence : 0;
  return (charge.electricite_plastique ?? 0) + (charge.electricite_cosmetique ?? 0) + gazCout + gasoilCout + essenceCout;
}

// Part de la facture Charges Usine (electricite+gaz+gasoil+essence) qui n'est
// PAS deja attribuee a une machine tracee (kW x heures, voir plus haut) +
// depenses fixes sans equivalent machine (embauche, cadre, depense usine
// generale) - demande explicite : "pour l'electricite/gaz/gazoil/essence il
// faut deduire de total machine consomme par mois d'abord". Les salaires
// journaliers (salaire_journalier_*) sont volontairement EXCLUS ici : ils
// sont deja chiffres plus precisement, poste par poste, via coutJournaliers
// (nb_journaliers x heures reelles x prix_heure_journalier) - les inclure
// ici doublonnerait ce cout.
async function computeChargeGeneraleParJourCarton(
  moisList: string[],
  rapportsEnergie: RapportEnergieRow[],
  cartonEntriesEnergieGlobal: CartonEntryTempsRow[],
  chaineByLigneIdGlobal: Map<number, string | null>,
  machineByName: Map<string, MachineRow>,
  energieMachineById: Map<number, MachineRow>,
  activeMachinesByEnergieAndDate: Map<string, Set<number>>,
  prixMoisByKey: Map<string, PrixMoisRow>
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (moisList.length === 0) return result;

  const [chargesByMois, cartonsGlobal] = await Promise.all([
    fetchChargesUsineMap(moisList),
    fetchAllCartonEntries(),
  ]);

  // Total FCFA deja attribue a des machines tracees (kW x heures + part
  // Energie partagee), toutes machines/articles confondus, regroupe par
  // mois - meme calcul que le poste "Cout electricite" plus bas, en portee
  // globale usine pour pouvoir le deduire de la facture reelle du mois.
  const machineTotalParMois = new Map<string, number>();
  function addMachineCout(machineNom: string | null, heures: number, date: string | null) {
    if (!date) return;
    const mois = moisDe(date);
    const anneeRef = Number(date.slice(0, 4));
    const prixMois = prixMoisByKey.get(mois);
    const machine = machineNom ? machineByName.get(normalizeMachineName(machineNom)) : null;
    if (!machine) return;
    let cout = 0;
    if (machine.consommation_electrique_kw !== null && prixMois?.prix_kwh != null) {
      cout += machine.consommation_electrique_kw * heures * prixMois.prix_kwh;
    }
    // Conso gaz/gasoil PROPRE a la machine (pas via une machine Energie liee,
    // deja geree par computeEnergieShareCout plus bas) - une machine peut
    // bruler directement du gaz/gasoil sans passer par un chaudier partage.
    if (machine.consommation_gaz_litres_heure !== null && prixMois?.prix_gaz != null) {
      cout += machine.consommation_gaz_litres_heure * heures * prixMois.prix_gaz;
    }
    if (machine.consommation_gasoil_litres_heure !== null && prixMois?.prix_gasoil != null) {
      cout += machine.consommation_gasoil_litres_heure * heures * prixMois.prix_gasoil;
    }
    cout += computeEnergieShareCout(machine, heures, date, prixMois, energieMachineById, activeMachinesByEnergieAndDate, []);
    if (cout > 0) {
      machineTotalParMois.set(mois, (machineTotalParMois.get(mois) ?? 0) + cout);
    }
    void anneeRef;
  }

  for (const rapport of rapportsEnergie) {
    if (!rapport.temps_debut_preparation || !rapport.temps_vidange || !rapport.date_fabrication_conditionnement) continue;
    const minutes = ddmmHhmmDiffMinutes(
      rapport.temps_debut_preparation,
      rapport.temps_vidange,
      Number(rapport.date_fabrication_conditionnement.slice(0, 4))
    );
    if (minutes === null) continue;
    addMachineCout(rapport.machine, minutes / 60, rapport.date_fabrication_conditionnement);
  }
  for (const entry of cartonEntriesEnergieGlobal) {
    if (!entry.temps_demarage_lot || !entry.temps_arret_batch) continue;
    const minutes = hhmmDiffMinutes(entry.temps_demarage_lot, entry.temps_arret_batch);
    const chaine = entry.chaine || chaineByLigneIdGlobal.get(entry.programme_ligne_id) || null;
    addMachineCout(chaine, minutes / 60, entry.date_jour);
  }

  // Jours travailles + cartons produits par jour, TOUTE l'usine confondue
  // (tous articles) - "jour travaille" = un jour ou du carton a reellement
  // ete produit (pas de champ de saisie manuel dedie).
  const cartonsParJour = new Map<string, number>();
  const joursParMois = new Map<string, Set<string>>();
  for (const entry of cartonsGlobal) {
    const quantite = Number(entry.quantite ?? 0);
    if (quantite <= 0) continue;
    cartonsParJour.set(entry.date_jour, (cartonsParJour.get(entry.date_jour) ?? 0) + quantite);
    const mois = moisDe(entry.date_jour);
    const set = joursParMois.get(mois) ?? new Set<string>();
    set.add(entry.date_jour);
    joursParMois.set(mois, set);
  }

  const chargeParJourParMois = new Map<string, number>();
  for (const mois of moisList) {
    const charge = chargesByMois.get(mois);
    const prixMois = prixMoisByKey.get(mois);
    const factureEnergie = factureEnergieMois(charge, prixMois);
    const machineTotal = machineTotalParMois.get(mois) ?? 0;
    const resteEnergie = Math.max(0, factureEnergie - machineTotal);
    const chargesFixes = (charge?.salaire_embauche ?? 0) + (charge?.salaire_cadre ?? 0) + (charge?.depense_usine ?? 0);
    const totalGeneral = resteEnergie + chargesFixes;
    const joursTravail = joursParMois.get(mois)?.size ?? 0;
    if (joursTravail > 0 && totalGeneral > 0) {
      chargeParJourParMois.set(mois, totalGeneral / joursTravail);
    }
  }

  for (const [date, nbCarton] of cartonsParJour.entries()) {
    const chargeJour = chargeParJourParMois.get(moisDe(date));
    if (chargeJour && nbCarton > 0) {
      result.set(date, chargeJour / nbCarton);
    }
  }

  return result;
}

// Un code peut declarer avoir REUTILISE du vrac recupere d'un code anterieur
// (qt_vrac_recupere/code_vrac_recupere sur production_rapports, saisis au
// rapport Fabrication - voir LotSearchField, restreint aux vrais lots PF-vrac
// deja credites en stock via un test labo "a recuperer") - demande
// explicite : ce kg ne doit pas etre compte comme de la MP neuve pour ce
// code (deja payee lors de la fabrication SOURCE), le cout correspondant
// doit etre TRANSFERE de la source vers ce code, pas duplique. Best-effort
// sur un seul niveau (la source elle-meme n'est pas re-ajustee si elle a
// aussi ses propres recuperations) - une source introuvable ou sans
// vrac_fabrique connu est signalee et simplement ignoree (le kg recupere
// reste alors compte comme MP neuve, jamais un cout invente a sa place).
async function computeCoutTransfereRecuperation(
  rapportsPertinents: RapportCoutRow[],
  vracArticleId: number
): Promise<{ qtRecupereTotal: number; coutTransfereTotal: number; incertaines: LigneIncertaine[] }> {
  const recuperations = rapportsPertinents.filter(
    (r) => r.qt_vrac_recupere && r.qt_vrac_recupere > 0 && r.code_vrac_recupere
  );
  if (recuperations.length === 0) {
    return { qtRecupereTotal: 0, coutTransfereTotal: 0, incertaines: [] };
  }

  const codesSource = [...new Set(recuperations.map((r) => r.code_vrac_recupere as string))];
  const { data: sourcesData } = await supabaseServer
    .from("production_rapports")
    .select("code, vrac_fabrique")
    .in("code", codesSource);
  const vracFabriqueByCode = new Map(
    ((sourcesData ?? []) as { code: string; vrac_fabrique: number | null }[]).map((r) => [r.code, r.vrac_fabrique])
  );

  let qtRecupereTotal = 0;
  let coutTransfereTotal = 0;
  const incertaines: LigneIncertaine[] = [];
  const coutParKgCache = new Map<string, number | null>();

  for (const r of recuperations) {
    const qt = Number(r.qt_vrac_recupere ?? 0);
    const codeSource = r.code_vrac_recupere as string;
    qtRecupereTotal += qt;

    let coutParKgSource = coutParKgCache.get(codeSource);
    if (coutParKgSource === undefined) {
      const vracFabriqueSource = vracFabriqueByCode.get(codeSource) ?? null;
      coutParKgSource =
        vracFabriqueSource && vracFabriqueSource > 0
          ? (await fetchCoutVracParKg(vracArticleId, vracFabriqueSource)).coutParKg
          : null;
      coutParKgCache.set(codeSource, coutParKgSource);
    }

    if (coutParKgSource === null) {
      incertaines.push({
        ligneId: r.programme_ligne_id,
        code: r.code,
        motifs: [
          `Recuperation de ${qt} kg depuis le code "${codeSource}" : cout source introuvable, compte comme MP neuve a la place.`,
        ],
      });
      continue;
    }
    coutTransfereTotal += qt * coutParKgSource;
  }

  return { qtRecupereTotal, coutTransfereTotal, incertaines };
}

export async function computeCoutReelArticle(
  articleId: number,
  periode: CoutReelPeriode
): Promise<CoutReelResult> {
  const article = await fetchArticle(articleId);
  if (!article) {
    throw new Error("Article introuvable.");
  }

  const nature: "vrac" | "fini" = article.nature === "vrac" ? "vrac" : "fini";
  const uniteQuantite: "kg" | "carton" = nature === "vrac" ? "kg" : "carton";

  const lignesProgramme = await fetchProgrammeLignesForArticle(articleId);
  const ligneIds = lignesProgramme.map((l) => l.id);
  const chaineByLigneId = new Map(lignesProgramme.map((l) => [l.id, l.chaine]));

  const lignesIncertaines: LigneIncertaine[] = [];
  const detailParMoisMap = new Map<string, { quantite: number; coutTotal: number }>();

  if (ligneIds.length === 0) {
    return {
      articleId,
      nomArticle: article.nom_article,
      nature,
      quantiteTotaleProduite: 0,
      uniteQuantite,
      coutVracReel: null,
      coutConditionnementReel: null,
      coutElectricite: 0,
      coutJournaliers: 0,
      coutChargeGenerale: 0,
      coutTotal: 0,
      coutParCarton: null,
      coutParPiece: null,
      coutParGramme: null,
      prixVenteParGramme: null,
      margeParGramme: null,
      margeTotale: null,
      detailParMois: [],
      lignesIncertaines: [],
    };
  }

  // Quantite reellement produite : vrac fabrique pour un article de nature
  // "vrac", sinon TOUJOURS les cartons du Conditionnement (jamais
  // l'Emballage, decision actee avec l'utilisateur).
  const entriesRaw =
    nature === "vrac" ? await fetchAllVracEntries(ligneIds) : await fetchAllCartonEntries(ligneIds);
  const entries = entriesRaw.filter(
    (e) => matchesPeriode(e.date_jour, periode) && (!periode.code || e.code === periode.code)
  );
  const quantiteTotaleProduite = entries.reduce((sum, e) => sum + Number(e.quantite ?? 0), 0);

  // Rapports des codes qui ont reellement produit sur la periode (memes
  // entrees que ci-dessus) - deplace avant le cout vrac car necessaire pour
  // detecter les recuperations (qt_vrac_recupere/code_vrac_recupere) avant
  // meme de chiffrer le vrac ; reutilise plus bas pour electricite/journaliers.
  const codeKeys = new Set(entries.map((e) => `${e.programme_ligne_id}::${e.code}`));
  const rapports = await fetchRapportsCout(ligneIds);
  const rapportsPertinents = rapports.filter((r) => codeKeys.has(`${r.programme_ligne_id}::${r.code}`));

  // Cout vrac/conditionnement REEL = ratio de la recette (deja base sur les
  // vrais prix MP moyens ponderes) x quantite REELLEMENT produite - pas la
  // quantite theorique du lot (decision actee avec l'utilisateur). Calcule
  // aussi un cout PAR UNITE (kg ou carton, vrac+conditionnement combines)
  // pour pouvoir l'attribuer au mois de chaque entree reelle dans
  // detailParMois juste apres.
  let coutVracReel: number | null = null;
  let coutConditionnementReel: number | null = null;
  let coutParUnite: number | null = null;

  const entriesPourTrace = entries.map((e) => ({
    programme_ligne_id: e.programme_ligne_id,
    code: e.code,
    quantite: Number(e.quantite ?? 0),
  }));

  if (nature === "vrac") {
    const trace = await fetchCoutReelTraceParStage(entriesPourTrace, "pesage");

    const { qtRecupereTotal, coutTransfereTotal, incertaines: incertainesRecup } =
      await computeCoutTransfereRecuperation(rapportsPertinents, articleId);
    lignesIncertaines.push(...incertainesRecup);

    // La partie non tracee (systeme trop ancien, aucune reservation
    // retrouvee) se rabat sur l'estimation FEFO - jamais la partie deja
    // tracee, qui reste au vrai cout retrouve par code.
    const quantiteFraiche = Math.max(0, trace.quantiteNonTracee - qtRecupereTotal);
    const coutVrac = trace.quantiteNonTracee > 0 ? await fetchCoutVracParKg(articleId, quantiteFraiche) : { coutParKg: null };
    const coutVracFallback = coutVrac.coutParKg !== null ? coutVrac.coutParKg * quantiteFraiche : null;

    coutVracReel =
      trace.quantiteTracee > 0 || coutVracFallback !== null || coutTransfereTotal > 0
        ? trace.coutTotal + (coutVracFallback ?? 0) + coutTransfereTotal
        : null;
    coutParUnite = coutVracReel !== null && quantiteTotaleProduite > 0 ? coutVracReel / quantiteTotaleProduite : null;
    if (trace.quantiteNonTracee > 0 && coutVrac.coutParKg === null) {
      lignesIncertaines.push({
        ligneId: 0,
        code: "",
        motifs: ["Cout par kg du vrac inconnu pour une partie non tracee (aucun lot MP avec un prix connu pour cette recette)."],
      });
    }
    if (trace.certainesSansPrix) {
      lignesIncertaines.push({ ligneId: 0, code: "", motifs: ["Certaines matieres tracees n'ont pas de prix connu - cout partiel."] });
    }
  } else {
    const vracArticleId = await resolveVracArticleId(articleId);
    const traceConditionnement = await fetchCoutReelTraceParStage(entriesPourTrace, "salle_conditionnement");
    const { coutConditionnementParCarton, qtVracParCarton, lignesSansPrixConditionnement } =
      await fetchRatiosConditionnement(article, quantiteTotaleProduite);

    const coutConditionnementFallback =
      traceConditionnement.quantiteNonTracee > 0 && coutConditionnementParCarton !== null
        ? coutConditionnementParCarton * traceConditionnement.quantiteNonTracee
        : null;
    coutConditionnementReel =
      traceConditionnement.quantiteTracee > 0 || coutConditionnementFallback !== null
        ? traceConditionnement.coutTotal + (coutConditionnementFallback ?? 0)
        : null;
    if (traceConditionnement.quantiteNonTracee > 0 && coutConditionnementParCarton === null) {
      lignesIncertaines.push({
        ligneId: 0,
        code: "",
        motifs: ["Cout de conditionnement inconnu pour une partie non tracee (quantite_recette_base non renseignee)."],
      });
    } else if (lignesSansPrixConditionnement || traceConditionnement.certainesSansPrix) {
      lignesIncertaines.push({
        ligneId: 0,
        code: "",
        motifs: ["Certains articles de conditionnement n'ont pas de prix connu - cout partiel."],
      });
    }

    let coutVracParCarton: number | null = null;
    if (vracArticleId) {
      const traceVracPrecurseur = await fetchCoutReelTraceParStage(entriesPourTrace, "pesage");

      // Vrac recupere reutilise (voir computeCoutTransfereRecuperation) :
      // n'est jamais de la MP neuve pour CE code, deduit de la quantite a
      // chiffrer en frais - son cout (deja paye a la fabrication SOURCE) est
      // transfere tel quel plutot que recalcule.
      const { qtRecupereTotal, coutTransfereTotal, incertaines: incertainesRecup } =
        await computeCoutTransfereRecuperation(rapportsPertinents, vracArticleId);
      lignesIncertaines.push(...incertainesRecup);

      // Seule la portion NON tracee (par code) a besoin d'une estimation FEFO
      // - convertie en kg de vrac via le meme ratio theorique que la
      // recette, applique uniquement au nombre de cartons non traces.
      const qtVracFallbackBrute =
        qtVracParCarton !== null ? qtVracParCarton * traceVracPrecurseur.quantiteNonTracee : undefined;
      const qtVracReelleNecessaire =
        qtVracFallbackBrute !== undefined ? Math.max(0, qtVracFallbackBrute - qtRecupereTotal) : undefined;

      const coutVrac =
        traceVracPrecurseur.quantiteNonTracee > 0
          ? await fetchCoutVracParKg(vracArticleId, qtVracReelleNecessaire)
          : { coutParKg: null };
      const coutVracFallback =
        coutVrac.coutParKg !== null && qtVracReelleNecessaire !== undefined
          ? coutVrac.coutParKg * qtVracReelleNecessaire
          : null;
      coutVracReel =
        traceVracPrecurseur.quantiteTracee > 0 || coutVracFallback !== null || coutTransfereTotal > 0
          ? traceVracPrecurseur.coutTotal + (coutVracFallback ?? 0) + coutTransfereTotal
          : null;
      coutVracParCarton =
        coutVracReel !== null && quantiteTotaleProduite > 0 ? coutVracReel / quantiteTotaleProduite : null;
      if (traceVracPrecurseur.quantiteNonTracee > 0 && (coutVrac.coutParKg === null || qtVracParCarton === null)) {
        lignesIncertaines.push({
          ligneId: 0,
          code: "",
          motifs: ["Cout du vrac utilise inconnu pour une partie non tracee (prix MP ou quantite de vrac necessaire manquants)."],
        });
      }
      if (traceVracPrecurseur.certainesSansPrix) {
        lignesIncertaines.push({ ligneId: 0, code: "", motifs: ["Certaines matieres du vrac tracees n'ont pas de prix connu - cout partiel."] });
      }
    }

    coutParUnite =
      coutConditionnementParCarton !== null || coutVracParCarton !== null
        ? (coutConditionnementParCarton ?? 0) + (coutVracParCarton ?? 0)
        : null;
  }

  for (const entry of entries) {
    const quantite = Number(entry.quantite ?? 0);
    const mois = moisDe(entry.date_jour);
    const current = detailParMoisMap.get(mois) ?? { quantite: 0, coutTotal: 0 };
    current.quantite += quantite;
    current.coutTotal += coutParUnite !== null ? coutParUnite * quantite : 0;
    detailParMoisMap.set(mois, current);
  }

  // Electricite + journaliers : uniquement pour les lots (programme_ligne,
  // code) qui ont reellement produit sur la periode (codeKeys/rapportsPertinents
  // deja calcules plus haut, avant le cout vrac).
  const cartonEntriesTemps = await fetchCartonEntriesTemps(ligneIds);
  const cartonEntriesPertinents = cartonEntriesTemps.filter((e) => matchesPeriode(e.date_jour, periode));
  const emballageEntriesTemps = await fetchEmballageEntriesTemps(ligneIds);
  const emballageEntriesPertinentes = emballageEntriesTemps.filter((e) => matchesPeriode(e.date_jour, periode));

  const { data: machinesData } = await supabaseServer
    .from("machines")
    .select(
      "id, nom, type, consommation_electrique_kw, consommation_gaz_litres_heure, consommation_gasoil_litres_heure, energie_machine_ids"
    );
  const allMachines = (machinesData ?? []) as MachineRow[];
  const machineByName = new Map(allMachines.map((m) => [normalizeMachineName(m.nom), m]));
  const energieMachineById = new Map(allMachines.map((m) => [m.id, m]));

  // Diviseur des machines Energie partagees (voir computeEnergieShareCout) -
  // portee volontairement GLOBALE (toute l'usine, pas juste cet article),
  // fetch une seule fois par appel.
  const [rapportsEnergie, cartonEntriesEnergieGlobal, programmeLignesChaineGlobal] = await Promise.all([
    fetchAllRapportsForEnergie(),
    fetchCartonEntriesTemps(),
    fetchAllProgrammeLignesChaine(),
  ]);
  const chaineByLigneIdGlobal = new Map(programmeLignesChaineGlobal.map((l) => [l.id, l.chaine]));
  const activeMachinesByEnergieAndDate = buildActiveMachinesByEnergieAndDate(
    rapportsEnergie,
    cartonEntriesEnergieGlobal,
    chaineByLigneIdGlobal,
    machineByName
  );

  const moisUtiles = [
    ...new Set([
      ...rapportsPertinents.map((r) => r.date_fabrication_conditionnement).filter((d): d is string => !!d),
      ...cartonEntriesPertinents.map((e) => e.date_jour),
      ...entries.map((e) => e.date_jour),
    ]),
  ].map((d) => moisDe(d));
  const prixMoisByKey = await fetchPrixMoisMap(moisUtiles);

  let coutElectricite = 0;
  let coutJournaliers = 0;

  for (const rapport of rapportsPertinents) {
    const anneeRef = rapport.date_fabrication_conditionnement
      ? Number(rapport.date_fabrication_conditionnement.slice(0, 4))
      : new Date().getFullYear();
    const prixMois = rapport.date_fabrication_conditionnement
      ? prixMoisByKey.get(moisDe(rapport.date_fabrication_conditionnement))
      : undefined;
    const motifs: string[] = [];
    let coutRapportCourant = 0;

    // Poste Fabrication (temps "JJ/MM HH:MM" - peut s'etaler sur plusieurs
    // jours). Temps machine = tout l'intervalle Debut preparation -> Vidange
    // (decision actee, y compris l'attente du test labo).
    if (rapport.temps_debut_preparation && rapport.temps_vidange) {
      const minutes = ddmmHhmmDiffMinutes(rapport.temps_debut_preparation, rapport.temps_vidange, anneeRef);
      if (minutes === null) {
        motifs.push("Temps de fabrication invalide.");
      } else {
        const heures = minutes / 60;
        const machine = rapport.machine ? machineByName.get(normalizeMachineName(rapport.machine)) : null;
        if (!machine) {
          motifs.push(`Machine de fabrication "${rapport.machine || "-"}" introuvable.`);
        } else {
          if (machine.consommation_electrique_kw === null) {
            motifs.push(`Machine de fabrication "${rapport.machine}" sans kW renseigne.`);
          } else if (!prixMois || prixMois.prix_kwh === null) {
            motifs.push("Prix electricite (par kWh) non renseigne pour ce mois.");
          } else {
            const cout = machine.consommation_electrique_kw * heures * prixMois.prix_kwh;
            coutElectricite += cout;
            coutRapportCourant += cout;
          }
          // Conso gaz/gasoil PROPRE a la machine (independante d'une machine
          // Energie liee, voir computeEnergieShareCout plus bas).
          if (machine.consommation_gaz_litres_heure !== null && prixMois?.prix_gaz != null) {
            const cout = machine.consommation_gaz_litres_heure * heures * prixMois.prix_gaz;
            coutElectricite += cout;
            coutRapportCourant += cout;
          }
          if (machine.consommation_gasoil_litres_heure !== null && prixMois?.prix_gasoil != null) {
            const cout = machine.consommation_gasoil_litres_heure * heures * prixMois.prix_gasoil;
            coutElectricite += cout;
            coutRapportCourant += cout;
          }
        }

        // Part de machine Energie partagee (voir computeEnergieShareCout) -
        // independante du kW propre de la machine ci-dessus, s'y ajoute.
        const energieCoutFab = computeEnergieShareCout(
          machine,
          heures,
          rapport.date_fabrication_conditionnement,
          prixMois,
          energieMachineById,
          activeMachinesByEnergieAndDate,
          motifs
        );
        if (energieCoutFab > 0) {
          coutElectricite += energieCoutFab;
          coutRapportCourant += energieCoutFab;
        }

        if (rapport.nb_journaliers_fabrication === null) {
          motifs.push("Nombre de journaliers Fabrication non renseigne.");
        } else if (!prixMois || prixMois.prix_heure_journalier === null) {
          motifs.push("Prix de l'heure journaliere non renseigne pour ce mois.");
        } else {
          const cout = rapport.nb_journaliers_fabrication * heures * prixMois.prix_heure_journalier;
          coutJournaliers += cout;
          coutRapportCourant += cout;
        }
      }
    }

    if (motifs.length > 0) {
      lignesIncertaines.push({ ligneId: rapport.programme_ligne_id, code: rapport.code, motifs });
    }

    if (rapport.date_fabrication_conditionnement && coutRapportCourant > 0) {
      const mois = moisDe(rapport.date_fabrication_conditionnement);
      const current = detailParMoisMap.get(mois) ?? { quantite: 0, coutTotal: 0 };
      current.coutTotal += coutRapportCourant;
      detailParMoisMap.set(mois, current);
    }
  }

  // Poste Conditionnement (temps "HH:MM" simple) - une fournee reelle a la
  // fois (production_carton_entries), jamais l'ancien champ partage sur
  // production_rapports (obsolete depuis add_conditionnement_fields_to_carton_entries.sql,
  // voir types CartonEntryTempsRow plus haut). Machine rapprochee via
  // programme_lignes.chaine (pas de champ machine libre pour ce poste).
  for (const entry of cartonEntriesPertinents) {
    if (!entry.temps_demarage_lot || !entry.temps_arret_batch) continue;

    const prixMois = prixMoisByKey.get(moisDe(entry.date_jour));
    const motifs: string[] = [];
    let coutEntreeCourant = 0;

    const minutes = hhmmDiffMinutes(entry.temps_demarage_lot, entry.temps_arret_batch);
    const heures = minutes / 60;
    const chaine = entry.chaine || chaineByLigneId.get(entry.programme_ligne_id);
    const machine = chaine ? machineByName.get(normalizeMachineName(chaine)) : null;
    if (!machine) {
      motifs.push(`Machine de conditionnement "${chaine || "-"}" introuvable.`);
    } else {
      if (machine.consommation_electrique_kw === null) {
        motifs.push(`Machine de conditionnement "${chaine}" sans kW renseigne.`);
      } else if (!prixMois || prixMois.prix_kwh === null) {
        motifs.push("Prix electricite (par kWh) non renseigne pour ce mois.");
      } else {
        const cout = machine.consommation_electrique_kw * heures * prixMois.prix_kwh;
        coutElectricite += cout;
        coutEntreeCourant += cout;
      }
      // Conso gaz/gasoil PROPRE a la machine (independante d'une machine
      // Energie liee, voir computeEnergieShareCout plus bas).
      if (machine.consommation_gaz_litres_heure !== null && prixMois?.prix_gaz != null) {
        const cout = machine.consommation_gaz_litres_heure * heures * prixMois.prix_gaz;
        coutElectricite += cout;
        coutEntreeCourant += cout;
      }
      if (machine.consommation_gasoil_litres_heure !== null && prixMois?.prix_gasoil != null) {
        const cout = machine.consommation_gasoil_litres_heure * heures * prixMois.prix_gasoil;
        coutElectricite += cout;
        coutEntreeCourant += cout;
      }
    }

    // Part de machine Energie partagee (voir computeEnergieShareCout) -
    // independante du kW propre de la machine ci-dessus, s'y ajoute.
    const energieCoutCond = computeEnergieShareCout(
      machine,
      heures,
      entry.date_jour,
      prixMois,
      energieMachineById,
      activeMachinesByEnergieAndDate,
      motifs
    );
    if (energieCoutCond > 0) {
      coutElectricite += energieCoutCond;
      coutEntreeCourant += energieCoutCond;
    }

    if (entry.nb_journaliers_conditionnement === null) {
      motifs.push("Nombre de journaliers Conditionnement non renseigne.");
    } else if (!prixMois || prixMois.prix_heure_journalier === null) {
      motifs.push("Prix de l'heure journaliere non renseigne pour ce mois.");
    } else {
      const cout = entry.nb_journaliers_conditionnement * heures * prixMois.prix_heure_journalier;
      coutJournaliers += cout;
      coutEntreeCourant += cout;
    }

    if (motifs.length > 0) {
      lignesIncertaines.push({ ligneId: entry.programme_ligne_id, code: entry.code, motifs });
    }

    if (coutEntreeCourant > 0) {
      const mois = moisDe(entry.date_jour);
      const current = detailParMoisMap.get(mois) ?? { quantite: 0, coutTotal: 0 };
      current.coutTotal += coutEntreeCourant;
      detailParMoisMap.set(mois, current);
    }
  }

  // Poste Emballage (temps "HH:MM" simple, meme motif que Conditionnement
  // ci-dessus) - journaliers uniquement, pas d'electricite (pas de machine
  // tracee pour ce poste).
  for (const entry of emballageEntriesPertinentes) {
    if (!entry.emballage_temps_demarrer || !entry.emballage_temps_arret) continue;

    const prixMois = prixMoisByKey.get(moisDe(entry.date_jour));
    const motifs: string[] = [];
    let coutEntreeCourant = 0;

    const minutes = hhmmDiffMinutes(entry.emballage_temps_demarrer, entry.emballage_temps_arret);
    const heures = minutes / 60;

    if (entry.nb_journaliers_emballage === null) {
      motifs.push("Nombre de journaliers Emballage non renseigne.");
    } else if (!prixMois || prixMois.prix_heure_journalier === null) {
      motifs.push("Prix de l'heure journaliere non renseigne pour ce mois.");
    } else {
      const cout = entry.nb_journaliers_emballage * heures * prixMois.prix_heure_journalier;
      coutJournaliers += cout;
      coutEntreeCourant += cout;
    }

    if (motifs.length > 0) {
      lignesIncertaines.push({ ligneId: entry.programme_ligne_id, code: entry.code, motifs });
    }

    if (coutEntreeCourant > 0) {
      const mois = moisDe(entry.date_jour);
      const current = detailParMoisMap.get(mois) ?? { quantite: 0, coutTotal: 0 };
      current.coutTotal += coutEntreeCourant;
      detailParMoisMap.set(mois, current);
    }
  }

  // Charge generale (electricite/gaz/gasoil/essence non attribues a une
  // machine tracee + embauche/cadre/depense usine), repartie par jour
  // travaille puis par carton produit ce jour - uniquement pour les produits
  // finis (le vrac n'a pas de notion de "carton"). Voir
  // computeChargeGeneraleParJourCarton pour le detail du calcul.
  let coutChargeGenerale = 0;
  if (nature === "fini") {
    const chargeGeneraleParJourCarton = await computeChargeGeneraleParJourCarton(
      moisUtiles,
      rapportsEnergie,
      cartonEntriesEnergieGlobal,
      chaineByLigneIdGlobal,
      machineByName,
      energieMachineById,
      activeMachinesByEnergieAndDate,
      prixMoisByKey
    );

    for (const entry of entries) {
      const quantite = Number(entry.quantite ?? 0);
      const tauxJour = chargeGeneraleParJourCarton.get(entry.date_jour);
      if (tauxJour === undefined) continue;
      const cout = tauxJour * quantite;
      coutChargeGenerale += cout;
      const mois = moisDe(entry.date_jour);
      const current = detailParMoisMap.get(mois) ?? { quantite: 0, coutTotal: 0 };
      current.coutTotal += cout;
      detailParMoisMap.set(mois, current);
    }
  }

  const coutTotal =
    (coutVracReel ?? 0) + (coutConditionnementReel ?? 0) + coutElectricite + coutJournaliers + coutChargeGenerale;

  const coutParCarton =
    nature === "fini" && quantiteTotaleProduite > 0 ? coutTotal / quantiteTotaleProduite : null;
  const coutParPiece =
    coutParCarton !== null && article.piece_par_carton ? coutParCarton / article.piece_par_carton : null;
  const coutParGramme =
    nature === "vrac"
      ? quantiteTotaleProduite > 0
        ? coutTotal / (quantiteTotaleProduite * 1000)
        : null
      : coutParPiece !== null && article.contenance
        ? coutParPiece / (article.contenance * 1000)
        : null;

  // Prix de vente au gramme + marge - meme decoupage carton -> piece ->
  // gramme que le cout, a partir du prix de vente standard de l'article
  // (articles.prix_vente, prix du CARTON pour un produit fini).
  const prixVenteParPiece =
    nature === "fini" && article.prix_vente && article.piece_par_carton
      ? article.prix_vente / article.piece_par_carton
      : null;
  const prixVenteParGramme =
    nature === "vrac"
      ? null
      : prixVenteParPiece !== null && article.contenance
        ? prixVenteParPiece / (article.contenance * 1000)
        : null;
  const margeParGramme =
    prixVenteParGramme !== null && coutParGramme !== null ? prixVenteParGramme - coutParGramme : null;
  const margeTotale =
    nature === "fini" && article.prix_vente && quantiteTotaleProduite > 0
      ? article.prix_vente * quantiteTotaleProduite - coutTotal
      : null;

  const detailParMois = [...detailParMoisMap.entries()]
    .map(([mois, v]) => {
      const vente = nature === "fini" && article.prix_vente ? v.quantite * article.prix_vente : null;
      const marge = vente !== null ? vente - v.coutTotal : null;
      return {
        mois,
        quantite: round(v.quantite, 2),
        coutTotal: Math.round(v.coutTotal),
        vente: vente !== null ? Math.round(vente) : null,
        marge: marge !== null ? Math.round(marge) : null,
      };
    })
    .sort((a, b) => a.mois.localeCompare(b.mois));

  return {
    articleId,
    nomArticle: article.nom_article,
    nature,
    quantiteTotaleProduite: round(quantiteTotaleProduite, 2),
    uniteQuantite,
    coutVracReel: coutVracReel !== null ? Math.round(coutVracReel) : null,
    coutConditionnementReel: coutConditionnementReel !== null ? Math.round(coutConditionnementReel) : null,
    coutElectricite: Math.round(coutElectricite),
    coutJournaliers: Math.round(coutJournaliers),
    coutChargeGenerale: Math.round(coutChargeGenerale),
    coutTotal: Math.round(coutTotal),
    coutParCarton,
    coutParPiece,
    coutParGramme,
    prixVenteParGramme,
    margeParGramme,
    margeTotale: margeTotale !== null ? Math.round(margeTotale) : null,
    detailParMois,
    lignesIncertaines,
  };
}
