import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { normalizeMachineName as normalize } from "@/lib/machine-match";

// Capacite usine = pour chaque JOUR du periode choisie, combien de machines
// ont tourne ce jour-la sur les N qui existent (ex: aujourd'hui 4 machines
// sur le programme = 4/N, demain 7 machines = 7/N), puis la moyenne de tous
// ces pourcentages journaliers sur la periode - demande explicite (avant,
// la page ne montrait qu'un instantane "en ce moment", sans filtre de date
// ni moyenne). Une machine est "active un jour donne" si elle est citee par
// au moins une ligne de programme dont date_jour == ce jour :
//   - type Fabrication : le champ libre "machine" d'un rapport de
//     fabrication (production_rapports.machine) rapproche du nom de la
//     machine (normalise : minuscule + espaces retires aux extremites,
//     pas de correction de faute de frappe - une machine dont le nom saisi
//     ne correspond a aucune machine de la liste apparaitra "Inactive" a
//     tort, a corriger a la saisie si ca arrive).
//   - autres types (Conditionnement...) : la chaine de la ligne de
//     programme (programme_lignes.chaine) rapprochee du nom de la machine
//     (ex: machine "chaine 1" <-> programme_lignes.chaine "CHAINE 1").
type MachineRow = { id: number; nom: string; zone: string | null; type: string | null };

type LigneActive = {
  id: number;
  zone: string;
  chaine: string;
  produit: string | null;
  date_jour: string;
  article_id: number | null;
};

type RapportMachineRow = { programme_ligne_id: number; machine: string | null };

type ArticleTypeRow = { id: number; type_article: string | null };

