import { supabaseServer } from "@/lib/supabase-server";
import { hhmmDiffMinutes } from "@/lib/suivi-tirage-time";
import { fetchBlocsHeuresSup, regrouperParChaineJour } from "@/lib/heures-supplementaires";
import {
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllEmballageEntries,
  fetchAllProgrammeLignes,
  fetchAllVracEntries,
  fetchArticleKgFactorsByIds,
  groupCartonEntriesByLigne,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../../../production/suivi/data";
import { lireCartonEntreeProductionParMois } from "@/lib/carton-entree-production";
import { cartonAutomatiquePourMois } from "@/app/charges/carton";
import type { ManuelRow } from "./fields";

// PR4 - Indicateurs Cosmetique : reprend le fichier Excel de suivi ISO
// "Objectif et INDICATEUR PR4 cosmetique.xlsx" (sheet "CALCULE INDICATEUR"),
// formules confirmees une par une avec l'utilisateur. Les 9 indicateurs
// automatisables sont calcules ici depuis les donnees deja suivies dans
// l'ERP (memes calculs que les rapports existants, duplique volontairement
// plutot que partage - meme convention que Rapport Balance Matiere/Ecarts,
// pour ne jamais faire deriver un rapport existant en le touchant).
//
// 4 indicateurs restent hors perimetre pour l'instant (aucune donnee
// source dans l'ERP, l'utilisateur doit encore definir la saisie) : taux
// d'heures supplementaires, taux suivi formation, taux de reclamation
// produit non conforme, respect du delai de livraison.

export const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

export function moisLabel(moisKey: string) {
  const [year, month] = moisKey.split("-");
  const index = Number(month) - 1;
  return `${MOIS_NOMS[index] ?? month} ${year}`;
}

function ligneOwnCodes(ligne: ProgrammeLigneRow): string[] {
  return splitLigneIntoDisplayRows(ligne, "qt_vrac", 0).map((split) => split.displayCode);
}

export function fmt(value: number | null, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

export function fmtPct(value: number | null, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}%`;
}

// ---------------------------------------------------------------------
// Indicateurs 1 & 2 : carton fabrique / carton commande par mois - meme
// agregation (non filtree par statut Termine) que Rapport Carton Mensuel,
// pour que le mois en cours refete la production REELLE deja sortie, pas
// seulement les codes deja cloture. Demande explicite de l'utilisateur :
// l'ancien filtre "codes Termines uniquement" faisait paraitre le mois en
// cours tres en dessous de la realite (ex. 26439 affiche vs 50958 reels en
// septembre, la difference etant tout le carton deja fabrique sur des codes
// pas encore marques Termine).
// ---------------------------------------------------------------------
async function fetchCartonMonthly(): Promise<Map<string, { commande: number; fabrique: number }>> {
  const [{ rows: lignes }, cartonEntries] = await Promise.all([
    fetchAllProgrammeLignes(),
    fetchAllCartonEntries(),
  ]);

  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);
  const lignesWithLot = lignes.filter((ligne) => ligne.numero_lot);
  const byMonth = new Map<string, { commande: number; fabrique: number }>();

  for (const ligne of lignesWithLot) {
    const mois = (ligne.date_jour || "").slice(0, 7);
    if (mois.length !== 7) continue;

    const codes = ligneOwnCodes(ligne);
    const cartonEntriesForLigne = (cartonByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];
    const cartonSplits = splitLigneIntoDisplayRows(ligne, "qt_carton", 0);
    const cartonDemandeByCode = new Map(
      cartonSplits.map((split) => [split.displayCode, split.displayQuantite ?? ligne.qt_carton ?? 0])
    );
    const cartonFabriqueByCode = computeProduitParCode(
      cartonEntriesForLigne,
      codes,
      (code) => cartonDemandeByCode.get(code) ?? 0
    );

    const current = byMonth.get(mois) ?? { commande: 0, fabrique: 0 };
    for (const code of codes) {
      const demande = cartonDemandeByCode.get(code) ?? 0;
      const fabrique = cartonFabriqueByCode.get(code) ?? 0;
      if (demande <= 0 && fabrique <= 0) continue;

      current.commande += demande;
      current.fabrique += fabrique;
    }
    byMonth.set(mois, current);
  }

  return byMonth;
}

// ---------------------------------------------------------------------
// Indicateur 3 : capacite machines Conditionnement uniquement (carte
// "Capacite Conditionnement" du Rapport Capacite Machines, pas la capacite
// globale toutes machines) - PAR MOIS : pour chaque jour ou un programme
// existe (programme_lignes.date_jour), quelle proportion des machines
// Conditionnement a tourne ce jour-la, puis moyenne de ces % journaliers
// sur le mois - un jour sans aucun programme (weekend, ferie) n'entre pas
// dans la moyenne. Meme calcul que app/production/rapport/machines-capacite
// (duplique volontairement, voir note en tete de fichier), historise pour
// tous les mois au lieu d'un instantane limite au mois en cours.
// ---------------------------------------------------------------------
function normalizeMachine(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

async function fetchCapaciteMonthly(): Promise<Map<string, number>> {
  const { data: machinesData } = await supabaseServer.from("machines").select("id, nom, type");
  const machines = (machinesData ?? []) as { id: number; nom: string; type: string | null }[];
  // Une par MACHINE (ligne), jamais dedupliquee par nom normalise - plusieurs
  // machines distinctes partagent parfois le meme nom (ex: "chaine 1" existe
  // sur 3 zones differentes), chacune doit compter separement au denominateur,
  // exactement comme Rapport Capacite Machines. Un Set de noms ici avait fait
  // tomber le denominateur de 41 a 28 machines - bug reel confirme (26% vs
  // 42% pour la meme periode).
  const conditionnementMachines = machines.filter((m) => normalizeMachine(m.type) === "conditionnement");
  if (conditionnementMachines.length === 0) return new Map();

  const lignes: { chaine: string | null; date_jour: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("chaine, date_jour")
      .eq("exclu_rapports", false)
      .not("date_jour", "is", null)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as { chaine: string | null; date_jour: string | null }[];
    lignes.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  // Jours ou un programme existe - N'IMPORTE QUELLE ligne, pas seulement
  // celles avec une chaine renseignee (une ligne Fabrication sans chaine
  // compte quand meme comme "jour travaille") - meme critere que Rapport
  // Capacite Machines, sinon un jour sans AUCUNE ligne a chaine (mais avec
  // de la Fabrication) etait exclu de la moyenne au lieu de compter comme
  // 0% Conditionnement ce jour-la, ce qui gonflait la moyenne a tort (bug
  // reel signale par l'utilisateur : ecart avec Rapport Capacite Machines
  // sur le meme mois).
  const joursAvecProgramme = new Set(lignes.map((l) => l.date_jour).filter((d): d is string => Boolean(d)));

  // Chaines actives distinctes par jour (date_jour).
  const activeChainesByDay = new Map<string, Set<string>>();
  for (const ligne of lignes) {
    const chaine = normalizeMachine(ligne.chaine);
    const day = ligne.date_jour;
    if (!chaine || !day) continue;
    const set = activeChainesByDay.get(day) ?? new Set<string>();
    set.add(chaine);
    activeChainesByDay.set(day, set);
  }

  // % journalier -> regroupe par mois -> moyenne.
  const dailyPctByMonth = new Map<string, number[]>();
  for (const day of joursAvecProgramme) {
    const mois = day.slice(0, 7);
    if (mois.length !== 7) continue;
    const activeChaines = activeChainesByDay.get(day) ?? new Set<string>();
    const activeCount = conditionnementMachines.filter((m) => activeChaines.has(normalizeMachine(m.nom))).length;
    const pct = (activeCount / conditionnementMachines.length) * 100;
    const list = dailyPctByMonth.get(mois) ?? [];
    list.push(pct);
    dailyPctByMonth.set(mois, list);
  }

  const byMonth = new Map<string, number>();
  for (const [mois, pcts] of dailyPctByMonth.entries()) {
    byMonth.set(mois, pcts.reduce((sum, p) => sum + p, 0) / pcts.length);
  }
  return byMonth;
}

// ---------------------------------------------------------------------
// Indicateurs 5 & 6 : Test Labo - preparations totales / a detruire /
// sous derogation par mois - meme logique que Rapport Test Labo.
// ---------------------------------------------------------------------
type TestLaboRow = {
  programme_ligne_id: number;
  code: string;
  disposition_qualite: string | null;
  sous_derogation: boolean | null;
  date_saisie_test_labo: string | null;
  date_prise_echantillon: string | null;
};

async function fetchTestLaboMonthly(): Promise<Map<string, { total: number; aDetruire: number; sousDerogation: number }>> {
  const rowsRaw: TestLaboRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(
        "programme_ligne_id, code, disposition_qualite, sous_derogation, date_saisie_test_labo, date_prise_echantillon"
      )
      .not("utilisateur_test_labo", "is", null)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as TestLaboRow[];
    rowsRaw.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  // Un meme numero de lot (code) peut se retrouver sur plusieurs
  // programme_ligne_id (redispatche vers une autre machine/chaine...) -
  // c'est physiquement le meme lot, jamais 2 preparations distinctes. Meme
  // regle que Rapport Test Labo (app/qualite/rapport/page.tsx) : garde la
  // saisie la plus recente par code.
  const latestByCode = new Map<string, TestLaboRow>();
  for (const r of rowsRaw) {
    const current = latestByCode.get(r.code);
    if (!current || (r.date_saisie_test_labo || "") > (current.date_saisie_test_labo || "")) {
      latestByCode.set(r.code, r);
    }
  }
  const rows = [...latestByCode.values()];

  const ligneIds = [...new Set(rows.map((r) => r.programme_ligne_id))];
  const dateByLigne = new Map<number, string>();
  for (let i = 0; i < ligneIds.length; i += 1000) {
    const chunk = ligneIds.slice(i, i + 1000);
    const { data } = await supabaseServer.from("programme_lignes").select("id, date_jour").in("id", chunk);
    for (const row of (data ?? []) as { id: number; date_jour: string | null }[]) {
      if (row.date_jour) dateByLigne.set(row.id, row.date_jour);
    }
  }

  const byMonth = new Map<string, { total: number; aDetruire: number; sousDerogation: number }>();
  for (const row of rows) {
    // Priorite a la date de prise d'echantillon (saisie reelle du labo) sur
    // la date programmee, meme ordre que Rapport Test Labo - sans ca,
    // les codes dont l'echantillon a ete pris un autre mois que la date de
    // programme atterrissaient dans le mauvais mois ici (bug reel signale
    // par l'utilisateur : 468/117 affiches ici vs 499/131 sur Rapport Test
    // Labo pour le meme mois).
    const date =
      row.date_prise_echantillon ||
      dateByLigne.get(row.programme_ligne_id) ||
      (row.date_saisie_test_labo ? row.date_saisie_test_labo.slice(0, 10) : "");
    const mois = date.slice(0, 7);
    if (mois.length !== 7) continue;

    const current = byMonth.get(mois) ?? { total: 0, aDetruire: 0, sousDerogation: 0 };
    current.total += 1;
    const isADetruire = row.disposition_qualite === "a_detruire";
    const isSousDerogation = !isADetruire && (row.disposition_qualite === "a_recuperer" || Boolean(row.sous_derogation));
    if (isADetruire) current.aDetruire += 1;
    if (isSousDerogation) current.sousDerogation += 1;
    byMonth.set(mois, current);
  }

  return byMonth;
}

// ---------------------------------------------------------------------
// Indicateur 7 : balance matiere - vrac commande vs carton fabrique
// converti en kg ("vrac tire"), par mois - meme logique (union-find +
// cascade famille) que les KPI globaux du Rapport Balance Matiere,
// dupliquee volontairement (meme convention que ce rapport lui-meme vis-a-vis
// de Rapport Ecarts), SAUF le filtre par statut Termine des codes retire ici
// (meme raison que fetchCartonMonthly ci-dessus - le mois en cours doit
// refleter le vrac/carton reellement sorti).
// ---------------------------------------------------------------------
type PoidsReelRow = { programme_ligne_id: number; code: string; poids_reel: number | null };

async function fetchPoidsReelByLigneCode(ligneIds: number[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ligneIds.length === 0) return map;
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select("programme_ligne_id, code, poids_reel")
      .in("programme_ligne_id", ligneIds)
      .not("poids_reel", "is", null)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as PoidsReelRow[];
    for (const row of chunk) {
      if (row.poids_reel !== null && row.poids_reel > 0) {
        map.set(`${row.programme_ligne_id}::${row.code}`, row.poids_reel);
      }
    }
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

function buildLigneRoots(rows: ProgrammeLigneRow[]): Map<number, number> {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const ligne of rows) parent.set(ligne.id, ligne.id);

  const ligneIdsByCode = new Map<string, number[]>();
  for (const ligne of rows) {
    for (const code of ligneOwnCodes(ligne)) {
      const list = ligneIdsByCode.get(code) ?? [];
      list.push(ligne.id);
      ligneIdsByCode.set(code, list);
    }
  }
  for (const ids of ligneIdsByCode.values()) {
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  const rootOf = new Map<number, number>();
  for (const ligne of rows) rootOf.set(ligne.id, find(ligne.id));
  return rootOf;
}

function cascadeFamily(tuples: { key: string; demande: number }[], totalPool: number): Map<string, number> {
  const result = new Map<string, number>();
  let remaining = totalPool;
  tuples.forEach((tuple, index) => {
    const isLast = index === tuples.length - 1;
    const amount = isLast
      ? Math.max(0, remaining)
      : Math.min(Math.max(0, remaining), Math.max(0, tuple.demande));
    result.set(tuple.key, amount);
    remaining -= amount;
  });
  return result;
}

// Cascade UNIQUEMENT la part du pool pas deja attribuee directement par
// computeProduitParCode (entrees qui portent deja le bon programme_ligne_id
// + code) - le reste (entrees historiques en code partage "") continue de
// se repartir par demande, comme avant. Meme correctif que Rapport Balance
// Matiere (app/production/rapport/balance-matiere/page.tsx) : sans ce
// garde-fou, une ligne du groupe SANS AUCUNE entree a elle absorbait a tort
// la production d'une autre ligne du meme groupe partageant ce code.
function residualCascade(
  tuples: { key: string; demande: number; dejaAttribue: number }[],
  totalPool: number
): Map<string, number> {
  const dejaAttribueTotal = tuples.reduce((sum, t) => sum + t.dejaAttribue, 0);
  const residualPool = Math.max(0, totalPool - dejaAttribueTotal);
  const residualByTuple = cascadeFamily(
    tuples.map((t) => ({ key: t.key, demande: Math.max(0, t.demande - t.dejaAttribue) })),
    residualPool
  );
  const result = new Map<string, number>();
  for (const t of tuples) {
    result.set(t.key, t.dejaAttribue + (residualByTuple.get(t.key) ?? 0));
  }
  return result;
}

async function fetchBalanceMatiereMonthly(): Promise<Map<string, { vracCommande: number; cartonFabriqueKg: number }>> {
  const [{ rows: lignes }, vracEntries, cartonEntries, emballageEntries] = await Promise.all([
    fetchAllProgrammeLignes(),
    fetchAllVracEntries(),
    fetchAllCartonEntries(),
    fetchAllEmballageEntries(),
  ]);

  const articleFactors = await fetchArticleKgFactorsByIds(lignes.map((ligne) => ligne.article_id));
  const poidsReelByKey = await fetchPoidsReelByLigneCode(lignes.map((ligne) => ligne.id));
  // Codes marques "Fin programme" a la main (meme source que le Rapport Balance Matiere)
  const codeTermineRows = await fetchAllCodeTermineRows(lignes.map((ligne) => ligne.id));
  const terminatedCodes = new Set(codeTermineRows.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`));

  function sumEntries(entries: { quantite: number }[]) {
    return entries.reduce((sum, entry) => sum + Number(entry.quantite), 0);
  }

  const vracByLigne = groupCartonEntriesByLigne(vracEntries);
  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);
  const emballageByLigne = groupCartonEntriesByLigne(emballageEntries);

  type Base = {
    ligne: ProgrammeLigneRow;
    code: string;
    vracDemande: number;
    vracFabrique: number;
    cartonDemande: number;
    cartonFabrique: number;
    cartonEmballe: number;
  };

  const lignesWithLot = lignes.filter((ligne) => ligne.numero_lot);
  const lignesById = new Map(lignesWithLot.map((ligne) => [ligne.id, ligne]));
  const baseByKey = new Map<string, Base>();

  for (const ligne of lignesWithLot) {
    const codes = ligneOwnCodes(ligne);
    const vracEntriesForLigne = (vracByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];
    const cartonEntriesForLigne = (cartonByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];
    const totalVracFabrique = sumEntries(vracEntriesForLigne);
    const totalCartonFabrique = sumEntries(cartonEntriesForLigne);

    const vracSplits = splitLigneIntoDisplayRows(ligne, "qt_vrac", totalVracFabrique);
    const cartonSplits = splitLigneIntoDisplayRows(ligne, "qt_carton", totalCartonFabrique);
    const vracDemandeByCode = new Map(
      vracSplits.map((split) => [split.displayCode, split.displayQuantite ?? ligne.vrac_a_fabriquer ?? 0])
    );
    const cartonDemandeByCode = new Map(
      cartonSplits.map((split) => [split.displayCode, split.displayQuantite ?? ligne.qt_carton ?? 0])
    );

    const vracFabriqueByCode = computeProduitParCode(vracEntriesForLigne, codes, (code) => vracDemandeByCode.get(code) ?? 0);
    const cartonFabriqueByCode = computeProduitParCode(cartonEntriesForLigne, codes, (code) => cartonDemandeByCode.get(code) ?? 0);

    for (const code of codes) {
      baseByKey.set(`${ligne.id}::${code}`, {
        ligne,
        code,
        vracDemande: vracDemandeByCode.get(code) ?? 0,
        vracFabrique: vracFabriqueByCode.get(code) ?? 0,
        cartonDemande: cartonDemandeByCode.get(code) ?? 0,
        cartonFabrique: cartonFabriqueByCode.get(code) ?? 0,
        cartonEmballe: 0,
      });
    }
  }

  const rootOf = buildLigneRoots(lignesWithLot);
  const familyByRoot = new Map<number, number[]>();
  for (const ligne of lignesWithLot) {
    const root = rootOf.get(ligne.id)!;
    const list = familyByRoot.get(root) ?? [];
    list.push(ligne.id);
    familyByRoot.set(root, list);
  }

  for (const ligneIds of familyByRoot.values()) {
    if (ligneIds.length <= 1) continue;
    const orderedIds = [...ligneIds].sort((a, b) => a - b);
    const tupleKeys = orderedIds.flatMap((ligneId) =>
      ligneOwnCodes(lignesById.get(ligneId)!).map((code) => `${ligneId}::${code}`)
    );
    const familyVracPool = orderedIds.reduce(
      (sum, id) => sum + sumEntries((vracByLigne.get(id) ?? []) as { quantite: number }[]),
      0
    );
    const familyCartonPool = orderedIds.reduce(
      (sum, id) => sum + sumEntries((cartonByLigne.get(id) ?? []) as { quantite: number }[]),
      0
    );
    const vracByTuple = residualCascade(
      tupleKeys.map((key) => ({
        key,
        demande: baseByKey.get(key)?.vracDemande ?? 0,
        dejaAttribue: baseByKey.get(key)?.vracFabrique ?? 0,
      })),
      familyVracPool
    );
    const cartonByTuple = residualCascade(
      tupleKeys.map((key) => ({
        key,
        demande: baseByKey.get(key)?.cartonDemande ?? 0,
        dejaAttribue: baseByKey.get(key)?.cartonFabrique ?? 0,
      })),
      familyCartonPool
    );
    for (const key of tupleKeys) {
      const base = baseByKey.get(key);
      if (!base) continue;
      baseByKey.set(key, {
        ...base,
        vracFabrique: vracByTuple.get(key) ?? 0,
        cartonFabrique: cartonByTuple.get(key) ?? 0,
      });
    }
  }

  // Emballage n'entre pas dans la balance matiere elle-meme mais reste
  // necessaire pour reproduire le meme statut "Termine" que Rapport Balance
  // Matiere (un code dont le vrac+carton sont finis mais l'emballage pas
  // encore reste "En cours" la-bas, donc ici aussi - sinon les totaux
  // divergeraient du rapport de reference).
  for (const ligne of lignesWithLot) {
    const codes = ligneOwnCodes(ligne);
    const emballageEntriesForLigne = (emballageByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];
    const emballageProduitByCode = computeProduitParCode(
      emballageEntriesForLigne,
      codes,
      (code) => baseByKey.get(`${ligne.id}::${code}`)?.cartonFabrique ?? 0
    );
    for (const code of codes) {
      const key = `${ligne.id}::${code}`;
      const base = baseByKey.get(key);
      if (!base) continue;
      baseByKey.set(key, { ...base, cartonEmballe: emballageProduitByCode.get(code) ?? 0 });
    }
  }

  for (const ligneIds of familyByRoot.values()) {
    if (ligneIds.length <= 1) continue;
    const orderedIds = [...ligneIds].sort((a, b) => a - b);
    const tupleKeys = orderedIds.flatMap((ligneId) =>
      ligneOwnCodes(lignesById.get(ligneId)!).map((code) => `${ligneId}::${code}`)
    );
    const familyEmballagePool = orderedIds.reduce(
      (sum, id) => sum + sumEntries((emballageByLigne.get(id) ?? []) as { quantite: number }[]),
      0
    );
    const emballageByTuple = residualCascade(
      tupleKeys.map((key) => ({
        key,
        demande: baseByKey.get(key)?.cartonFabrique ?? 0,
        dejaAttribue: baseByKey.get(key)?.cartonEmballe ?? 0,
      })),
      familyEmballagePool
    );
    for (const key of tupleKeys) {
      const base = baseByKey.get(key);
      if (!base) continue;
      baseByKey.set(key, { ...base, cartonEmballe: emballageByTuple.get(key) ?? 0 });
    }
  }

  const byMonth = new Map<string, { vracCommande: number; cartonFabriqueKg: number }>();
  // Memes lignes, dans le meme ordre et avec les memes repetitions que le Rapport Balance Matiere
  // (un code liste 2 fois dans numero_lot donne 2 lignes dans le rapport) : le total du mois est
  // ainsi exactement celui des KPI du rapport.
  const basesDuRapport = lignesWithLot.flatMap((ligne) =>
    ligneOwnCodes(ligne).flatMap((code) => {
      const base = baseByKey.get(`${ligne.id}::${code}`);
      return base ? [base] : [];
    })
  );
  for (const base of basesDuRapport) {
    const mois = (base.ligne.date_jour || "").slice(0, 7);
    if (mois.length !== 7) continue;

    if (base.vracDemande <= 0 && base.vracFabrique <= 0 && base.cartonFabrique <= 0) continue;

    // Uniquement les codes dont le vrac, le carton ET l'emballage sont termines (naturellement
    // ou via "Fin programme") - EXACTEMENT comme les KPI du Rapport Balance Matiere. Avec les
    // codes pas finis, le vrac commande etait compte sans que le carton ait ete tire, ce qui
    // donnait un ecart de plusieurs % (ex. 6,1 % au lieu de 0,22 % en septembre 2026).
    const { ligne, code, vracDemande, vracFabrique, cartonDemande, cartonFabrique, cartonEmballe } = base;
    const vracOk =
      Boolean(ligne.programme_termine || ligne.vrac_termine || terminatedCodes.has(`${ligne.id}::${code}::vrac`)) ||
      vracDemande <= 0 ||
      vracFabrique >= vracDemande;
    const cartonOk =
      Boolean(ligne.programme_termine || ligne.carton_termine || terminatedCodes.has(`${ligne.id}::${code}::carton`)) ||
      cartonDemande <= 0 ||
      cartonFabrique >= cartonDemande;
    const emballageOk =
      Boolean(
        ligne.programme_termine || ligne.emballage_termine || terminatedCodes.has(`${ligne.id}::${code}::emballage`)
      ) ||
      cartonDemande <= 0 ||
      (cartonFabrique > 0 && cartonEmballe >= cartonFabrique);
    if (!(vracOk && cartonOk && emballageOk)) continue;

    const factor = base.ligne.article_id ? articleFactors.get(base.ligne.article_id) : undefined;
    const pieceParCarton = factor?.pieceParCarton ?? null;
    const poidsReelGrammes = poidsReelByKey.get(`${base.ligne.id}::${base.code}`) ?? null;
    const contenance = poidsReelGrammes !== null ? poidsReelGrammes / 1000 : factor?.contenance ?? null;
    const canConvert = pieceParCarton !== null && contenance !== null && pieceParCarton > 0 && contenance > 0;
    const cartonFabriqueKg = canConvert ? base.cartonFabrique * (pieceParCarton as number) * (contenance as number) : 0;

    const current = byMonth.get(mois) ?? { vracCommande: 0, cartonFabriqueKg: 0 };
    current.vracCommande += base.vracDemande;
    current.cartonFabriqueKg += cartonFabriqueKg;
    byMonth.set(mois, current);
  }

  return byMonth;
}

