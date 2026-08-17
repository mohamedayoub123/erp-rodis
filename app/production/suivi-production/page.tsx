import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { formatDate } from "../suivi/data";
import { DeleteRowButton } from "./delete-row-button";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { matchesArticleSearch } from "@/lib/article-search";

// Meme calcul que Historique programme (PL1.2026, PL2.2026... remis a 1
// chaque nouvelle annee de date_jour, rang par ordre de creation) - permet
// d'afficher directement sur Suivi Production de quel programme "Programme
// par ligne" vient chaque ligne, sans devoir aller chercher dans
// l'historique. Les lignes d'avant l'ajout de groupe_id (NULL) ne sont pas
// rattachables a un code PL.
function computePlCodesByGroupeId(
  rows: { groupe_id: number | null; created_at: string; date_jour: string }[]
): Map<number, string> {
  const earliestByGroup = new Map<number, { createdAt: string; dateJourForYear: string }>();
  for (const row of rows) {
    if (row.groupe_id === null) continue;
    const current = earliestByGroup.get(row.groupe_id);
    if (!current || new Date(row.created_at).getTime() < new Date(current.createdAt).getTime()) {
      earliestByGroup.set(row.groupe_id, { createdAt: row.created_at, dateJourForYear: row.date_jour });
    }
  }

  const orderedGroupIds = [...earliestByGroup.entries()]
    .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
    .map(([groupeId, info]) => ({ groupeId, annee: new Date(info.dateJourForYear).getFullYear() }));

  const rankByYear = new Map<number, number>();
  const codeByGroupeId = new Map<number, string>();
  for (const entry of orderedGroupIds) {
    const rank = (rankByYear.get(entry.annee) ?? 0) + 1;
    rankByYear.set(entry.annee, rank);
    codeByGroupeId.set(entry.groupeId, `PL${rank}.${entry.annee}`);
  }
  return codeByGroupeId;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function dispositionQualiteLabel(value: string | null | undefined) {
  if (value === "a_recuperer") return "A recuperer";
  if (value === "a_detruire") return "A detruire";
  if (value) return "Conforme";
  return "-";
}

type ArretField =
  | "arret_depot"
  | "arret_consommable_non_livre"
  | "arret_manque_conditionnement"
  | "arret_manque_vrac"
  | "arret_technique"
  | "arret_coupure_courant"
  | "arret_raclage_vrac"
  | "arret_changement_lot"
  | "arret_flacons_nc"
  | "arret_autre";

const ARRET_LABELS: { field: ArretField; label: string }[] = [
  { field: "arret_depot", label: "Arret depot" },
  { field: "arret_consommable_non_livre", label: "Arret consommable" },
  { field: "arret_manque_conditionnement", label: "Arret manque cond." },
  { field: "arret_manque_vrac", label: "Arret manque vrac" },
  { field: "arret_technique", label: "Arret technique" },
  { field: "arret_coupure_courant", label: "Arret coupure courant" },
  { field: "arret_raclage_vrac", label: "Arret raclage vrac" },
  { field: "arret_changement_lot", label: "Arret changement lot" },
  { field: "arret_flacons_nc", label: "Arret flacons NC" },
  { field: "arret_autre", label: "Autre arret" },
];

type FabricationArretField =
  | "fabrication_arret_absence_air"
  | "fabrication_arret_absence_vapeur"
  | "fabrication_arret_attente_aspiration_aqueuse"
  | "fabrication_arret_attente_cuves_mobiles"
  | "fabrication_arret_attente_eau_osmosee"
  | "fabrication_arret_coupure_electrique"
  | "fabrication_arret_maintenance_plateforme"
  | "fabrication_arret_manque_cuves_mobiles"
  | "fabrication_arret_probleme_pompe"
  | "fabrication_arret_probleme_ph"
  | "fabrication_arret_probleme_technique";

const FABRICATION_ARRET_LABELS: { field: FabricationArretField; label: string }[] = [
  { field: "fabrication_arret_absence_air", label: "Absence d'air" },
  { field: "fabrication_arret_absence_vapeur", label: "Absence de vapeur" },
  { field: "fabrication_arret_attente_aspiration_aqueuse", label: "Attente aspiration aqueuse vers trimix" },
  { field: "fabrication_arret_attente_cuves_mobiles", label: "Attente de cuves mobiles" },
  { field: "fabrication_arret_attente_eau_osmosee", label: "Attente eau osmosee" },
  { field: "fabrication_arret_coupure_electrique", label: "Coupure electrique" },
  { field: "fabrication_arret_maintenance_plateforme", label: "Maintenance sur la plateforme" },
  { field: "fabrication_arret_manque_cuves_mobiles", label: "Manque de cuves mobiles" },
  { field: "fabrication_arret_probleme_pompe", label: "Probleme de la pompe" },
  { field: "fabrication_arret_probleme_ph", label: "Probleme de PH" },
  { field: "fabrication_arret_probleme_technique", label: "Probleme technique" },
];

type EmballageArretField =
  | "emballage_arret_changement_bobine"
  | "emballage_arret_technique"
  | "emballage_arret_reglage"
  | "emballage_arret_coupure"
  | "emballage_arret_autre";

const EMBALLAGE_ARRET_LABELS: { field: EmballageArretField; label: string }[] = [
  { field: "emballage_arret_changement_bobine", label: "Arret changement bobine" },
  { field: "emballage_arret_technique", label: "Arret technique (emb.)" },
  { field: "emballage_arret_reglage", label: "Arret reglage" },
  { field: "emballage_arret_coupure", label: "Arret coupure" },
  { field: "emballage_arret_autre", label: "Autre arret (emb.)" },
];

type LigneRow = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  numero_lot: string | null;
  numero_lot_detail: { code: string; qt_vrac: number | null; qt_carton: number | null }[] | null;
  date_jour: string;
  vrac_a_fabriquer: number | null;
  qt_carton: number | null;
  groupe_id: number | null;
  created_at: string;
};

type RapportRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  machine: string | null;
  type_fabrication: string | null;
  preparateur: string | null;
  cuve_1_numero: string | null;
  cuve_1_poids: number | null;
  cuve_2_numero: string | null;
  cuve_2_poids: number | null;
  cuve_3_numero: string | null;
  cuve_3_poids: number | null;
  cuve_4_numero: string | null;
  cuve_4_poids: number | null;
  temps_debut_preparation: string | null;
  temps_envoi_echantillon_labo: string | null;
  temps_fin_test: string | null;
  temps_vidange: string | null;
  ph: number | null;
  densite: number | null;
  viscosite: number | null;
  degre_alcool: number | null;
  stabilite: string | null;
  couleur: string | null;
  temperature_test: number | null;
  odeur: string | null;
  taux_humidite: number | null;
  pression_atmospherique: number | null;
  texture: string | null;
  remarque: string | null;
  disposition_qualite: string | null;
  sous_derogation: boolean | null;
  motif_derogation: string | null;
  date_prise_echantillon: string | null;
  heure_prise_echantillon: string | null;
  heure_debut_analyse: string | null;
  heure_fin_analyse: string | null;
  nom_labo: string | null;
  utilisateur_test_labo: string | null;
  date_saisie_test_labo: string | null;
  vrac_fabrique: number | null;
  qt_vrac_recupere: number | null;
  code_vrac_recupere: string | null;
  chef_zone: string | null;
  chef_ligne: string | null;
  ravitailleur: string | null;
  tireur: string | null;
  qt_fabriquer: number | null;
  cadence: number | null;
  poids_reel: number | null;
  dechet_sleeve: number | null;
  dechet_capsule: number | null;
  dechet_pompe: number | null;
  dechet_flacon: number | null;
  dechet_pot: number | null;
  dechet_etiquette: number | null;
  arret_depot: number | null;
  arret_consommable_non_livre: number | null;
  arret_manque_conditionnement: number | null;
  arret_manque_vrac: number | null;
  arret_technique: number | null;
  arret_coupure_courant: number | null;
  arret_raclage_vrac: number | null;
  arret_changement_lot: number | null;
  arret_flacons_nc: number | null;
  arret_autre: number | null;
  temps_demarage_lot: string | null;
  temps_arret_batch: string | null;
  date_fabrication_conditionnement: string | null;
  date_peremption: string | null;
  emballage_machine: string | null;
  emballage_operateur: string | null;
  emballage_scotcheuse: string | null;
  emballage_temps_demarrer: string | null;
  emballage_temps_arret: string | null;
  emballage_arret_changement_bobine: number | null;
  emballage_arret_technique: number | null;
  emballage_arret_reglage: number | null;
  emballage_arret_coupure: number | null;
  emballage_arret_autre: number | null;
  fabrication_arret_absence_air: number | null;
  fabrication_arret_absence_vapeur: number | null;
  fabrication_arret_attente_aspiration_aqueuse: number | null;
  fabrication_arret_attente_cuves_mobiles: number | null;
  fabrication_arret_attente_eau_osmosee: number | null;
  fabrication_arret_coupure_electrique: number | null;
  fabrication_arret_maintenance_plateforme: number | null;
  fabrication_arret_manque_cuves_mobiles: number | null;
  fabrication_arret_probleme_pompe: number | null;
  fabrication_arret_probleme_ph: number | null;
  fabrication_arret_probleme_technique: number | null;
  utilisateur_fabrication: string | null;
  date_saisie_fabrication: string | null;
  utilisateur_conditionnement: string | null;
  date_saisie_conditionnement: string | null;
  utilisateur_emballage: string | null;
  date_saisie_emballage: string | null;
};