const MAX_RANGE_DAYS = 366;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetweenInclusive(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00`);
  const last = new Date(`${endIso}T00:00:00`);
  let guard = 0;
  while (cursor <= last && guard <= MAX_RANGE_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return days;
}

async function fetchAllMachines(): Promise<MachineRow[]> {
  const rows: MachineRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("machines")
      .select("id, nom, zone, type")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as MachineRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchLignesInRange(dateDebut: string, dateFin: string): Promise<LigneActive[]> {
  const rows: LigneActive[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, article_id")
      .gte("date_jour", dateDebut)
      .lte("date_jour", dateFin)
      .eq("exclu_rapports", false)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as LigneActive[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchArticleTypes(articleIds: number[]): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  if (articleIds.length === 0) return map;

  const { data, error } = await supabaseServer
    .from("articles")
    .select("id, type_article")
    .in("id", articleIds);

  if (error) return map;

  for (const row of (data ?? []) as ArticleTypeRow[]) {
    map.set(row.id, row.type_article);
  }

  return map;
}

async function fetchRapportsMachine(ligneIds: number[]): Promise<RapportMachineRow[]> {
  if (ligneIds.length === 0) return [];

  const rows: RapportMachineRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select("programme_ligne_id, machine")
      .in("programme_ligne_id", ligneIds)
      .not("machine", "is", null)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as RapportMachineRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function formatDateFr(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
}

type SearchParams = Promise<{ date_debut?: string; date_fin?: string }>;

export default async function RapportMachinesCapacitePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;

  const today = todayIso();
  let dateDebut = (params.date_debut || today).trim() || today;
  let dateFin = (params.date_fin || dateDebut).trim() || dateDebut;
  if (dateFin < dateDebut) {
    [dateDebut, dateFin] = [dateFin, dateDebut];
  }
  const calendarDays = daysBetweenInclusive(dateDebut, dateFin);

  const [machines, lignesInRange] = await Promise.all([fetchAllMachines(), fetchLignesInRange(dateDebut, dateFin)]);

  // Un jour sans AUCUNE ligne de programme (weekend, jour ferie...) ne doit
  // pas compter comme "0% de capacite" dans la moyenne - demande explicite,
  // ce n'est pas un jour travaille, donc pas un jour a evaluer.
  const joursAvecProgramme = new Set(lignesInRange.map((l) => l.date_jour));
  const days = calendarDays.filter((d) => joursAvecProgramme.has(d));

  const ligneIds = lignesInRange.map((l) => l.id);
  const articleIds = [...new Set(lignesInRange.map((l) => l.article_id).filter((id): id is number => id !== null))];
  const [rapportsMachine, articleTypeById] = await Promise.all([
    fetchRapportsMachine(ligneIds),
    fetchArticleTypes(articleIds),
  ]);

  const ligneById = new Map(lignesInRange.map((l) => [l.id, l]));

  // Jours (date_jour) ou chaque nom-machine normalise a ete cite via un
  // rapport Fabrication (production_rapports.machine).
  const joursActifsByMachineNameFabrication = new Map<string, Set<string>>();
  // Produits vus sur la periode pour chaque nom-machine (Fabrication).
  const produitsByMachineNameFabrication = new Map<string, Set<string>>();
  // Type d'article (articles.type_article) vu sur la periode pour chaque
  // nom-machine Fabrication - meme principe que Conditionnement, demande
  // explicite pour avoir la meme repartition par type cote Fabrication.
  const typesByMachineNameFabrication = new Map<string, Set<string>>();
  for (const rapport of rapportsMachine) {
    const key = normalize(rapport.machine);
    if (!key) continue;
    const ligne = ligneById.get(rapport.programme_ligne_id);
    if (!ligne) continue;

    const joursSet = joursActifsByMachineNameFabrication.get(key) ?? new Set<string>();
    joursSet.add(ligne.date_jour);
    joursActifsByMachineNameFabrication.set(key, joursSet);

    const produitsSet = produitsByMachineNameFabrication.get(key) ?? new Set<string>();
    produitsSet.add(ligne.produit || "-");
    produitsByMachineNameFabrication.set(key, produitsSet);

    const typeArticle = ligne.article_id ? articleTypeById.get(ligne.article_id) : null;
    if (typeArticle) {
      const typeSet = typesByMachineNameFabrication.get(key) ?? new Set<string>();
      typeSet.add(typeArticle);
      typesByMachineNameFabrication.set(key, typeSet);
    }
  }

  // Meme principe pour les machines non-Fabrication (Conditionnement...),
  // via programme_lignes.chaine directement (le programme planifie ce
  // jour-la, sans attendre un rapport).
  const joursActifsByChaineName = new Map<string, Set<string>>();
  const produitsByChaineName = new Map<string, Set<string>>();
  // Type d'article (articles.type_article, meme colonne "Type" que la page
  // Articles Produit Fini / Programme par ligne) vu sur la periode pour
  // chaque chaine - demande explicite pour voir la repartition
  // Conditionnement par type de produit, pas seulement Fabrication/
  // Conditionnement global.
  const typesByChaineName = new Map<string, Set<string>>();
  for (const ligne of lignesInRange) {
    const key = normalize(ligne.chaine);
    if (!key) continue;

    const joursSet = joursActifsByChaineName.get(key) ?? new Set<string>();
    joursSet.add(ligne.date_jour);
    joursActifsByChaineName.set(key, joursSet);

    const produitsSet = produitsByChaineName.get(key) ?? new Set<string>();
    produitsSet.add(ligne.produit || "-");
    produitsByChaineName.set(key, produitsSet);

    const typeArticle = ligne.article_id ? articleTypeById.get(ligne.article_id) : null;
    if (typeArticle) {
      const typeSet = typesByChaineName.get(key) ?? new Set<string>();
      typeSet.add(typeArticle);
      typesByChaineName.set(key, typeSet);
    }
  }

  const machineRows = machines
    .map((machine) => {
      const key = normalize(machine.nom);
      const isFabrication = normalize(machine.type) === "fabrication";
      const joursActifsSet = isFabrication
        ? joursActifsByMachineNameFabrication.get(key)
        : joursActifsByChaineName.get(key) ?? joursActifsByMachineNameFabrication.get(key);
      const produits = isFabrication
        ? produitsByMachineNameFabrication.get(key)
        : produitsByChaineName.get(key) ?? produitsByMachineNameFabrication.get(key);
      const types = isFabrication ? typesByMachineNameFabrication.get(key) : typesByChaineName.get(key);

      return {
        ...machine,
        joursActifs: joursActifsSet ?? new Set<string>(),
        activeAuMoinsUnJour: Boolean(joursActifsSet && joursActifsSet.size > 0),
        produits: produits ? [...produits] : [],
        types: types ? [...types] : [],
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  // Detail JOUR PAR JOUR : pour chaque jour du filtre, combien de machines
  // de "rows" ont tourne ce jour-la (compte brut, pas juste le %) - demande
  // explicite pour voir le detail derriere la moyenne, pas seulement le
  // resultat final.
  function capaciteParJour(rows: typeof machineRows) {
    return days.map((day) => {
      const activeCount = rows.filter((r) => r.joursActifs.has(day)).length;
      return { day, activeCount, total: rows.length, pct: rows.length > 0 ? (activeCount / rows.length) * 100 : 0 };
    });
  }

  // Pourcentage MOYEN sur la periode = moyenne des % journaliers ci-dessus -
  // pas un instantane "maintenant".
  function moyennePct(parJour: ReturnType<typeof capaciteParJour>) {
    if (parJour.length === 0) return null;
    return parJour.reduce((sum, j) => sum + j.pct, 0) / parJour.length;
  }

  const fabricationRows = machineRows.filter((r) => normalize(r.type) === "fabrication");
  const conditionnementRows = machineRows.filter((r) => normalize(r.type) === "conditionnement");
  const totalParJour = capaciteParJour(machineRows);
  const fabricationParJour = capaciteParJour(fabricationRows);
  const conditionnementParJour = capaciteParJour(conditionnementRows);
  const totalPct = moyennePct(totalParJour);
  const fabricationPct = moyennePct(fabricationParJour);
  const conditionnementPct = moyennePct(conditionnementParJour);

  // Repartition des machines actives AU MOINS UN JOUR de la periode, par
  // type de produit - une machine active sans type connu (article pas
  // rattache a un type_article) part dans "Type non renseigne". Meme calcul
  // pour Conditionnement et Fabrication - demande explicite.
  function typeBreakdownFor(rows: typeof machineRows) {
    const actives = rows.filter((r) => r.activeAuMoinsUnJour);
    const breakdown = new Map<string, number>();
    for (const machine of actives) {
      const types = machine.types.length > 0 ? machine.types : ["Type non renseigne"];
      for (const type of types) {
        breakdown.set(type, (breakdown.get(type) ?? 0) + 1);
      }
    }
    const rowsOut = [...breakdown.entries()]
      .map(([type, count]) => ({
        type,
        count,
        pct: actives.length > 0 ? (count / actives.length) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return { actives, rows: rowsOut };
  }

  const conditionnementBreakdown = typeBreakdownFor(conditionnementRows);
  const conditionnementActives = conditionnementBreakdown.actives;
  const typeBreakdownRows = conditionnementBreakdown.rows;
  const fabricationBreakdown = typeBreakdownFor(fabricationRows);
  const fabricationActives = fabricationBreakdown.actives;
  const fabricationTypeBreakdownRows = fabricationBreakdown.rows;

  function formatPct(value: number | null) {
    return value === null ? "-" : `${Math.round(value)}%`;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Capacite Equipements</h1>
              <p className="mt-2 text-sm text-slate-600">
                Pour chaque jour de la periode, quelle part des equipements de l&apos;usine a tourne (associes a une
                ligne de programme de ce jour-la) - le % affiche est la moyenne de tous ces jours.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="flex flex-wrap items-end gap-4">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Date debut
              <input
                type="date"
                name="date_debut"
                defaultValue={dateDebut}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Date fin
              <input
                type="date"
                name="date_fin"
                defaultValue={dateFin}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            <Link
              href="/production/rapport/machines-capacite"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
            >
              Aujourd&apos;hui
            </Link>
            <p className="text-xs text-slate-400">
              {days.length} jour{days.length > 1 ? "s" : ""} avec programme sur la periode du{" "}
              {formatDateFr(dateDebut)} au {formatDateFr(dateFin)}
              {calendarDays.length !== days.length
                ? ` (${calendarDays.length - days.length} jour(s) sans programme ignore(s))`
                : ""}
            </p>
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Capacite globale (moyenne)
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">{formatPct(totalPct)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {machineRows.filter((r) => r.activeAuMoinsUnJour).length} / {machineRows.length} machines actives au
              moins un jour
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-amber-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              Capacite Fabrication (moyenne)
            </p>
            <p className="mt-2 text-3xl font-black text-amber-900">{formatPct(fabricationPct)}</p>
            <p className="mt-1 text-xs text-amber-700/70">
              {fabricationRows.filter((r) => r.activeAuMoinsUnJour).length} / {fabricationRows.length} machines
              actives au moins un jour
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-sky-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
              Capacite Conditionnement (moyenne)
            </p>
            <p className="mt-2 text-3xl font-black text-sky-900">{formatPct(conditionnementPct)}</p>
            <p className="mt-1 text-xs text-sky-700/70">
              {conditionnementRows.filter((r) => r.activeAuMoinsUnJour).length} / {conditionnementRows.length}{" "}
              machines actives au moins un jour
            </p>
          </div>
        </section>

        {days.length > 1 ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="p-5 pb-0">
              <h2 className="text-lg font-bold text-slate-900">Detail par jour</h2>
              <p className="mt-1 text-sm text-slate-500">
                Combien de machines ont demarre chaque jour de la periode - la moyenne de cette colonne donne le %
                affiche au-dessus.
              </p>
            </div>
            <div className="max-h-[60vh] overflow-auto p-5 pt-3">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Fabrication</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Conditionnement</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day, index) => {
                    const fab = fabricationParJour[index];
                    const cond = conditionnementParJour[index];
                    const tot = totalParJour[index];
                    return (
                      <tr key={day} className="border-t border-slate-100">
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{formatDateFr(day)}</td>
                        <td className="px-4 py-2.5 text-amber-800">
                          {fab.activeCount} / {fab.total} ({Math.round(fab.pct)}%)
                        </td>
                        <td className="px-4 py-2.5 text-sky-800">
                          {cond.activeCount} / {cond.total} ({Math.round(cond.pct)}%)
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {tot.activeCount} / {tot.total} ({Math.round(tot.pct)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {fabricationTypeBreakdownRows.length > 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">
              Fabrication active - repartition par type
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Parmi les {fabricationActives.length} machine{fabricationActives.length > 1 ? "s" : ""} Fabrication
              actives au moins un jour sur la periode, quel type de produit elles fabriquent.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fabricationTypeBreakdownRows.map((row) => (
                <div key={row.type} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold capitalize text-slate-900">{row.type}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.min(100, Math.round(row.pct))}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600">
                      {row.count} ({Math.round(row.pct)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {typeBreakdownRows.length > 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">
              Conditionnement actif - repartition par type
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Parmi les {conditionnementActives.length} machine{conditionnementActives.length > 1 ? "s" : ""}{" "}
              Conditionnement actives au moins un jour sur la periode, quel type de produit elles fabriquent.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {typeBreakdownRows.map((row) => (
                <div key={row.type} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold capitalize text-slate-900">{row.type}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${Math.min(100, Math.round(row.pct))}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600">
                      {row.count} ({Math.round(row.pct)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {machineRows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Aucune machine enregistree pour le moment.{" "}
            <Link href="/production/machines" className="font-semibold text-sky-700 underline">
              Ajouter des machines
            </Link>
            .
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Equipement</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Zone</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Type</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Jours actifs</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Produit(s) sur la periode</th>
                  </tr>
                </thead>
                <tbody>
                  {machineRows.map((machine) => (
                    <tr key={machine.id} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        <Link href={`/production/machines/${machine.id}`} className="text-sky-700 underline">
                          {machine.nom}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{machine.zone || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">{machine.type || "-"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            machine.activeAuMoinsUnJour
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {machine.joursActifs.size} / {days.length} jour{days.length > 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {machine.produits.length > 0 ? machine.produits.join(", ") : "-"}
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