// ---------------------------------------------------------------------
// Indicateur 8 : taux d'arret globale - meme logique que Rapport Temps
// d'Arret.
// ---------------------------------------------------------------------
const ARRET_FIELDS = [
  "arret_depot",
  "arret_consommable_non_livre",
  "arret_manque_conditionnement",
  "arret_manque_vrac",
  "arret_technique",
  "arret_coupure_courant",
  "arret_raclage_vrac",
  "arret_changement_lot",
  "arret_flacons_nc",
  "arret_autre",
] as const;

type CartonEntryArretRow = { date_jour: string | null; temps_demarage_lot: string | null; temps_arret_batch: string | null } & Record<
  (typeof ARRET_FIELDS)[number],
  number | null
>;

// Lu depuis production_carton_entries (une ligne PAR FOURNEE), PAS depuis
// programme_lignes + production_rapports - ce dernier ne garde qu'une seule
// ligne par code, ECRASEE a chaque nouvelle fournee de conditionnement, donc
// les temps d'arret des fournees precedentes y disparaissent silencieusement
// (meme bug reel que Rapport Temps d'Arret, voir
// app/production/rapport/temps-arret/page.tsx - corrige ici a l'identique).
async function fetchTempsArretMonthly(): Promise<Map<string, { arret: number; travail: number }>> {
  const select = `date_jour,temps_demarage_lot,temps_arret_batch,${ARRET_FIELDS.join(",")}`;

  const rows: CartonEntryArretRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("production_carton_entries")
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data as unknown as CartonEntryArretRow[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const byMonth = new Map<string, { arret: number; travail: number }>();
  for (const row of rows) {
    const mois = (row.date_jour || "").slice(0, 7);
    if (mois.length !== 7) continue;

    const arretMinutes = ARRET_FIELDS.reduce((sum, field) => sum + Math.round(Number(row[field] ?? 0)), 0);
    const planifieMinutes = hhmmDiffMinutes(row.temps_demarage_lot, row.temps_arret_batch);
    const travailMinutes = planifieMinutes + arretMinutes;

    const current = byMonth.get(mois) ?? { arret: 0, travail: 0 };
    current.arret += arretMinutes;
    current.travail += travailMinutes;
    byMonth.set(mois, current);
  }

  return byMonth;
}

// ---------------------------------------------------------------------
// Indicateur 10 : dechets globale - carton reellement fabrique (pas
// filtre par statut Termine, meme raison que fetchCartonMonthly ci-dessus).
// ---------------------------------------------------------------------
const DECHET_FIELDS = [
  "dechet_sleeve",
  "dechet_capsule",
  "dechet_pompe",
  "dechet_flacon",
  "dechet_pot",
  "dechet_etiquette",
  "dechet_etui",
] as const;

type DechetRow = { programme_ligne_id: number; code: string } & Record<(typeof DECHET_FIELDS)[number], number | null>;

// Lu depuis production_carton_entries (une ligne PAR FOURNEE), PAS depuis
// production_rapports - ce dernier ne garde qu'une seule ligne par code,
// ECRASEE a chaque nouvelle fournee de conditionnement, donc les dechets
// d'une fournee anterieure disparaissaient silencieusement des qu'un
// meme code recevait une fournee plus recente (meme bug reel deja corrige
// pour Rapport Dechets et Rapport Temps d'Arret).
async function fetchDechetsByLigneCode(ligneIds: number[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ligneIds.length === 0) return map;

  const columns = ["programme_ligne_id", "code", ...DECHET_FIELDS].join(", ");
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("production_carton_entries")
      .select(columns)
      .in("programme_ligne_id", ligneIds)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as unknown as DechetRow[];
    for (const row of chunk) {
      const total = DECHET_FIELDS.reduce((sum, field) => sum + Number(row[field] ?? 0), 0);
      const key = `${row.programme_ligne_id}::${row.code}`;
      map.set(key, (map.get(key) ?? 0) + total);
    }
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

async function fetchDechetsMonthly(): Promise<Map<string, { pieces: number; dechet: number }>> {
  const [{ rows: lignes }, cartonEntries] = await Promise.all([fetchAllProgrammeLignes(), fetchAllCartonEntries()]);
  const articleFactors = await fetchArticleKgFactorsByIds(lignes.map((ligne) => ligne.article_id));
  const dechetByKey = await fetchDechetsByLigneCode(lignes.map((ligne) => ligne.id));
  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);
  const lignesWithLot = lignes.filter((ligne) => ligne.numero_lot);

  const byMonth = new Map<string, { pieces: number; dechet: number }>();
  for (const ligne of lignesWithLot) {
    const mois = (ligne.date_jour || "").slice(0, 7);
    if (mois.length !== 7) continue;

    const codes = ligneOwnCodes(ligne);
    const cartonEntriesForLigne = (cartonByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];
    const cartonSplits = splitLigneIntoDisplayRows(ligne, "qt_carton", 0);
    const cartonDemandeByCode = new Map(
      cartonSplits.map((split) => [split.displayCode, split.displayQuantite ?? ligne.qt_carton ?? 0])
    );
    const cartonFabriqueByCode = computeProduitParCode(
      cartonEntriesForLigne,
      codes,
      (code) => cartonDemandeByCode.get(code) ?? 0
    );
    const factor = ligne.article_id ? articleFactors.get(ligne.article_id) : undefined;
    const pieceParCarton = factor?.pieceParCarton ?? null;

    for (const code of codes) {
      const cartonFabrique = cartonFabriqueByCode.get(code) ?? 0;

      const pieces = pieceParCarton !== null && pieceParCarton > 0 ? cartonFabrique * pieceParCarton : 0;
      const dechet = dechetByKey.get(`${ligne.id}::${code}`) ?? 0;
      if (pieces <= 0 && dechet <= 0) continue;

      const current = byMonth.get(mois) ?? { pieces: 0, dechet: 0 };
      current.pieces += pieces;
      current.dechet += dechet;
      byMonth.set(mois, current);
    }
  }

  return byMonth;
}

// ---------------------------------------------------------------------
// Indicateur 13 : prix de revient 1 carton (journalier cosmetique +
// energie cosmetique) - meme formule que Graphe Cout par Carton.
// ---------------------------------------------------------------------
type ChargeCoutRow = {
  annee: number;
  mois: number;
  electricite_cosmetique: number | null;
  gasoil_cosmetique: number | null;
  salaire_journalier_cosmetique: number | null;
};
type PrixCarburantRow = { annee: number; mois: number; prix_gasoil: number | null };

async function fetchPrixCartonMonthly(cartonFabriqueByMonth: Map<string, number>): Promise<Map<string, number>> {
  const [{ data: chargesData }, { data: prixData }] = await Promise.all([
    supabaseServer.from("charges_usine").select("annee, mois, electricite_cosmetique, gasoil_cosmetique, salaire_journalier_cosmetique"),
    supabaseServer.from("prix_carburant").select("annee, mois, prix_gasoil"),
  ]);
  const charges = (chargesData ?? []) as ChargeCoutRow[];
  const prix = (prixData ?? []) as PrixCarburantRow[];
  const prixByKey = new Map(prix.map((p) => [`${p.annee}-${p.mois}`, p]));

  const result = new Map<string, number>();
  for (const charge of charges) {
    const moisKey = `${charge.annee}-${String(charge.mois).padStart(2, "0")}`;
    const nbCarton = cartonFabriqueByMonth.get(moisKey) ?? 0;
    if (nbCarton <= 0) continue;

    const p = prixByKey.get(`${charge.annee}-${charge.mois}`);
    const gasoilCosmetiqueCout = p?.prix_gasoil != null ? Number(charge.gasoil_cosmetique ?? 0) * p.prix_gasoil : 0;
    const numerateur =
      Number(charge.salaire_journalier_cosmetique ?? 0) + Number(charge.electricite_cosmetique ?? 0) + gasoilCosmetiqueCout;
    result.set(moisKey, numerateur / nbCarton);
  }
  return result;
}

// ---------------------------------------------------------------------
// Indicateur 12 : respect du delai de livraison - meme logique que
// Rapport "Delai commande -> pret" (app/stock/rapport/delai-commandes),
// dupliquee volontairement (meme convention que Rapport Balance Matiere
// vis-a-vis de Rapport Ecarts). Commande = toutes les commandes ce mois-la
// sauf statut STAND ; depasse = celles dont le delai entree-en-cours -> pret
// en stock (ou aujourd'hui si pas encore pret) depasse 10 jours.
// ---------------------------------------------------------------------
const DELAI_LIMITE_JOURS = 10;

type DelaiCommandeRow = {
  statut: string | null;
  commentaire: string | null;
  created_at: string | null;
};

function extractStatusDateToken(commentaire: string | null | undefined, statusKey: string) {
  if (!commentaire) return "";
  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith(`STATUT_DATE_${statusKey}:`));
  return token ? token.replace(`STATUT_DATE_${statusKey}:`, "").trim() : "";
}