type EntryRow = {
  id: number;
  programme_ligne_id: number;
  quantite: number;
  date_jour: string;
};

type StageEntry = { entryId: number; quantite: number; date: string };

type DisplayRow = {
  key: string;
  ligne: LigneRow;
  rapport: RapportRow | null;
  fabrication: StageEntry | null;
  conditionnement: StageEntry | null;
  emballage: StageEntry | null;
  isGeneral: boolean;
  generalRapportId: number | null;
  displayCode: string;
  displayVrac: number | null;
  displayCarton: number | null;
};

// Une ligne "Programme par ligne" decoupee en plusieurs lots (voir
// buildDispatcherDraftRows) stocke ses codes joints dans numero_lot
// ("AA4140V, AA4141V, AA4142V") avec le total combine, et leur repartition
// qt_vrac/qt_carton figee au moment du Save dans numero_lot_detail (meme
// mecanisme que splitLigneIntoDisplayRows sur le Dashboard) - chaque code
// est un lot physique distinct, donc affiche ici sa PROPRE ligne au lieu
// des 3 codes empiles sur une seule ligne avec le total combine repete.
// Sans detail fige (ligne d'avant l'ajout de cette colonne, ou lot unique)
// on revient a l'affichage combine.
function splitLigneByCode(
  ligne: LigneRow
): { code: string; vrac: number | null; carton: number | null }[] {
  const codes = (ligne.numero_lot || "").split(",").map((code) => code.trim()).filter(Boolean);
  const detail = ligne.numero_lot_detail ?? [];

  if (codes.length <= 1 || detail.length !== codes.length) {
    return [{ code: ligne.numero_lot || "-", vrac: ligne.vrac_a_fabriquer, carton: ligne.qt_carton }];
  }

  return detail.map((entry) => ({
    code: entry.code || "-",
    vrac: entry.qt_vrac,
    carton: entry.qt_carton,
  }));
}

