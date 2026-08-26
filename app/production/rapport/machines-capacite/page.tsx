import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { normalizeMachineName as normalize } from "@/lib/machine-match";

// Capacite usine = combien de machines tournent EN CE MOMENT sur les 3
// (ou N) qui existent - "3 machines, je travaille avec les 3 = 100%",
// demande explicite de l'utilisateur. Une machine est "active" si elle est
// citee par au moins une ligne de programme PAS ENCORE terminee :
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

async function fetchLignesActives(): Promise<LigneActive[]> {
  const rows: LigneActive[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("id, zone, chaine, produit, date_jour, article_id")
      .or("programme_termine.eq.false,programme_termine.is.null")
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

export default async function RapportMachinesCapacitePage() {
  noStore();

  const [machines, lignesActives] = await Promise.all([fetchAllMachines(), fetchLignesActives()]);

  const ligneIds = lignesActives.map((l) => l.id);
  const articleIds = [...new Set(lignesActives.map((l) => l.article_id).filter((id): id is number => id !== null))];
  const [rapportsMachine, articleTypeById] = await Promise.all([
    fetchRapportsMachine(ligneIds),
    fetchArticleTypes(articleIds),
  ]);

  const ligneById = new Map(lignesActives.map((l) => [l.id, l]));

  // Produits actuellement associes a chaque nom-machine normalise (via le
  // champ "machine" des rapports Fabrication).
  const produitsByMachineNameFabrication = new Map<string, Set<string>>();
  for (const rapport of rapportsMachine) {
    const key = normalize(rapport.machine);
    if (!key) continue;
    const ligne = ligneById.get(rapport.programme_ligne_id);
    if (!ligne) continue;
    const set = produitsByMachineNameFabrication.get(key) ?? new Set<string>();
    set.add(ligne.produit || "-");
    produitsByMachineNameFabrication.set(key, set);
  }

  // Produits actuellement associes a chaque nom-chaine normalise (pour les
  // machines type Conditionnement, via programme_lignes.chaine).
  const produitsByChaineName = new Map<string, Set<string>>();
  // Type d'article (articles.type_article, meme colonne "Type" que la page
  // Articles Produit Fini / Programme par ligne) actuellement associe a
  // chaque chaine - demande explicite pour voir la repartition Conditionnement
  // par type de produit, pas seulement Fabrication/Conditionnement global.
  const typesByChaineName = new Map<string, Set<string>>();
  for (const ligne of lignesActives) {
    const key = normalize(ligne.chaine);
    if (!key) continue;
    const set = produitsByChaineName.get(key) ?? new Set<string>();
    set.add(ligne.produit || "-");
    produitsByChaineName.set(key, set);

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
      const produits = isFabrication
        ? produitsByMachineNameFabrication.get(key)
        : produitsByChaineName.get(key) ?? produitsByMachineNameFabrication.get(key);
      const active = Boolean(produits && produits.size > 0);
      const types = isFabrication ? undefined : typesByChaineName.get(key);

      return {
        ...machine,
        active,
        produits: produits ? [...produits] : [],
        types: types ? [...types] : [],
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  function capacitePct(rows: typeof machineRows) {
    if (rows.length === 0) return null;
    return (rows.filter((r) => r.active).length / rows.length) * 100;
  }

  const totalPct = capacitePct(machineRows);
  const fabricationRows = machineRows.filter((r) => normalize(r.type) === "fabrication");
  const conditionnementRows = machineRows.filter((r) => normalize(r.type) === "conditionnement");
  const fabricationPct = capacitePct(fabricationRows);
  const conditionnementPct = capacitePct(conditionnementRows);

  // Repartition des machines Conditionnement ACTIVES par type de produit
  // (articles.type_article) - une machine active sans type connu (article
  // pas rattache a un type_article) part dans "Type non renseigne".
  const conditionnementActives = conditionnementRows.filter((r) => r.active);
  const typeBreakdown = new Map<string, number>();
  for (const machine of conditionnementActives) {
    const types = machine.types.length > 0 ? machine.types : ["Type non renseigne"];
    for (const type of types) {
      typeBreakdown.set(type, (typeBreakdown.get(type) ?? 0) + 1);
    }
  }
  const typeBreakdownRows = [...typeBreakdown.entries()]
    .map(([type, count]) => ({
      type,
      count,
      pct: conditionnementActives.length > 0 ? (count / conditionnementActives.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

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
                Sur tous les equipements de l&apos;usine, combien tournent en ce moment (associes a une
                ligne de programme pas encore terminee).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Capacite globale
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">{formatPct(totalPct)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {machineRows.filter((r) => r.active).length} / {machineRows.length} machines actives
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-amber-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              Capacite Fabrication
            </p>
            <p className="mt-2 text-3xl font-black text-amber-900">{formatPct(fabricationPct)}</p>
            <p className="mt-1 text-xs text-amber-700/70">
              {fabricationRows.filter((r) => r.active).length} / {fabricationRows.length} machines actives
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-sky-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
              Capacite Conditionnement
            </p>
            <p className="mt-2 text-3xl font-black text-sky-900">{formatPct(conditionnementPct)}</p>
            <p className="mt-1 text-xs text-sky-700/70">
              {conditionnementRows.filter((r) => r.active).length} / {conditionnementRows.length} machines
              actives
            </p>
          </div>
        </section>

        {typeBreakdownRows.length > 0 ? (
          <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">
              Conditionnement actif - repartition par type
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Parmi les {conditionnementActives.length} machine{conditionnementActives.length > 1 ? "s" : ""}{" "}
              Conditionnement actuellement actives, quel type de produit elles fabriquent.
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
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Statut</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-6 py-4 font-semibold">Produit(s) en cours</th>
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
                            machine.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {machine.active ? "Active" : "Inactive"}
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
