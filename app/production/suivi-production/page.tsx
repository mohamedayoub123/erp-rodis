import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "../suivi/data";
import { DeleteRowButton } from "./delete-row-button";

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

type LigneRow = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  numero_lot: string | null;
  date_jour: string;
  vrac_a_fabriquer: number | null;
  qt_carton: number | null;
};

type RapportRow = {
  id: number;
  programme_ligne_id: number;
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
  stabilite: string | null;
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
};

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
  "id, programme_ligne_id, machine, type_fabrication, preparateur, cuve_1_numero, cuve_1_poids, cuve_2_numero, cuve_2_poids, cuve_3_numero, cuve_3_poids, cuve_4_numero, cuve_4_poids, temps_debut_preparation, temps_envoi_echantillon_labo, temps_fin_test, temps_vidange, ph, densite, viscosite, stabilite, vrac_fabrique, qt_vrac_recupere, code_vrac_recupere, chef_zone, chef_ligne, ravitailleur, tireur, qt_fabriquer, cadence, poids_reel, dechet_sleeve, dechet_capsule, dechet_pompe, dechet_flacon, dechet_pot, dechet_etiquette, arret_depot, arret_consommable_non_livre, arret_manque_conditionnement, arret_manque_vrac, arret_technique, arret_coupure_courant, arret_raclage_vrac, arret_changement_lot, arret_flacons_nc, arret_autre, temps_demarage_lot, temps_arret_batch, date_fabrication_conditionnement, date_peremption, emballage_machine, emballage_operateur, emballage_scotcheuse, emballage_temps_demarrer, emballage_temps_arret";

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
function buildDisplayRows(
  lignes: LigneRow[],
  rapportsByLigneId: Map<number, RapportRow>,
  vracEntries: EntryRow[],
  cartonEntries: EntryRow[],
  emballageEntries: EntryRow[]
): DisplayRow[] {
  const ligneById = new Map(lignes.map((ligne) => [ligne.id, ligne]));
  const vracByLigne = groupEntriesByLigne(vracEntries);
  const cartonByLigne = groupEntriesByLigne(cartonEntries);
  const emballageByLigne = groupEntriesByLigne(emballageEntries);

  const allLigneIds = new Set<number>([
    ...vracByLigne.keys(),
    ...cartonByLigne.keys(),
    ...emballageByLigne.keys(),
    ...rapportsByLigneId.keys(),
  ]);

  const rows: DisplayRow[] = [];

  for (const ligneId of allLigneIds) {
    const ligne = ligneById.get(ligneId);
    if (!ligne) continue;
    const rapport = rapportsByLigneId.get(ligneId) ?? null;

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

  rows.sort((a, b) => (a.ligne.numero_lot || "").localeCompare(b.ligne.numero_lot || ""));

  return rows;
}

const PAGE_SIZE = 200;

type SearchParams = Promise<{ code?: string; produit?: string; page?: string }>;

export default async function SuiviProductionListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const codeFilter = (params.code || "").trim().toLowerCase();
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const hasFilters = Boolean(codeFilter || produitFilter);
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  const [lignesResult, rapportsResult, vracResult, cartonResult, emballageResult] = await Promise.all([
    fetchAllRows<LigneRow>(
      "programme_lignes",
      "id, zone, chaine, produit, numero_lot, date_jour, vrac_a_fabriquer, qt_carton"
    ),
    fetchAllRows<RapportRow>("production_rapports", RAPPORT_COLUMNS),
    fetchAllRows<EntryRow>("production_vrac_entries", "id, programme_ligne_id, quantite, date_jour"),
    fetchAllRows<EntryRow>("production_carton_entries", "id, programme_ligne_id, quantite, date_jour"),
    fetchAllRows<EntryRow>("production_emballage_entries", "id, programme_ligne_id, quantite, date_jour"),
  ]);

  const fetchError =
    lignesResult.error || rapportsResult.error || vracResult.error || cartonResult.error || emballageResult.error;

  const rapportsByLigneId = new Map(
    rapportsResult.rows.map((rapport) => [rapport.programme_ligne_id, rapport])
  );

  const allRows = buildDisplayRows(
    lignesResult.rows,
    rapportsByLigneId,
    vracResult.rows,
    cartonResult.rows,
    emballageResult.rows
  );

  const rows = allRows.filter((row) => {
    if (codeFilter && !(row.ligne.numero_lot || "").toLowerCase().includes(codeFilter)) {
      return false;
    }
    if (produitFilter && !(row.ligne.produit || "").toLowerCase().includes(produitFilter)) {
      return false;
    }
    return true;
  });

  // Table tres large (61 colonnes) - avec des milliers de lignes, tout
  // rendre d'un coup fait exploser le temps de rendu et la memoire.
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageFrom = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(pageFrom, pageFrom + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.code) qs.set("code", params.code);
    if (params.produit) qs.set("produit", params.produit);
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
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code (N Lot)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="text"
              name="produit"
              defaultValue={params.produit || ""}
              placeholder="Produit"
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
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th rowSpan={2} className="border-b border-slate-200 px-6 py-3 font-semibold align-bottom">
                      Article
                    </th>
                    <th rowSpan={2} className="border-b border-slate-200 px-6 py-3 font-semibold align-bottom">
                      Code
                    </th>
                    <th rowSpan={2} className="border-b border-slate-200 px-6 py-3 font-semibold align-bottom">
                      Vrac demande
                    </th>
                    <th rowSpan={2} className="border-b border-slate-200 px-6 py-3 font-semibold align-bottom">
                      Carton demande
                    </th>
                    <th colSpan={23} className="border-b border-slate-200 bg-amber-50 px-6 py-2 text-center font-bold text-amber-800">
                      Fabrication
                    </th>
                    <th colSpan={30} className="border-b border-slate-200 bg-sky-50 px-6 py-2 text-center font-bold text-sky-800">
                      Conditionnement
                    </th>
                    <th colSpan={7} className="border-b border-slate-200 bg-emerald-50 px-6 py-2 text-center font-bold text-emerald-800">
                      Emballage
                    </th>
                    <th rowSpan={2} className="border-b border-slate-200 px-6 py-3 font-semibold align-bottom">
                      Actions
                    </th>
                  </tr>
                  <tr>
                    {/* Fabrication */}
                    <th className="px-6 py-3 font-semibold">Date fabrication</th>
                    <th className="px-6 py-3 font-semibold">Machine fabrication</th>
                    <th className="px-6 py-3 font-semibold">Type</th>
                    <th className="px-6 py-3 font-semibold">Preparateur</th>
                    <th className="px-6 py-3 font-semibold">Cuve 1</th>
                    <th className="px-6 py-3 font-semibold">Poids cuve 1</th>
                    <th className="px-6 py-3 font-semibold">Cuve 2</th>
                    <th className="px-6 py-3 font-semibold">Poids cuve 2</th>
                    <th className="px-6 py-3 font-semibold">Cuve 3</th>
                    <th className="px-6 py-3 font-semibold">Poids cuve 3</th>
                    <th className="px-6 py-3 font-semibold">Cuve 4</th>
                    <th className="px-6 py-3 font-semibold">Poids cuve 4</th>
                    <th className="px-6 py-3 font-semibold">Debut preparation</th>
                    <th className="px-6 py-3 font-semibold">Envoi echantillon labo</th>
                    <th className="px-6 py-3 font-semibold">Fin test</th>
                    <th className="px-6 py-3 font-semibold">Vidange</th>
                    <th className="px-6 py-3 font-semibold">pH</th>
                    <th className="px-6 py-3 font-semibold">Densite</th>
                    <th className="px-6 py-3 font-semibold">Viscosite</th>
                    <th className="px-6 py-3 font-semibold">Stabilite</th>
                    <th className="px-6 py-3 font-semibold">Vrac fabrique</th>
                    <th className="px-6 py-3 font-semibold">Qt vrac recupere</th>
                    <th className="px-6 py-3 font-semibold">Code vrac recupere</th>

                    {/* Conditionnement */}
                    <th className="px-6 py-3 font-semibold">Date conditionnement</th>
                    <th className="px-6 py-3 font-semibold">Zone</th>
                    <th className="px-6 py-3 font-semibold">Chaine</th>
                    <th className="px-6 py-3 font-semibold">Chef zone</th>
                    <th className="px-6 py-3 font-semibold">Chef ligne</th>
                    <th className="px-6 py-3 font-semibold">Ravitailleur</th>
                    <th className="px-6 py-3 font-semibold">Tireur</th>
                    <th className="px-6 py-3 font-semibold">Cadence</th>
                    <th className="px-6 py-3 font-semibold">Poids reel</th>
                    <th className="px-6 py-3 font-semibold">Dechet sleeve</th>
                    <th className="px-6 py-3 font-semibold">Dechet capsule</th>
                    <th className="px-6 py-3 font-semibold">Dechet pompe</th>
                    <th className="px-6 py-3 font-semibold">Dechet flacon</th>
                    <th className="px-6 py-3 font-semibold">Dechet pot</th>
                    <th className="px-6 py-3 font-semibold">Dechet etiquette</th>
                    {ARRET_LABELS.map(({ field, label }) => (
                      <th key={field} className="px-6 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                    <th className="px-6 py-3 font-semibold">Demarage lot</th>
                    <th className="px-6 py-3 font-semibold">Arret batch</th>
                    <th className="px-6 py-3 font-semibold">Date fabrication</th>
                    <th className="px-6 py-3 font-semibold">Date peremption</th>
                    <th className="px-6 py-3 font-semibold">Carton fabrique</th>

                    {/* Emballage */}
                    <th className="px-6 py-3 font-semibold">Date emballage</th>
                    <th className="px-6 py-3 font-semibold">Machine emballage</th>
                    <th className="px-6 py-3 font-semibold">Operateur emballage</th>
                    <th className="px-6 py-3 font-semibold">Scotcheuse</th>
                    <th className="px-6 py-3 font-semibold">Demarage emballage</th>
                    <th className="px-6 py-3 font-semibold">Arret emballage</th>
                    <th className="px-6 py-3 font-semibold">Quantite emballage</th>
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
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {row.ligne.numero_lot || "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{row.ligne.vrac_a_fabriquer ?? "-"}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {row.ligne.qt_carton !== null ? Math.round(row.ligne.qt_carton * 100) / 100 : "-"}
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
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.ph ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.densite ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.viscosite ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.stabilite ?? "-" : "-"}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {row.fabrication ? row.fabrication.quantite : showFab ? r?.vrac_fabrique ?? "-" : "-"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.qt_vrac_recupere ?? "-" : "-"}</td>
                        <td className="px-6 py-4 text-slate-600">{showFab ? r?.code_vrac_recupere || "-" : "-"}</td>

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
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {row.emballage ? row.emballage.quantite : "-"}
                        </td>

                        <td className="px-6 py-4">
                          <DeleteRowButton
                            fabricationId={row.fabrication?.entryId}
                            conditionnementId={row.conditionnement?.entryId}
                            emballageId={row.emballage?.entryId}
                            rapportId={row.isGeneral ? row.generalRapportId : null}
                          />
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