function extractPretStockDateToken(commentaire: string | null | undefined) {
  if (!commentaire) return "";
  const parts = commentaire.split("|").map((part) => part.trim());
  if (!parts.includes("PRET_STOCK:oui")) return "";
  const token = parts.find((part) => part.startsWith("PRET_STOCK_DATE:"));
  return token ? token.replace("PRET_STOCK_DATE:", "").trim() : "";
}

// Meme encodage que DATE_TRANSITION_ dans app/commandes/actions.ts - repli
// quand une commande saute directement de Stand vers BL transforme/Livree
// sans jamais avoir eu de STATUT_DATE_EN_COURS explicite : le temps passe
// en Stand ne doit pas compter dans le delai (meme regle que Rapport Delai
// Commande / Statistique livraison).
function extractTransitionDateToken(commentaire: string | null | undefined, transitionKey: string) {
  if (!commentaire) return "";
  const parts = commentaire.split("|").map((part) => part.trim());
  const token = parts.find((part) => part.startsWith(`DATE_TRANSITION_${transitionKey}:`));
  return token ? token.replace(`DATE_TRANSITION_${transitionKey}:`, "").trim() : "";
}

// Meme regroupement que statutBucket dans Rapport Delai Commande : les
// statuts "techniques" (FIFO_PARTIEL/FIFO_CALCULE/SAISIE_WEB) comptent
// comme "En cours" - sinon ces commandes disparaissaient du calcul.
function statutBucket(value: string | null | undefined) {
  const v = (value || "").toUpperCase();
  return v === "STAND" || v === "BL_TRANSFORME" || v === "LIVREE" ? v : "EN_COURS";
}