async function fetchAllRows<T>(
  table: string,
  columns: string
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) return { rows, error: `${table} : ${error.message}` };

    const chunk = (data ?? []) as unknown as T[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

const RAPPORT_COLUMNS =
  "id, programme_ligne_id, code, machine, type_fabrication, preparateur, cuve_1_numero, cuve_1_poids, cuve_2_numero, cuve_2_poids, cuve_3_numero, cuve_3_poids, cuve_4_numero, cuve_4_poids, temps_debut_preparation, temps_envoi_echantillon_labo, temps_fin_test, temps_vidange, ph, densite, viscosite, degre_alcool, stabilite, couleur, temperature_test, odeur, taux_humidite, pression_atmospherique, texture, remarque, disposition_qualite, sous_derogation, motif_derogation, date_prise_echantillon, heure_prise_echantillon, heure_debut_analyse, heure_fin_analyse, nom_labo, utilisateur_test_labo, date_saisie_test_labo, vrac_fabrique, qt_vrac_recupere, code_vrac_recupere, chef_zone, chef_ligne, ravitailleur, tireur, qt_fabriquer, cadence, poids_reel, dechet_sleeve, dechet_capsule, dechet_pompe, dechet_flacon, dechet_pot, dechet_etiquette, arret_depot, arret_consommable_non_livre, arret_manque_conditionnement, arret_manque_vrac, arret_technique, arret_coupure_courant, arret_raclage_vrac, arret_changement_lot, arret_flacons_nc, arret_autre, temps_demarage_lot, temps_arret_batch, date_fabrication_conditionnement, date_peremption, emballage_machine, emballage_operateur, emballage_scotcheuse, emballage_temps_demarrer, emballage_temps_arret, emballage_arret_changement_bobine, emballage_arret_technique, emballage_arret_reglage, emballage_arret_coupure, emballage_arret_autre, fabrication_arret_absence_air, fabrication_arret_absence_vapeur, fabrication_arret_attente_aspiration_aqueuse, fabrication_arret_attente_cuves_mobiles, fabrication_arret_attente_eau_osmosee, fabrication_arret_coupure_electrique, fabrication_arret_maintenance_plateforme, fabrication_arret_manque_cuves_mobiles, fabrication_arret_probleme_pompe, fabrication_arret_probleme_ph, fabrication_arret_probleme_technique, utilisateur_fabrication, date_saisie_fabrication, utilisateur_conditionnement, date_saisie_conditionnement, utilisateur_emballage, date_saisie_emballage";

function groupEntriesByLigne(entries: EntryRow[]): Map<number, EntryRow[]> {
  const map = new Map<number, EntryRow[]>();
  for (const entry of entries) {
    const list = map.get(entry.programme_ligne_id) ?? [];
    list.push(entry);
    map.set(entry.programme_ligne_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.date_jour.localeCompare(b.date_jour));
  }
  return map;
}

function toStageEntry(entry: EntryRow | undefined): StageEntry | null {
  return entry ? { entryId: entry.id, quantite: entry.quantite, date: entry.date_jour } : null;
}

// Une ligne affichee = un code. Fabrication/Conditionnement/Emballage
// partagent la MEME ligne meme si leurs dates different entre elles - une
// ligne supplementaire n'est creee que si une MEME etape a ete faite
// plusieurs fois pour ce code (ex: 2 passages d'emballage un jour different
// chacun) : la 2eme occurrence de cette etape va sur une ligne de plus,
// avec seulement les colonnes de cette etape remplies. Une ligne de
// programme avec un rapport mais aucune quantite encore saisie garde quand
// meme une ligne "generale", pour ne rien perdre de visible.
type BaseDisplayRow = Omit<DisplayRow, "displayCode" | "displayVrac" | "displayCarton">;

// Conditionnement/Emballage sont desormais saisis PAR CODE (voir
// upsertRapport) - une ligne decoupee en plusieurs lots a donc plusieurs
// lignes production_rapports (une par code), plus eventuellement l'ancienne
// ligne "partagee" (code "") utilisee par Fabrication (qui reste au niveau
// de la ligne entiere) ou laissee par une saisie d'avant ce decoupage. Le
// rapport affiche pour un code precis fusionne les 2 : priorite au rapport
// de CE code (Conditionnement/Emballage), complete par les champs du
// rapport partage (Fabrication, ou tout ce qui n'a jamais ete resaisi
// depuis par code).
function mergeRapports(codeSpecific: RapportRow | null, legacy: RapportRow | null): RapportRow | null {
  if (!codeSpecific) return legacy;
  if (!legacy) return codeSpecific;
  const merged = { ...codeSpecific };
  for (const key of Object.keys(legacy) as (keyof RapportRow)[]) {
    if (merged[key] === null || merged[key] === undefined) {
      (merged as Record<string, unknown>)[key] = legacy[key];
    }
  }
  return merged;
}

function buildDisplayRows(
  lignes: LigneRow[],
  rapportRows: RapportRow[],
  vracEntries: EntryRow[],
  cartonEntries: EntryRow[],
  emballageEntries: EntryRow[]
): DisplayRow[] {
  const ligneById = new Map(lignes.map((ligne) => [ligne.id, ligne]));
  const vracByLigne = groupEntriesByLigne(vracEntries);
  const cartonByLigne = groupEntriesByLigne(cartonEntries);
  const emballageByLigne = groupEntriesByLigne(emballageEntries);

  const rapportByLigneAndCode = new Map<string, RapportRow>();
  const legacyRapportByLigne = new Map<number, RapportRow>();
  const anyRapportByLigne = new Map<number, RapportRow>();
  for (const rapport of rapportRows) {
    rapportByLigneAndCode.set(`${rapport.programme_ligne_id}::${rapport.code}`, rapport);
    if (!rapport.code) legacyRapportByLigne.set(rapport.programme_ligne_id, rapport);
    anyRapportByLigne.set(rapport.programme_ligne_id, rapport);
  }

  const allLigneIds = new Set<number>([
    ...vracByLigne.keys(),
    ...cartonByLigne.keys(),
    ...emballageByLigne.keys(),
    ...anyRapportByLigne.keys(),
  ]);

  const rows: BaseDisplayRow[] = [];

  for (const ligneId of allLigneIds) {
    const ligne = ligneById.get(ligneId);
    if (!ligne) continue;
    // Rapport "provisoire" pour cette passe (avant eclatement par code) -
    // sert seulement a detecter une ligne "generale" (rapport sans encore
    // aucune entree) ; le rapport reellement affiche est resolu PAR CODE
    // plus bas (voir expandedRows), une fois le/les code(s) connus.
    const rapport = anyRapportByLigne.get(ligneId) ?? null;

    const vracList = vracByLigne.get(ligneId) ?? [];
    const cartonList = cartonByLigne.get(ligneId) ?? [];
    const emballageList = emballageByLigne.get(ligneId) ?? [];

    if (vracList.length === 0 && cartonList.length === 0 && emballageList.length === 0) {
      if (!rapport) continue;
      rows.push({
        key: `gen-${rapport.id}`,
        ligne,
        rapport,
        fabrication: null,
        conditionnement: null,
        emballage: null,
        isGeneral: true,
        generalRapportId: rapport.id,
      });
      continue;
    }

    const extraCount = Math.max(vracList.length, cartonList.length, emballageList.length, 1) - 1;

    rows.push({
      key: `ligne-${ligneId}-0`,
      ligne,
      rapport,
      fabrication: toStageEntry(vracList[0]),
      conditionnement: toStageEntry(cartonList[0]),
      emballage: toStageEntry(emballageList[0]),
      isGeneral: false,
      generalRapportId: null,
    });

    for (let i = 1; i <= extraCount; i++) {
      const fabrication = toStageEntry(vracList[i]);
      const conditionnement = toStageEntry(cartonList[i]);
      const emballage = toStageEntry(emballageList[i]);
      if (!fabrication && !conditionnement && !emballage) continue;

      rows.push({
        key: `ligne-${ligneId}-${i}`,
        ligne,
        rapport,
        fabrication,
        conditionnement,
        emballage,
        isGeneral: false,
        generalRapportId: null,
      });
    }
  }

  function rowRecencyId(row: BaseDisplayRow): number {
    return Math.max(
      row.fabrication?.entryId ?? 0,
      row.conditionnement?.entryId ?? 0,
      row.emballage?.entryId ?? 0,
      row.generalRapportId ?? 0
    );
  }

  // La 1ere ligne affichee doit etre celle avec la date la PLUS RECENTE
  // (date de l'etape saisie, pas l'id de creation de l'entree) - trier par
  // id placait a tort une ligne datee du 6/5 avant une datee du 10/5 des
  // que la saisie du 6/5 avait ete faite APRES celle du 10/5 (ex:
  // completer un jour manque a posteriori), ce qui melangeait l'ordre des
  // dates affichees au lieu de les montrer proprement du plus recent au
  // plus ancien. L'id ne sert plus que de departage entre 2 lignes de la
  // meme date.
  function rowSortDate(row: BaseDisplayRow): string {
    const dates = [row.fabrication?.date, row.conditionnement?.date, row.emballage?.date].filter(
      (date): date is string => Boolean(date)
    );
    if (dates.length === 0) return row.ligne.date_jour || "";
    return dates.reduce((max, date) => (date > max ? date : max));
  }

  rows.sort((a, b) => {
    const dateCompare = rowSortDate(b).localeCompare(rowSortDate(a));
    if (dateCompare !== 0) return dateCompare;
    return rowRecencyId(b) - rowRecencyId(a);
  });

  // Une ligne dont le vrac a ete reparti sur plusieurs lots (voir
  // splitLigneByCode) devient plusieurs lignes d'affichage, une par code -
  // Conditionnement/Emballage sont desormais saisis par code (voir
  // mergeRapports plus haut), seule Fabrication reste partagee entre tous
  // les codes d'une meme ligne.
  const expandedRows: DisplayRow[] = [];
  for (const row of rows) {
    const codeSplits = splitLigneByCode(row.ligne);
    codeSplits.forEach((split, index) => {
      const codeSpecific = rapportByLigneAndCode.get(`${row.ligne.id}::${split.code}`) ?? null;
      const legacy = legacyRapportByLigne.get(row.ligne.id) ?? null;
      const rapport = mergeRapports(codeSpecific, legacy);

      expandedRows.push({
        ...row,
        rapport,
        generalRapportId: row.isGeneral ? (rapport?.id ?? row.generalRapportId) : row.generalRapportId,
        key: codeSplits.length > 1 ? `${row.key}-code${index}` : row.key,
        displayCode: split.code,
        displayVrac: split.vrac,
        displayCarton: split.carton,
      });
    });
  }

  return expandedRows;
}

const PAGE_SIZE = 200;

type SearchParams = Promise<{ code?: string; produit?: string; date?: string; page?: string }>;

export default async function SuiviProductionListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "productionSuiviProductionListe");
  const params = await searchParams;
  const codeFilter = (params.code || "").trim().toLowerCase();
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const dateFilter = (params.date || "").trim();
  const hasFilters = Boolean(codeFilter || produitFilter || dateFilter);
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  const [lignesResult, rapportsResult, vracResult, cartonResult, emballageResult] = await Promise.all([
    fetchAllRows<LigneRow>(
      "programme_lignes",
      "id, zone, chaine, produit, numero_lot, numero_lot_detail, date_jour, vrac_a_fabriquer, qt_carton, groupe_id, created_at"
    ),
    fetchAllRows<RapportRow>("production_rapports", RAPPORT_COLUMNS),
    fetchAllRows<EntryRow>("production_vrac_entries", "id, programme_ligne_id, quantite, date_jour"),
    fetchAllRows<EntryRow>("production_carton_entries", "id, programme_ligne_id, quantite, date_jour"),
    fetchAllRows<EntryRow>("production_emballage_entries", "id, programme_ligne_id, quantite, date_jour"),
  ]);

  const fetchError =
    lignesResult.error || rapportsResult.error || vracResult.error || cartonResult.error || emballageResult.error;

  const plCodeByGroupeId = computePlCodesByGroupeId(lignesResult.rows);

  const allRows = buildDisplayRows(
    lignesResult.rows,
    rapportsResult.rows,
    vracResult.rows,
    cartonResult.rows,
    emballageResult.rows
  );

  const codeOptions = [...new Set(allRows.map((row) => row.displayCode))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const produitOptions = [...new Set(allRows.map((row) => row.ligne.produit).filter((p): p is string => Boolean(p)))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));

  const rows = allRows.filter((row) => {
    if (codeFilter && !row.displayCode.toLowerCase().includes(codeFilter)) {
      return false;
    }
    if (produitFilter && !matchesArticleSearch(row.ligne.produit, produitFilter)) {
      return false;
    }
    // Une ligne a plusieurs dates possibles (date du programme, date de
    // chaque etape faite) - le filtre matche si l'une d'elles correspond,
    // pas seulement la date du programme, sinon une ligne dont seule
    // l'etape (fabrication/conditionnement/emballage) a ete faite au jour
    // recherche resterait invisible.
    if (
      dateFilter &&
      row.ligne.date_jour !== dateFilter &&
      row.fabrication?.date !== dateFilter &&
      row.conditionnement?.date !== dateFilter &&
      row.emballage?.date !== dateFilter
    ) {
      return false;
    }
    return true;
  });

  // Table tres large (plus de 100 colonnes) - avec des milliers de lignes,
  // tout rendre d'un coup fait exploser le temps de rendu et la memoire.
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageFrom = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(pageFrom, pageFrom + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.code) qs.set("code", params.code);
    if (params.produit) qs.set("produit", params.produit);
    if (params.date) qs.set("date", params.date);
    return `/production/suivi-production?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Suivi Production
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Une ligne par jour d&apos;activite (Fabrication / Conditionnement / Emballage) - un
                meme code peut avoir plusieurs lignes si ses etapes ont ete faites a des jours
                differents.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production" label="Retour production" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="code"
              defaultValue={params.code || ""}
              options={codeOptions}
              placeholder="Code (N Lot)"
            />
            <SearchableFilterInput
              name="produit"
              defaultValue={params.produit || ""}
              options={produitOptions}
              placeholder="Produit"
            />
            <input
              type="date"
              name="date"
              defaultValue={params.date || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/suivi-production"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        {fetchError ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Erreur de lecture des donnees : {fetchError}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {hasFilters
              ? "Aucun resultat pour ce filtre."
              : "Aucun rapport enregistre pour le moment. Ouvre une ligne depuis le Dashboard pour en ajouter un."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th rowSpan={2} className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-6 py-3 font-semibold align-bottom">
                      Article
                    </th>
                    <th rowSpan={2} className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-6 py-3 font-semibold align-bottom">
                      Code
                    </th>
                    <th rowSpan={2} className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-6 py-3 font-semibold align-bottom">
                      Vrac demande
                    </th>
                    <th rowSpan={2} className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-6 py-3 font-semibold align-bottom">
                      Carton demande
                    </th>
                    <th rowSpan={2} className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-6 py-3 font-semibold align-bottom">
                      Programme (PL)
                    </th>
                    <th colSpan={22} className="sticky top-0 z-20 border-b border-slate-200 bg-violet-50 px-6 py-2 text-center font-bold text-violet-800">
                      Test labo
                    </th>
                    <th colSpan={32} className="sticky top-0 z-20 border-b border-slate-200 bg-amber-50 px-6 py-2 text-center font-bold text-amber-800">
                      Fabrication
                    </th>
                    <th colSpan={32} className="sticky top-0 z-20 border-b border-slate-200 bg-sky-50 px-6 py-2 text-center font-bold text-sky-800">
                      Conditionnement
                    </th>
                    <th colSpan={14} className="sticky top-0 z-20 border-b border-slate-200 bg-emerald-50 px-6 py-2 text-center font-bold text-emerald-800">
                      Emballage
                    </th>
                    <th rowSpan={2} className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-6 py-3 font-semibold align-bottom">
                      Actions
                    </th>
                  </tr>
                  <tr>
                    {/* Test labo */}
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date prise echantillon</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Heure prise echantillon</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Heure debut analyse</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Heure fin analyse</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">pH</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Densite</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Viscosite</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Degre alcool</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Stabilite</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Couleur</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Temperature test</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Odeur</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Taux humidite</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Pression atmospherique</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Texture</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Statut qualite</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Sous derogation</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Motif derogation</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Remarque</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Laboratoire</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Saisi par (test labo)</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date saisie (test labo)</th>

                    {/* Fabrication */}
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date fabrication</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Machine fabrication</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Type</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Preparateur</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Cuve 1</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Poids cuve 1</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Cuve 2</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Poids cuve 2</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Cuve 3</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Poids cuve 3</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Cuve 4</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Poids cuve 4</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Debut preparation</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Envoi echantillon labo</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Fin test</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Vidange</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Vrac fabrique</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Qt vrac recupere</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Code vrac recupere</th>
                    {FABRICATION_ARRET_LABELS.map(({ field, label }) => (
                      <th key={field} className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Saisi par (fabrication)</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date saisie (fabrication)</th>

                    {/* Conditionnement */}
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date conditionnement</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Zone</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Chaine</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Chef zone</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Chef ligne</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Ravitailleur</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Tireur</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Cadence</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Poids reel</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Dechet sleeve</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Dechet capsule</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Dechet pompe</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Dechet flacon</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Dechet pot</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Dechet etiquette</th>
                    {ARRET_LABELS.map(({ field, label }) => (
                      <th key={field} className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Demarage lot</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Arret batch</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date fabrication</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date peremption</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Carton fabrique</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Saisi par (conditionnement)</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date saisie (conditionnement)</th>

                    {/* Emballage */}
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date emballage</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Machine emballage</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Operateur emballage</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Scotcheuse</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Demarage emballage</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Arret emballage</th>
                    {EMBALLAGE_ARRET_LABELS.map(({ field, label }) => (
                      <th key={field} className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Quantite emballage</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Saisi par (emballage)</th>
                    <th className="sticky top-[49px] z-10 bg-slate-50 px-6 py-3 font-semibold">Date saisie (emballage)</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => {
                    const r = row.rapport;
                    const showFab = row.fabrication !== null || row.isGeneral;
                    const showCond = row.conditionnement !== null || row.isGeneral;
                    const showEmb = row.emballage !== null || row.isGeneral;

                    return (
                      <tr key={row.key} className="border-t border-slate-100 align-top">
                        <td className="px-6 py-4 text-slate-600">{row.ligne.produit || "-"}</td>
                        <td className="px-6 py-4 font-medium text-slate-900">{row.displayCode}</td>
                        <td className="px-6 py-4 text-slate-600">{row.displayVrac ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.displayCarton !== null ? Math.round(row.displayCarton * 100) / 100 : "-"}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {row.ligne.groupe_id !== null ? plCodeByGroupeId.get(row.ligne.groupe_id) ?? "-" : "-"}
                        </td>

                        {/* Test labo */}
                        <td className="px-6 py-4 text-slate-600">
                          {showFab && r?.date_prise_echantillon ? formatDate(r.date_prise_echantillon) : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? r?.heure_prise_echantillon || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? r?.heure_debut_analyse || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? r?.heure_fin_analyse || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.ph ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.densite ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.viscosite ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.degre_alcool ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.stabilite || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.couleur || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.temperature_test ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.odeur || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.taux_humidite ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? r?.pression_atmospherique ?? "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.texture || "-" : "-"}</td>
                        <td
                          className={`px-6 py-4 ${
                            showFab && r?.disposition_qualite ? "font-semibold text-red-700" : "text-slate-600"
                          }`}
                        >
                          {showFab ? dispositionQualiteLabel(r?.disposition_qualite) : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? (r?.sous_derogation ? "Oui" : "Non") : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.motif_derogation || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.remarque || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.nom_labo || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? r?.utilisateur_test_labo || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? formatDateTime(r?.date_saisie_test_labo ?? null) : "-"}
                        </td>

                        {/* Fabrication */}
                        <td className="px-6 py-4 text-slate-900 font-semibold">
                          {row.fabrication ? formatDate(row.fabrication.date) : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.machine || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.type_fabrication || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.preparateur || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_1_numero || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_1_poids ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_2_numero || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_2_poids ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_3_numero || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_3_poids ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_4_numero || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.cuve_4_poids ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? r?.temps_debut_preparation || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? r?.temps_envoi_echantillon_labo || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.temps_fin_test || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.temps_vidange || "-" : "-"}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {row.fabrication ? row.fabrication.quantite : showFab ? r?.vrac_fabrique ?? "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.qt_vrac_recupere ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.code_vrac_recupere || "-" : "-"}</td>
                        {FABRICATION_ARRET_LABELS.map(({ field }) => (
                          <td
                            key={field}
                            className={`px-6 py-4 ${
                              showFab && Number(r?.[field] ?? 0) > 0
                                ? "font-semibold text-red-700"
                                : "text-slate-400"
                            }`}
                          >
                            {showFab ? r?.[field] ?? "-" : "-"}
                          </td>
                        ))}
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.utilisateur_fabrication || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {showFab ? formatDateTime(r?.date_saisie_fabrication ?? null) : "-"}
                        </td>

                        {/* Conditionnement */}
                        <td className="px-6 py-4 text-slate-900 font-semibold">
                          {row.conditionnement ? formatDate(row.conditionnement.date) : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? row.ligne.zone : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? row.ligne.chaine : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.chef_zone || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.chef_ligne || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.ravitailleur || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.tireur || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.cadence ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.poids_reel ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.dechet_sleeve ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.dechet_capsule ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.dechet_pompe ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.dechet_flacon ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.dechet_pot ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.dechet_etiquette ?? "-" : "-"}</td>
                        {ARRET_LABELS.map(({ field }) => (
                          <td
                            key={field}
                            className={`px-6 py-4 ${
                              showCond && Number(r?.[field] ?? 0) > 0
                                ? "font-semibold text-red-700"
                                : "text-slate-400"
                            }`}
                          >
                            {showCond ? r?.[field] ?? "-" : "-"}
                          </td>
                        ))}
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.temps_demarage_lot || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showCond ? r?.temps_arret_batch || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {showCond && r?.date_fabrication_conditionnement
                            ? formatDate(r.date_fabrication_conditionnement)
                            : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showCond && r?.date_peremption ? formatDate(r.date_peremption) : "-"}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {row.conditionnement
                            ? row.conditionnement.quantite
                            : showCond
                              ? r?.qt_fabriquer ?? "-"
                              : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showCond ? r?.utilisateur_conditionnement || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {showCond ? formatDateTime(r?.date_saisie_conditionnement ?? null) : "-"}
                        </td>

                        {/* Emballage */}
                        <td className="px-6 py-4 text-slate-900 font-semibold">
                          {row.emballage ? formatDate(row.emballage.date) : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showEmb ? r?.emballage_machine || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showEmb ? r?.emballage_operateur || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showEmb ? r?.emballage_scotcheuse || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {showEmb ? r?.emballage_temps_demarrer || "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showEmb ? r?.emballage_temps_arret || "-" : "-"}</td>
                        {EMBALLAGE_ARRET_LABELS.map(({ field }) => (
                          <td
                            key={field}
                            className={`px-6 py-4 ${
                              showEmb && Number(r?.[field] ?? 0) > 0
                                ? "font-semibold text-red-700"
                                : "text-slate-400"
                            }`}
                          >
                            {showEmb ? r?.[field] ?? "-" : "-"}
                          </td>
                        ))}
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {row.emballage ? row.emballage.quantite : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showEmb ? r?.utilisateur_emballage || "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {showEmb ? formatDateTime(r?.date_saisie_emballage ?? null) : "-"}
                        </td>

                        <td className="px-6 py-4">
                          {canDelete ? (
                            <DeleteRowButton
                              fabricationId={row.fabrication?.entryId}
                              conditionnementId={row.conditionnement?.entryId}
                              emballageId={row.emballage?.entryId}
                              rapportId={row.isGeneral ? row.generalRapportId : null}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {totalRows > 0 ? (
          <div className="flex items-center justify-between rounded-[1.75rem] border border-black/5 bg-white px-6 py-4 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-slate-500">
              Lignes {pageFrom + 1} a {Math.min(pageFrom + PAGE_SIZE, totalRows)} sur {totalRows}
            </p>

            <div className="flex gap-3">
              <Link
                href={buildPageHref(Math.max(1, currentPage - 1))}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage === 1
                    ? "pointer-events-none bg-slate-100 text-slate-400"
                    : "bg-slate-950 text-white"
                }`}
              >
                Precedent
              </Link>
              <Link
                href={buildPageHref(Math.min(totalPages, currentPage + 1))}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage >= totalPages
                    ? "pointer-events-none bg-slate-100 text-slate-400"
                    : "bg-slate-950 text-white"
                }`}
              >
                Suivant
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
