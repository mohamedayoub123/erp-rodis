import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { ExportExcelButton } from "@/app/_components/export-excel-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { hhmmDiffMinutes } from "@/lib/suivi-tirage-time";
import { canDeletePageUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllProgrammeLignes,
  fetchAllVracEntries,
  fetchArticleKgFactorsByIds,
  groupCartonEntriesByLigne,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../../production/suivi/data";
import { deletePr4ManuelAction } from "./actions";
import { Pr4ManuelForm } from "./manuel-form";
import type { ManuelRow } from "./fields";

// PR4 - Indicateurs Cosmetique : reprend le fichier Excel de suivi ISO
// "Objectif et INDICATEUR PR4 cosmetique.xlsx" (sheet "CALCULE INDICATEUR"),
// formules confirmees une par une avec l'utilisateur. 8 des 9 indicateurs
// automatisables sont calcules ici depuis les donnees deja suivies dans
// l'ERP (memes calculs que les rapports existants, duplique volontairement
// plutot que partage - meme convention que Rapport Balance Matiere/Ecarts,
// pour ne jamais faire deriver un rapport existant en le touchant). Le 9e
// (capacite machines) est un instantane "en ce moment", pas historisable
// par mois avec le modele de donnees actuel - affiche seulement sur le mois
// en cours, "-" ailleurs (voir note sur la page).
//
// 4 indicateurs restent hors perimetre pour l'instant (aucune donnee
// source dans l'ERP, l'utilisateur doit encore definir la saisie) : taux
// d'heures supplementaires, taux suivi formation, taux de reclamation
// produit non conforme, respect du delai de livraison.

const MOIS_NOMS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function moisLabel(moisKey: string) {
  const [year, month] = moisKey.split("-");
  const index = Number(month) - 1;
  return `${MOIS_NOMS[index] ?? month} ${year}`;
}

function ligneOwnCodes(ligne: ProgrammeLigneRow): string[] {
  return splitLigneIntoDisplayRows(ligne, "qt_vrac", 0).map((split) => split.displayCode);
}

function fmt(value: number | null, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function fmtPct(value: number | null, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}%`;
}

// ---------------------------------------------------------------------
// Indicateurs 1 & 2 : carton fabrique / carton commande par mois - meme
// agregation que Rapport Carton Mensuel.
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
// Indicateur 3 : capacite machines - instantane "en ce moment" (memes
// regles que Rapport Capacite Machines), rattache uniquement au mois en
// cours.
// ---------------------------------------------------------------------
function normalizeMachine(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

async function fetchCapaciteActuelle(): Promise<number | null> {
  const { data: machinesData } = await supabaseServer.from("machines").select("id, nom, type");
  const machines = (machinesData ?? []) as { id: number; nom: string; type: string | null }[];
  if (machines.length === 0) return null;

  const { data: lignesData } = await supabaseServer
    .from("programme_lignes")
    .select("id, chaine")
    .or("programme_termine.eq.false,programme_termine.is.null")
    .eq("exclu_rapports", false);
  const lignesActives = (lignesData ?? []) as { id: number; chaine: string | null }[];
  const ligneIds = lignesActives.map((l) => l.id);

  const activeChaineNames = new Set(lignesActives.map((l) => normalizeMachine(l.chaine)).filter(Boolean));

  let activeMachineNamesFabrication = new Set<string>();
  if (ligneIds.length > 0) {
    const { data: rapportsData } = await supabaseServer
      .from("production_rapports")
      .select("machine")
      .in("programme_ligne_id", ligneIds)
      .not("machine", "is", null);
    activeMachineNamesFabrication = new Set(
      ((rapportsData ?? []) as { machine: string | null }[]).map((r) => normalizeMachine(r.machine)).filter(Boolean)
    );
  }

  const activeCount = machines.filter((machine) => {
    const key = normalizeMachine(machine.nom);
    const isFabrication = normalizeMachine(machine.type) === "fabrication";
    return isFabrication ? activeMachineNamesFabrication.has(key) : activeChaineNames.has(key);
  }).length;

  return (activeCount / machines.length) * 100;
}

// ---------------------------------------------------------------------
// Indicateurs 5 & 6 : Test Labo - preparations totales / a detruire /
// sous derogation par mois - meme logique que Rapport Test Labo.
// ---------------------------------------------------------------------
type TestLaboRow = {
  programme_ligne_id: number;
  disposition_qualite: string | null;
  sous_derogation: boolean | null;
};

async function fetchTestLaboMonthly(): Promise<Map<string, { total: number; aDetruire: number; sousDerogation: number }>> {
  const rows: TestLaboRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select("programme_ligne_id, disposition_qualite, sous_derogation")
      .not("utilisateur_test_labo", "is", null)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as TestLaboRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

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
    const date = dateByLigne.get(row.programme_ligne_id) || "";
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
// Indicateur 7 : balance matiere - vrac fabrique vs carton fabrique (kg)
// par mois - meme logique (union-find + cascade famille) que Rapport
// Balance Matiere, dupliquee volontairement (meme convention que ce
// rapport lui-meme vis-a-vis de Rapport Ecarts).
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

async function fetchBalanceMatiereMonthly(): Promise<Map<string, { vracFabrique: number; cartonFabriqueKg: number }>> {
  const [{ rows: lignes }, vracEntries, cartonEntries] = await Promise.all([
    fetchAllProgrammeLignes(),
    fetchAllVracEntries(),
    fetchAllCartonEntries(),
  ]);

  const articleFactors = await fetchArticleKgFactorsByIds(lignes.map((ligne) => ligne.article_id));
  const poidsReelByKey = await fetchPoidsReelByLigneCode(lignes.map((ligne) => ligne.id));

  function sumEntries(entries: { quantite: number }[]) {
    return entries.reduce((sum, entry) => sum + Number(entry.quantite), 0);
  }

  const vracByLigne = groupCartonEntriesByLigne(vracEntries);
  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);

  type Base = {
    ligne: ProgrammeLigneRow;
    code: string;
    vracDemande: number;
    vracFabrique: number;
    cartonDemande: number;
    cartonFabrique: number;
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
    const vracByTuple = cascadeFamily(
      tupleKeys.map((key) => ({ key, demande: baseByKey.get(key)?.vracDemande ?? 0 })),
      familyVracPool
    );
    const cartonByTuple = cascadeFamily(
      tupleKeys.map((key) => ({ key, demande: baseByKey.get(key)?.cartonDemande ?? 0 })),
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

  const byMonth = new Map<string, { vracFabrique: number; cartonFabriqueKg: number }>();
  for (const base of baseByKey.values()) {
    const mois = (base.ligne.date_jour || "").slice(0, 7);
    if (mois.length !== 7) continue;

    const factor = base.ligne.article_id ? articleFactors.get(base.ligne.article_id) : undefined;
    const pieceParCarton = factor?.pieceParCarton ?? null;
    const poidsReelGrammes = poidsReelByKey.get(`${base.ligne.id}::${base.code}`) ?? null;
    const contenance = poidsReelGrammes !== null ? poidsReelGrammes / 1000 : factor?.contenance ?? null;
    const canConvert = pieceParCarton !== null && contenance !== null && pieceParCarton > 0 && contenance > 0;
    const cartonFabriqueKg = canConvert ? base.cartonFabrique * (pieceParCarton as number) * (contenance as number) : 0;

    if (base.vracFabrique <= 0 && cartonFabriqueKg <= 0) continue;

    const current = byMonth.get(mois) ?? { vracFabrique: 0, cartonFabriqueKg: 0 };
    current.vracFabrique += base.vracFabrique;
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

type ArretRapportRow = { temps_demarage_lot: string | null; temps_arret_batch: string | null } & Record<
  (typeof ARRET_FIELDS)[number],
  number | null
>;

type ArretLigneRow = {
  date_jour: string | null;
  production_rapports: ArretRapportRow | ArretRapportRow[] | null;
};

async function fetchTempsArretMonthly(): Promise<Map<string, { arret: number; travail: number }>> {
  const select =
    "date_jour," +
    `production_rapports!inner(temps_demarage_lot,temps_arret_batch,${ARRET_FIELDS.join(",")})`;

  const rows: ArretLigneRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data as unknown as ArretLigneRow[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const byMonth = new Map<string, { arret: number; travail: number }>();
  for (const row of rows) {
    const rapport = Array.isArray(row.production_rapports) ? row.production_rapports[0] : row.production_rapports;
    if (!rapport) continue;
    const mois = (row.date_jour || "").slice(0, 7);
    if (mois.length !== 7) continue;

    const arretMinutes = ARRET_FIELDS.reduce((sum, field) => sum + Math.round(Number(rapport[field] ?? 0)), 0);
    const planifieMinutes = hhmmDiffMinutes(rapport.temps_demarage_lot, rapport.temps_arret_batch);
    const travailMinutes = planifieMinutes + arretMinutes;

    const current = byMonth.get(mois) ?? { arret: 0, travail: 0 };
    current.arret += arretMinutes;
    current.travail += travailMinutes;
    byMonth.set(mois, current);
  }

  return byMonth;
}

// ---------------------------------------------------------------------
// Indicateur 10 : dechets globale - meme logique que Rapport Dechets.
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

async function fetchDechetsByLigneCode(ligneIds: number[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ligneIds.length === 0) return map;

  const columns = ["programme_ligne_id", "code", ...DECHET_FIELDS].join(", ");
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
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
  const codeTermineRows = await fetchAllCodeTermineRows(lignes.map((ligne) => ligne.id));
  const terminatedCodes = new Set(codeTermineRows.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`));
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
      const cartonDemande = cartonDemandeByCode.get(code) ?? 0;
      const cartonFabrique = cartonFabriqueByCode.get(code) ?? 0;
      const cartonManuel = Boolean(
        ligne.programme_termine || ligne.carton_termine || terminatedCodes.has(`${ligne.id}::${code}::carton`)
      );
      const cartonNaturel = cartonDemande <= 0 || cartonFabrique >= cartonDemande;
      // Seuls les codes termines comptent, meme filtre que Rapport Dechets.
      if (!(cartonManuel || cartonNaturel)) continue;

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
// Saisie manuelle (mois anciens du fichier Excel, sans donnee automatique
// dans l'ERP) - repli uniquement quand la source automatique n'a AUCUNE
// donnee pour ce mois (pas juste une valeur a 0, qui peut etre reelle).
// ---------------------------------------------------------------------
async function fetchManuelByMonth(): Promise<{ rows: ManuelRow[]; byMonth: Map<string, ManuelRow> }> {
  const { data, error } = await supabaseServer
    .from("pr4_indicateurs_manuel")
    .select(
      "id, annee, mois, utilisateur, carton_commande, carton_fabrique, capacite_pct, test_labo_preparations, test_labo_a_detruire, test_labo_sous_derogation, vrac_fabrique_kg, carton_fabrique_kg, arret_minutes, travail_minutes, pieces_fabriquees, dechet_pieces, prix_carton"
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

const EXPORT_COLUMNS = [
  { label: "Mois", key: "moisLabel" },
  { label: "1 - Nb carton fabrique", key: "cartonFabrique" },
  { label: "2 - Carton commande", key: "cartonCommande" },
  { label: "2 - % programme fait dans les temps (cible 98%)", key: "pctProgrammeLabel" },
  { label: "3 - % capacite machines (mois en cours seulement)", key: "capaciteLabel" },
  { label: "5/6 - Preparations Test Labo", key: "preparations" },
  { label: "5 - % non conforme detruit (cible < 0,5%)", key: "pctADetruireLabel" },
  { label: "6 - % sous derogation (cible < 10%)", key: "pctSousDerogationLabel" },
  { label: "7 - Vrac fabrique (kg)", key: "vracFabriqueKgLabel" },
  { label: "7 - Carton fabrique (kg)", key: "cartonFabriqueKgLabel" },
  { label: "7 - % ecart balance matiere (cible -0,5% a +0,5%)", key: "pctEcartLabel" },
  { label: "8 - Temps arret (min)", key: "arretMinutes" },
  { label: "8 - Temps travail (min)", key: "travailMinutes" },
  { label: "8 - % taux arret (cible < 5%)", key: "pctArretLabel" },
  { label: "10 - Pieces fabriquees", key: "piecesLabel" },
  { label: "10 - Dechets (pieces)", key: "dechetLabel" },
  { label: "10 - % dechets (cible < 1%)", key: "pctDechetsLabel" },
  { label: "13 - Prix de revient 1 carton (FCFA)", key: "prixCartonLabel" },
];

export default async function Pr4Page() {
  noStore();

  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "qualiteRevueProcessus");
  const canDelete = await canDeletePageUser(currentUser, "qualiteRevueProcessus");

  const currentMoisKey = new Date().toISOString().slice(0, 7);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 4 + i);

  const [cartonMonthly, testLaboMonthly, balanceMonthly, arretMonthly, dechetsMonthly, capaciteActuelle, manuel] =
    await Promise.all([
      fetchCartonMonthly(),
      fetchTestLaboMonthly(),
      fetchBalanceMatiereMonthly(),
      fetchTempsArretMonthly(),
      fetchDechetsMonthly(),
      fetchCapaciteActuelle(),
      fetchManuelByMonth(),
    ]);

  const cartonFabriqueOnlyByMonth = new Map<string, number>(
    [...cartonMonthly.entries()].map(([key, value]) => [key, value.fabrique])
  );
  const prixCartonMonthly = await fetchPrixCartonMonthly(cartonFabriqueOnlyByMonth);

  const allMonthKeys = new Set<string>([
    ...cartonMonthly.keys(),
    ...testLaboMonthly.keys(),
    ...balanceMonthly.keys(),
    ...arretMonthly.keys(),
    ...dechetsMonthly.keys(),
    ...prixCartonMonthly.keys(),
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
        : { vracFabrique: manuelRow?.vrac_fabrique_kg ?? 0, cartonFabriqueKg: manuelRow?.carton_fabrique_kg ?? 0 };
      const arret = hasArretAuto
        ? arretMonthly.get(mois)!
        : { arret: manuelRow?.arret_minutes ?? 0, travail: manuelRow?.travail_minutes ?? 0 };
      const dechets = hasDechetsAuto
        ? dechetsMonthly.get(mois)!
        : { pieces: manuelRow?.pieces_fabriquees ?? 0, dechet: manuelRow?.dechet_pieces ?? 0 };
      const prixCarton = hasPrixCartonAuto ? prixCartonMonthly.get(mois)! : manuelRow?.prix_carton ?? null;
      const capacite = mois === currentMoisKey ? capaciteActuelle : manuelRow?.capacite_pct ?? null;

      const isManuel = {
        carton: !hasCartonAuto && Boolean(manuelRow),
        testLabo: !hasTestLaboAuto && Boolean(manuelRow),
        balance: !hasBalanceAuto && Boolean(manuelRow),
        arret: !hasArretAuto && Boolean(manuelRow),
        dechets: !hasDechetsAuto && Boolean(manuelRow),
        prixCarton: !hasPrixCartonAuto && manuelRow?.prix_carton != null,
        capacite: mois !== currentMoisKey && manuelRow?.capacite_pct != null,
      };

      const pctProgramme = carton.commande > 0 ? (carton.fabrique / carton.commande) * 100 : null;
      const pctADetruire = testLabo.total > 0 ? (testLabo.aDetruire / testLabo.total) * 100 : null;
      const pctSousDerogation = testLabo.total > 0 ? (testLabo.sousDerogation / testLabo.total) * 100 : null;
      const pctEcart =
        balance.vracFabrique > 0 ? ((balance.vracFabrique - balance.cartonFabriqueKg) / balance.vracFabrique) * 100 : null;
      const pctArret = arret.travail > 0 ? (arret.arret / arret.travail) * 100 : null;
      const pctDechets = dechets.pieces + dechets.dechet > 0 ? (dechets.dechet / (dechets.pieces + dechets.dechet)) * 100 : null;

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
        pctADetruire,
        pctADetruireLabel: fmtPct(pctADetruire),
        pctSousDerogation,
        pctSousDerogationLabel: fmtPct(pctSousDerogation),
        vracFabriqueKg: balance.vracFabrique,
        vracFabriqueKgLabel: fmt(balance.vracFabrique),
        cartonFabriqueKgBalance: balance.cartonFabriqueKg,
        cartonFabriqueKgLabel: fmt(balance.cartonFabriqueKg),
        pctEcart,
        pctEcartLabel: fmtPct(pctEcart),
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

  // ExportExcelButton attend des valeurs scalaires - isManuel (objet) n'a
  // pas sa place dans l'export, seules les colonnes listees dans
  // EXPORT_COLUMNS comptent de toute facon.
  const exportRows = monthRows.map(({ isManuel: _isManuel, ...row }) => row);

  function ManuelBadge() {
    return (
      <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">
        manuel
      </span>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">PR4 - Indicateurs Cosmetique</h1>
              <p className="mt-2 text-sm text-slate-600">
                Meme tableau que le fichier Excel ISO, calcule automatiquement depuis les rapports deja
                suivis dans l&apos;ERP.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite/revue-processus" label="Retour revue processus" />
              <ExportExcelButton
                rows={exportRows}
                columns={EXPORT_COLUMNS}
                filename={`pr4-indicateurs-${new Date().toISOString().slice(0, 10)}.xlsx`}
              />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className="font-semibold">A savoir</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>% capacite machines</strong> reflete l&apos;etat des machines au moment ou tu ouvres cette page
              - ce n&apos;est pas historisable par mois, donc affiche seulement pour le mois en cours.
            </li>
            <li>
              4 indicateurs restent a mettre en place (aucune saisie ne les alimente encore) : taux d&apos;heures
              supplementaires, taux suivi formation, taux de reclamation produit non conforme, respect du delai de
              livraison.
            </li>
          </ul>
        </section>

        {canEdit ? (
          <>
            <Pr4ManuelForm rows={manuel.rows} yearOptions={yearOptions} currentYear={currentYear} />

            {manuel.rows.length > 0 ? (
              <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <h2 className="mb-3 text-sm font-bold text-slate-900">Mois saisis manuellement</h2>
                <ul className="flex flex-wrap gap-2">
                  {manuel.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 py-1.5 pl-4 pr-2 text-xs font-semibold text-violet-700"
                    >
                      {moisLabel(`${row.annee}-${String(row.mois).padStart(2, "0")}`)}
                      {canDelete ? (
                        <form action={deletePr4ManuelAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <DeleteIconButton label={`Supprimer la saisie manuelle de ${moisLabel(`${row.annee}-${String(row.mois).padStart(2, "0")}`)}`} />
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {monthRows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune donnee pour le moment.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th rowSpan={2} className="sticky top-0 left-0 z-20 bg-slate-100 px-4 py-3 font-semibold">
                      Mois
                    </th>
                    <th colSpan={1} className="sticky top-0 z-10 bg-blue-50 px-4 py-2 text-center font-semibold text-blue-800">
                      1 - Evolution production
                    </th>
                    <th colSpan={3} className="sticky top-0 z-10 bg-orange-50 px-4 py-2 text-center font-semibold text-orange-800">
                      2 - Programme fait dans les temps (cible 98%)
                    </th>
                    <th colSpan={1} className="sticky top-0 z-10 bg-sky-50 px-4 py-2 text-center font-semibold text-sky-800">
                      3 - Capacite machines
                    </th>
                    <th colSpan={3} className="sticky top-0 z-10 bg-violet-50 px-4 py-2 text-center font-semibold text-violet-800">
                      5/6 - Test Labo (non conforme &lt; 0,5% / derogation &lt; 10%)
                    </th>
                    <th colSpan={3} className="sticky top-0 z-10 bg-emerald-50 px-4 py-2 text-center font-semibold text-emerald-800">
                      7 - Balance matiere (-0,5% a +0,5%)
                    </th>
                    <th colSpan={3} className="sticky top-0 z-10 bg-red-50 px-4 py-2 text-center font-semibold text-red-800">
                      8 - Taux d&apos;arret (cible &lt; 5%)
                    </th>
                    <th colSpan={3} className="sticky top-0 z-10 bg-amber-50 px-4 py-2 text-center font-semibold text-amber-800">
                      10 - Dechets (cible &lt; 1%)
                    </th>
                    <th colSpan={1} className="sticky top-0 z-10 bg-green-50 px-4 py-2 text-center font-semibold text-green-800">
                      13 - Prix de revient carton
                    </th>
                  </tr>
                  <tr>
                    <th className="sticky top-[41px] z-10 bg-blue-50/70 px-3 py-2 font-medium text-blue-800">Nb carton fabrique</th>
                    <th className="sticky top-[41px] z-10 bg-orange-50/70 px-3 py-2 font-medium text-orange-800">Commande</th>
                    <th className="sticky top-[41px] z-10 bg-orange-50/70 px-3 py-2 font-medium text-orange-800">Fabrique</th>
                    <th className="sticky top-[41px] z-10 bg-orange-50/70 px-3 py-2 font-medium text-orange-800">%</th>
                    <th className="sticky top-[41px] z-10 bg-sky-50/70 px-3 py-2 font-medium text-sky-800">%</th>
                    <th className="sticky top-[41px] z-10 bg-violet-50/70 px-3 py-2 font-medium text-violet-800">Preparations</th>
                    <th className="sticky top-[41px] z-10 bg-violet-50/70 px-3 py-2 font-medium text-violet-800">% detruit</th>
                    <th className="sticky top-[41px] z-10 bg-violet-50/70 px-3 py-2 font-medium text-violet-800">% derogation</th>
                    <th className="sticky top-[41px] z-10 bg-emerald-50/70 px-3 py-2 font-medium text-emerald-800">Vrac (kg)</th>
                    <th className="sticky top-[41px] z-10 bg-emerald-50/70 px-3 py-2 font-medium text-emerald-800">Carton (kg)</th>
                    <th className="sticky top-[41px] z-10 bg-emerald-50/70 px-3 py-2 font-medium text-emerald-800">% ecart</th>
                    <th className="sticky top-[41px] z-10 bg-red-50/70 px-3 py-2 font-medium text-red-800">Arret (min)</th>
                    <th className="sticky top-[41px] z-10 bg-red-50/70 px-3 py-2 font-medium text-red-800">Travail (min)</th>
                    <th className="sticky top-[41px] z-10 bg-red-50/70 px-3 py-2 font-medium text-red-800">%</th>
                    <th className="sticky top-[41px] z-10 bg-amber-50/70 px-3 py-2 font-medium text-amber-800">Pieces</th>
                    <th className="sticky top-[41px] z-10 bg-amber-50/70 px-3 py-2 font-medium text-amber-800">Dechets</th>
                    <th className="sticky top-[41px] z-10 bg-amber-50/70 px-3 py-2 font-medium text-amber-800">%</th>
                    <th className="sticky top-[41px] z-10 bg-green-50/70 px-3 py-2 font-medium text-green-800">FCFA/carton</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((row) => (
                    <tr key={row.mois} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-slate-900">
                        {row.moisLabel}
                      </td>
                      <td className="bg-blue-50/20 px-3 py-3 text-slate-600">
                        {fmt(row.cartonFabrique)}
                        {row.isManuel.carton ? <ManuelBadge /> : null}
                      </td>
                      <td className="bg-orange-50/20 px-3 py-3 text-slate-600">{fmt(row.cartonCommande)}</td>
                      <td className="bg-orange-50/20 px-3 py-3 text-slate-600">{fmt(row.cartonFabrique)}</td>
                      <td
                        className={`bg-orange-50/20 px-3 py-3 font-semibold ${
                          row.pctProgramme !== null && row.pctProgramme < 98 ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {row.pctProgrammeLabel}
                      </td>
                      <td className="bg-sky-50/20 px-3 py-3 text-slate-600">
                        {row.capaciteLabel}
                        {row.isManuel.capacite ? <ManuelBadge /> : null}
                      </td>
                      <td className="bg-violet-50/20 px-3 py-3 text-slate-600">
                        {fmt(row.preparations)}
                        {row.isManuel.testLabo ? <ManuelBadge /> : null}
                      </td>
                      <td
                        className={`bg-violet-50/20 px-3 py-3 font-semibold ${
                          row.pctADetruire !== null && row.pctADetruire >= 0.5 ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {row.pctADetruireLabel}
                      </td>
                      <td
                        className={`bg-violet-50/20 px-3 py-3 font-semibold ${
                          row.pctSousDerogation !== null && row.pctSousDerogation >= 10 ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {row.pctSousDerogationLabel}
                      </td>
                      <td className="bg-emerald-50/20 px-3 py-3 text-slate-600">
                        {row.vracFabriqueKgLabel}
                        {row.isManuel.balance ? <ManuelBadge /> : null}
                      </td>
                      <td className="bg-emerald-50/20 px-3 py-3 text-slate-600">{row.cartonFabriqueKgLabel}</td>
                      <td
                        className={`bg-emerald-50/20 px-3 py-3 font-semibold ${
                          row.pctEcart !== null && Math.abs(row.pctEcart) > 0.5 ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {row.pctEcartLabel}
                      </td>
                      <td className="bg-red-50/20 px-3 py-3 text-slate-600">
                        {fmt(row.arretMinutes)}
                        {row.isManuel.arret ? <ManuelBadge /> : null}
                      </td>
                      <td className="bg-red-50/20 px-3 py-3 text-slate-600">{fmt(row.travailMinutes)}</td>
                      <td
                        className={`bg-red-50/20 px-3 py-3 font-semibold ${
                          row.pctArret !== null && row.pctArret >= 5 ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {row.pctArretLabel}
                      </td>
                      <td className="bg-amber-50/20 px-3 py-3 text-slate-600">
                        {row.piecesLabel}
                        {row.isManuel.dechets ? <ManuelBadge /> : null}
                      </td>
                      <td className="bg-amber-50/20 px-3 py-3 text-slate-600">{row.dechetLabel}</td>
                      <td
                        className={`bg-amber-50/20 px-3 py-3 font-semibold ${
                          row.pctDechets !== null && row.pctDechets >= 1 ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {row.pctDechetsLabel}
                      </td>
                      <td className="bg-green-50/20 px-3 py-3 font-semibold text-green-800">
                        {row.prixCartonLabel}
                        {row.isManuel.prixCarton ? <ManuelBadge /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