function daysBetweenDates(fromValue: string, toValue: string) {
  const fromDate = new Date(`${fromValue.slice(0, 10)}T00:00:00`);
  const toDate = new Date(`${toValue.slice(0, 10)}T00:00:00`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

// ---------------------------------------------------------------------
// Indicateur 9 : Taux suivi formation - lit directement le plan de
// formation (app/qualite/revue-processus/pr4/formation, table
// pr4_formation_plan) au lieu d'une saisie manuelle mensuelle repetee :
// pour un mois donne, "a faire" = nombre de formations planifiees ce
// mois-la (m{n}_planifie = true), "realisee" = celles qui ont deja une
// date de realisation (m{n}_date rempli). Sans donnee de planification
// (aucune formation planifiee ce mois), pas de repli manuel - 0 planifie
// = 0 a faire, ce qui donne 100% plus bas (rien a rattraper).
// ---------------------------------------------------------------------
type FormationPlanRow = { annee: number } & Record<`m${number}_planifie`, boolean | null> &
  Record<`m${number}_date`, string | null>;

async function fetchFormationMonthly(): Promise<Map<string, { aFaire: number; realisee: number }>> {
  const monthCols = Array.from({ length: 12 }, (_, i) => `m${i + 1}_planifie, m${i + 1}_date`).join(", ");
  const rows: FormationPlanRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("pr4_formation_plan")
      .select(`annee, ${monthCols}`)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as unknown as FormationPlanRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const byMonth = new Map<string, { aFaire: number; realisee: number }>();
  for (const row of rows) {
    for (let n = 1; n <= 12; n++) {
      const planifie = Boolean(row[`m${n}_planifie`]);
      if (!planifie) continue;
      const mois = `${row.annee}-${String(n).padStart(2, "0")}`;
      const current = byMonth.get(mois) ?? { aFaire: 0, realisee: 0 };
      current.aFaire += 1;
      if (row[`m${n}_date`]) current.realisee += 1;
      byMonth.set(mois, current);
    }
  }
  return byMonth;
}

// Indicateur "% heures supplementaires" : meme moteur que Rapport Heures
// Sup (lib/heures-supplementaires.ts), demande explicite pour que les 2
// restent coherents - sup+jour sup rapporte au total d'heures (normales +
// sup + jour sup) de TOUTES les fournees (Fabrication/Conditionnement/
// Emballage) + Heures Sup Manuel du mois, sur tout l'historique.
//
// Doit passer par regrouperParChaineJour (dedup meme equipe/meme jour sur
// plusieurs codes) ET ponderer par nbPersonnes (vraies heures-personnes),
// exactement comme Rapport Heures Sup calcule ses propres totaux - sans ces
// 2 etapes le % sortait 2x plus bas que le rapport de reference (bug reel
// signale par l'utilisateur : 3.1% affiche ici vs 6.7% sur Rapport Heures
// Sup pour le meme mois).
async function fetchHeuresSupMonthly(): Promise<Map<string, number>> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const blocs = await fetchBlocsHeuresSup({ dateFrom: "2000-01-01", dateTo: todayIso });
  const joursAgg = regrouperParChaineJour(blocs);

  const parMois = new Map<string, { normales: number; sup: number; joursSup: number }>();
  for (const j of joursAgg) {
    const mois = j.dateJour.slice(0, 7);
    const current = parMois.get(mois) ?? { normales: 0, sup: 0, joursSup: 0 };
    current.normales += j.nbPersonnes * j.normalesMinutes;
    current.sup += j.nbPersonnes * j.supMinutes;
    current.joursSup += j.nbPersonnes * j.joursSupMinutes;
    parMois.set(mois, current);
  }

  const result = new Map<string, number>();
  for (const [mois, totals] of parMois) {
    const total = totals.normales + totals.sup + totals.joursSup;
    if (total > 0) result.set(mois, ((totals.sup + totals.joursSup) / total) * 100);
  }
  return result;
}

async function fetchDelaiLivraisonMonthly(): Promise<Map<string, { commande: number; depasse: number }>> {
  const rows: DelaiCommandeRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("commandes")
      .select("statut, commentaire, created_at")
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as DelaiCommandeRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const byMonth = new Map<string, { commande: number; depasse: number }>();

  for (const row of rows) {
    const bucket = statutBucket(row.statut);
    if (bucket === "STAND") continue;

    const mois = (row.created_at || "").slice(0, 7);
    if (mois.length !== 7) continue;

    const current = byMonth.get(mois) ?? { commande: 0, depasse: 0 };
    current.commande += 1;

    // Meme ordre de priorite que Rapport Delai Commande : STATUT_DATE_EN_COURS,
    // sinon la date de sortie du Stand (le temps EN Stand ne compte pas),
    // sinon la date de creation en dernier recours.
    const dateEnCours =
      extractStatusDateToken(row.commentaire, "EN_COURS") ||
      extractTransitionDateToken(row.commentaire, "STAND_ENCOURS") ||
      (row.created_at || "").slice(0, 10);
    const datePret = extractPretStockDateToken(row.commentaire);
    const referenceFin = datePret || todayIso;

    if (dateEnCours && daysBetweenDates(dateEnCours, referenceFin) > DELAI_LIMITE_JOURS) {
      current.depasse += 1;
    }

    byMonth.set(mois, current);
  }

  return byMonth;
}

// ---------------------------------------------------------------------
// Saisie manuelle (mois anciens du fichier Excel, sans donnee automatique
// dans l'ERP) - repli uniquement quand la source automatique n'a AUCUNE
// donnee pour ce mois (pas juste une valeur a 0, qui peut etre reelle).
// ---------------------------------------------------------------------
async function fetchManuelByMonth(): Promise<{ rows: ManuelRow[]; byMonth: Map<string, ManuelRow> }> {
  const { data, error } = await supabaseServer
    .from("pr4_indicateurs_manuel")
    .select(
      "id, annee, mois, utilisateur, carton_commande, carton_fabrique, capacite_pct, test_labo_preparations, test_labo_a_detruire, test_labo_sous_derogation, vrac_fabrique_kg, carton_fabrique_kg, arret_minutes, travail_minutes, pieces_fabriquees, dechet_pieces, prix_carton, heures_supplementaires_pct, formation_a_faire, formation_realisee, qt_retournee_nc, qt_commande_livraison, qt_livree_a_temps"
    )
    .order("annee", { ascending: false })
    .order("mois", { ascending: false });

  if (error) return { rows: [], byMonth: new Map() };
  const rows = (data ?? []) as unknown as ManuelRow[];
  const byMonth = new Map<string, ManuelRow>();
  for (const row of rows) {
    byMonth.set(`${row.annee}-${String(row.mois).padStart(2, "0")}`, row);
  }
  return { rows, byMonth };
}

// ---------------------------------------------------------------------
// Chiffres du tableau "Indicateurs PR4" : lectures de toutes les sources + calcul mois par mois (avec repli sur
// la saisie manuelle). Partage par la page PR4 - Indicateurs et par la diapositive "Indicateur" des trimestres.
// ---------------------------------------------------------------------
export async function chargerMoisPr4() {
  const currentMoisKey = new Date().toISOString().slice(0, 7);

  const [
    cartonMonthly,
    testLaboMonthly,
    balanceMonthly,
    arretMonthly,
    dechetsMonthly,
    delaiMonthly,
    capaciteMonthly,
    formationMonthly,
    heuresSupMonthly,
    manuel,
  ] = await Promise.all([
    fetchCartonMonthly(),
    fetchTestLaboMonthly(),
    fetchBalanceMatiereMonthly(),
    fetchTempsArretMonthly(),
    fetchDechetsMonthly(),
    fetchDelaiLivraisonMonthly(),
    fetchCapaciteMonthly(),
    fetchFormationMonthly(),
    fetchHeuresSupMonthly(),
    fetchManuelByMonth(),
  ]);

  // Nb carton du prix carton : a partir de septembre 2026, les cartons entres au Depot A par Entree
  // Production ce mois-la (meme chiffre que Charges Usine / Graphe cout carton, voir
  // app/charges/carton.ts). Avant septembre 2026 rien ne change (valeurs saisies a la main ci-dessous).
  const cartonFabriqueOnlyByMonth = new Map<string, number>(
    [...cartonMonthly.entries()].map(([key, value]) => [key, value.fabrique])
  );
  const cartonEntreeProduction = await lireCartonEntreeProductionParMois().catch(() => new Map<string, number>());
  for (const key of [...cartonFabriqueOnlyByMonth.keys(), ...cartonEntreeProduction.keys()]) {
    const [annee, mois] = key.split("-").map(Number);
    if (!cartonAutomatiquePourMois(annee, mois)) continue;
    const nbCarton = cartonEntreeProduction.get(key) ?? 0;
    if (nbCarton > 0) cartonFabriqueOnlyByMonth.set(key, nbCarton);
    else cartonFabriqueOnlyByMonth.delete(key);
  }
  const prixCartonMonthly = await fetchPrixCartonMonthly(cartonFabriqueOnlyByMonth);

  const allMonthKeys = new Set<string>([
    ...cartonMonthly.keys(),
    ...testLaboMonthly.keys(),
    ...balanceMonthly.keys(),
    ...arretMonthly.keys(),
    ...dechetsMonthly.keys(),
    ...delaiMonthly.keys(),
    ...prixCartonMonthly.keys(),
    ...capaciteMonthly.keys(),
    ...formationMonthly.keys(),
    ...heuresSupMonthly.keys(),
    ...manuel.byMonth.keys(),
    currentMoisKey,
  ]);

  const monthRows = [...allMonthKeys]
    .sort((a, b) => b.localeCompare(a))
    .map((mois) => {
      const hasCartonAuto = cartonMonthly.has(mois);
      const hasTestLaboAuto = testLaboMonthly.has(mois);
      const hasBalanceAuto = balanceMonthly.has(mois);
      const hasArretAuto = arretMonthly.has(mois);
      const hasDechetsAuto = dechetsMonthly.has(mois);
      const hasPrixCartonAuto = prixCartonMonthly.has(mois);
      const hasDelaiAuto = delaiMonthly.has(mois);
      const hasCapaciteAuto = capaciteMonthly.has(mois);
      const hasHeuresSupAuto = heuresSupMonthly.has(mois);
      const manuelRow = manuel.byMonth.get(mois) ?? null;

      const carton = hasCartonAuto
        ? cartonMonthly.get(mois)!
        : { commande: manuelRow?.carton_commande ?? 0, fabrique: manuelRow?.carton_fabrique ?? 0 };
      const testLabo = hasTestLaboAuto
        ? testLaboMonthly.get(mois)!
        : {
            total: manuelRow?.test_labo_preparations ?? 0,
            aDetruire: manuelRow?.test_labo_a_detruire ?? 0,
            sousDerogation: manuelRow?.test_labo_sous_derogation ?? 0,
          };
      const balance = hasBalanceAuto
        ? balanceMonthly.get(mois)!
        : { vracCommande: manuelRow?.vrac_fabrique_kg ?? 0, cartonFabriqueKg: manuelRow?.carton_fabrique_kg ?? 0 };
      const arret = hasArretAuto
        ? arretMonthly.get(mois)!
        : { arret: manuelRow?.arret_minutes ?? 0, travail: manuelRow?.travail_minutes ?? 0 };
      const dechets = hasDechetsAuto
        ? dechetsMonthly.get(mois)!
        : { pieces: manuelRow?.pieces_fabriquees ?? 0, dechet: manuelRow?.dechet_pieces ?? 0 };
      const prixCarton = hasPrixCartonAuto ? prixCartonMonthly.get(mois)! : manuelRow?.prix_carton ?? null;
      const capacite = hasCapaciteAuto ? capaciteMonthly.get(mois)! : manuelRow?.capacite_pct ?? null;

      const hasFormationAuto = formationMonthly.has(mois);

      const isManuel = {
        carton: !hasCartonAuto && Boolean(manuelRow),
        testLabo: !hasTestLaboAuto && Boolean(manuelRow),
        balance: !hasBalanceAuto && Boolean(manuelRow),
        arret: !hasArretAuto && Boolean(manuelRow),
        dechets: !hasDechetsAuto && Boolean(manuelRow),
        prixCarton: !hasPrixCartonAuto && manuelRow?.prix_carton != null,
        capacite: !hasCapaciteAuto && manuelRow?.capacite_pct != null,
        delai: !hasDelaiAuto && Boolean(manuelRow),
        formation: !hasFormationAuto && Boolean(manuelRow),
        heuresSup: !hasHeuresSupAuto && manuelRow?.heures_supplementaires_pct != null,
      };

      const pctProgramme = carton.commande > 0 ? (carton.fabrique / carton.commande) * 100 : null;
      const pctADetruire = testLabo.total > 0 ? (testLabo.aDetruire / testLabo.total) * 100 : null;
      const pctSousDerogation = testLabo.total > 0 ? (testLabo.sousDerogation / testLabo.total) * 100 : null;
      // Ecart en % du vrac commande : + quand le carton tire (en kg) depasse le vrac commande
      const pctEcart =
        balance.vracCommande > 0 ? ((balance.cartonFabriqueKg - balance.vracCommande) / balance.vracCommande) * 100 : null;
      const pctArret = arret.travail > 0 ? (arret.arret / arret.travail) * 100 : null;
      const pctDechets = dechets.pieces + dechets.dechet > 0 ? (dechets.dechet / (dechets.pieces + dechets.dechet)) * 100 : null;

      // Indicateurs 11/12 : aucune donnee automatique dans l'ERP pour
      // l'instant - purement saisis a la main (l'utilisateur les reprend
      // directement de son fichier Excel). Le denominateur de l'indicateur
      // 11 (qt fabriquee) reutilise les pieces deja calculees pour
      // l'indicateur 10, pour ne pas redemander le meme chiffre 2 fois.
      // Indicateur 4 : lu depuis Rapport Heures Sup (voir
      // fetchHeuresSupMonthly), repli sur la saisie manuelle pour les mois
      // sans aucune fournee/heure sup manuelle trouvee.
      const heuresSupplementairesPct = hasHeuresSupAuto
        ? heuresSupMonthly.get(mois)!
        : manuelRow?.heures_supplementaires_pct ?? null;
      // Indicateur 9 : lu depuis le plan de formation (voir
      // fetchFormationMonthly) - repli sur la saisie manuelle uniquement
      // pour les mois sans aucune formation planifiee dans le plan.
      const formationMois = hasFormationAuto ? formationMonthly.get(mois)! : null;
      const formationAFaire = hasFormationAuto ? formationMois!.aFaire : manuelRow?.formation_a_faire ?? 0;
      const formationRealisee = hasFormationAuto ? formationMois!.realisee : manuelRow?.formation_realisee ?? 0;
      // Rien a faire ce mois-la = rien a rattraper -> 100%, pas "-".
      const pctFormation = formationAFaire > 0 ? (formationRealisee / formationAFaire) * 100 : 100;
      const qtRetourneeNc = manuelRow?.qt_retournee_nc ?? 0;
      const pctReclamationNc = dechets.pieces > 0 ? (qtRetourneeNc / dechets.pieces) * 100 : null;
      const delaiAuto = hasDelaiAuto ? delaiMonthly.get(mois)! : null;
      const qtCommandeLivraison = hasDelaiAuto ? delaiAuto!.commande : manuelRow?.qt_commande_livraison ?? 0;
      const qtLivreeATemps = hasDelaiAuto
        ? delaiAuto!.commande - delaiAuto!.depasse
        : manuelRow?.qt_livree_a_temps ?? 0;
      const qtDepasseLivraison = hasDelaiAuto
        ? delaiAuto!.depasse
        : Math.max(0, (manuelRow?.qt_commande_livraison ?? 0) - (manuelRow?.qt_livree_a_temps ?? 0));
      const pctLivraison = qtCommandeLivraison > 0 ? (qtLivreeATemps / qtCommandeLivraison) * 100 : null;

      return {
        mois,
        moisLabel: moisLabel(mois),
        isManuel,
        cartonFabrique: carton.fabrique,
        cartonCommande: carton.commande,
        pctProgramme,
        pctProgrammeLabel: fmtPct(pctProgramme),
        capacite,
        capaciteLabel: fmtPct(capacite, 0),
        preparations: testLabo.total,
        aDetruireCount: testLabo.aDetruire,
        pctADetruire,
        pctADetruireLabel: fmtPct(pctADetruire),
        sousDerogationCount: testLabo.sousDerogation,
        pctSousDerogation,
        pctSousDerogationLabel: fmtPct(pctSousDerogation),
        vracFabriqueKg: balance.vracCommande,
        vracFabriqueKgLabel: fmt(balance.vracCommande),
        cartonFabriqueKgBalance: balance.cartonFabriqueKg,
        cartonFabriqueKgLabel: fmt(balance.cartonFabriqueKg),
        pctEcart,
        // Balance matiere : 2 decimales et signe (+ = carton tire superieur au vrac commande)
        pctEcartLabel: pctEcart !== null && pctEcart > 0 ? `+${fmtPct(pctEcart, 2)}` : fmtPct(pctEcart, 2),
        arretMinutes: arret.arret,
        travailMinutes: arret.travail,
        pctArret,
        pctArretLabel: fmtPct(pctArret),
        pieces: dechets.pieces,
        piecesLabel: fmt(dechets.pieces),
        dechet: dechets.dechet,
        dechetLabel: fmt(dechets.dechet),
        pctDechets,
        pctDechetsLabel: fmtPct(pctDechets),
        prixCarton,
        prixCartonLabel: fmt(prixCarton, 1),
        heuresSupplementairesPct,
        heuresSupplementairesLabel: fmtPct(heuresSupplementairesPct),
        formationAFaire,
        formationRealisee,
        pctFormation,
        pctFormationLabel: fmtPct(pctFormation),
        qtRetourneeNc,
        pctReclamationNc,
        pctReclamationNcLabel: fmtPct(pctReclamationNc),
        qtCommandeLivraison,
        qtLivreeATemps,
        qtDepasseLivraison,
        pctLivraison,
        pctLivraisonLabel: fmtPct(pctLivraison),
      };
    })
    // Un mois sans aucune donnee sur aucun indicateur (juste ajoute pour le
    // mois en cours par defaut) ne merite pas sa propre ligne.
    .filter(
      (row) =>
        row.mois === currentMoisKey ||
        row.cartonFabrique > 0 ||
        row.cartonCommande > 0 ||
        row.preparations > 0 ||
        row.vracFabriqueKg > 0 ||
        row.arretMinutes > 0 ||
        row.pieces > 0 ||
        row.prixCarton !== null
    );

  return { monthRows, manuel, currentMoisKey };
}

export type MoisPr4 = Awaited<ReturnType<typeof chargerMoisPr4>>["monthRows"][number];
