import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { DeleteIconButton } from "@/app/_components/delete-icon-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { canDeletePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import {
  buildPdLabelByCode,
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllEmballageEntries,
  fetchAllProgrammeLignes,
  fetchAllVracEntries,
  formatDate,
  formatQty,
  groupCartonEntriesByLigne,
  pdLabelsForNumeroLot,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../suivi/data";
import { deleteProgrammeLigneRapportAction } from "./actions";

type Statut = "Termine" | "Termine Manuel" | "En cours" | "Pas commence";

// Statut par etape (Fabrication/Conditionnement/Emballage) - le statut
// combine existant ("Statut") ne dit pas LAQUELLE des 3 etapes bloque
// quand la ligne est "En cours". "naturel" (quantite reellement atteinte)
// est prioritaire sur "manuel" (bouton "Fin programme") : si la quantite a
// fini par suivre, la ligne serait de toute facon sortie du Dashboard
// toute seule - "Termine Manuel" ne doit apparaitre QUE quand le bouton
// est ce qui ferme la ligne, pas la quantite.
function stageStatut(manuel: boolean, naturel: boolean, started: boolean): Statut {
  if (naturel) return "Termine";
  if (manuel) return "Termine Manuel";
  return started ? "En cours" : "Pas commence";
}

function StatutBadge({ statut }: { statut: Statut }) {
  const className =
    statut === "Termine"
      ? "bg-emerald-100 text-emerald-800"
      : statut === "Termine Manuel"
        ? "bg-violet-100 text-violet-800"
        : statut === "En cours"
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{statut}</span>
  );
}

function DiffCell({ value, whole }: { value: number; whole?: boolean }) {
  const rounded = whole ? Math.round(value) : formatQty(value);
  const className =
    rounded > 0
      ? "font-semibold text-amber-700"
      : rounded < 0
        ? "font-semibold text-sky-700"
        : "text-emerald-700";

  return <td className={`px-4 py-3 ${className}`}>{rounded}</td>;
}

const PAGE_SIZE = 200;
const STATUT_OPTIONS: Statut[] = ["Termine", "Termine Manuel", "En cours", "Pas commence"];

type SearchParams = Promise<{
  code?: string;
  pd?: string;
  page?: string;
  statut?: string | string[];
  date_debut?: string;
  date_fin?: string;
}>;

export default async function RapportEcartsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const currentUser = await getCurrentStockUser();
  const canDelete = await canDeletePageUser(currentUser, "productionRapportEcarts");
  const codeFilter = (params.code || "").trim().toLowerCase();
  const pdFilter = (params.pd || "").trim().toLowerCase();
  const statutParam = Array.isArray(params.statut) ? params.statut : params.statut ? [params.statut] : [];
  const statutFilter = new Set(statutParam.filter((s): s is Statut => STATUT_OPTIONS.includes(s as Statut)));
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const hasSearchFilters = Boolean(codeFilter || pdFilter || dateDebutFilter || dateFinFilter);
  const hasFilters = hasSearchFilters || statutFilter.size > 0;
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  // Sans recherche, on se limite aux 3 derniers mois par defaut - une
  // recherche par code/PD/date repasse sans borne pour retrouver du vieux
  // (un filtre par date ne se contente pas de resserrer cette fenetre : une
  // ligne partage parfois un code avec une autre ligne plus ancienne, il
  // faut donc TOUJOURS repartir de l'historique complet pour que la
  // repartition entre lignes reste juste, puis filtrer par date seulement
  // a l'affichage, plus bas). Le filtre Statut ne change pas cette fenetre
  // (c'est un filtre d'affichage, pas une recherche de vieux code).
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sinceDate = hasSearchFilters ? undefined : threeMonthsAgo.toISOString().slice(0, 10);

  const [{ rows: lignes }, vracEntries, cartonEntries, emballageEntries, pdLabelByCode] =
    await Promise.all([
      fetchAllProgrammeLignes({ sinceDate }),
      fetchAllVracEntries(),
      fetchAllCartonEntries(),
      fetchAllEmballageEntries(),
      buildPdLabelByCode(),
    ]);

  // Le bouton "Terminer" du Dashboard enregistre desormais la fin PAR CODE
  // dans production_code_termine (voir markVracTermineAction), plus au
  // niveau de toute la ligne - sans ce check, un code termine sur le
  // Dashboard restait affiche "En cours" ici (ligne.vrac_termine ne bouge
  // jamais pour une fin par code), pendant que les autres codes de la meme
  // ligne restaient - a raison - non termines.
  const codeTermineRows = await fetchAllCodeTermineRows(lignes.map((ligne) => ligne.id));
  const terminatedCodes = new Set(
    codeTermineRows.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`)
  );

  function sumEntries(entries: { quantite: number }[]) {
    return entries.reduce((sum, entry) => sum + Number(entry.quantite), 0);
  }

  const vracByLigne = groupCartonEntriesByLigne(vracEntries);
  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);
  const emballageByLigne = groupCartonEntriesByLigne(emballageEntries);

  // Les codes (lots) d'une ligne, dans le meme ordre/texte que
  // splitLigneIntoDisplayRows (reutilise directement pour ne jamais
  // diverger sur le libelle exact d'un code).
  function ligneOwnCodes(ligne: ProgrammeLigneRow): string[] {
    return splitLigneIntoDisplayRows(ligne, "qt_vrac", 0).map((split) => split.displayCode);
  }

  // Deux lignes (2 produits differents) peuvent partager UN MEME code quand
  // le Dispatcher a regroupe leurs vracs dans un seul lot (petites qtes) -
  // union-find pour regrouper les lignes qui partagent au moins un code.
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

  // Repartit un total (pool reel fabrique) entre plusieurs "besoins" dans
  // l'ordre donne : chacun recoit d'abord de quoi couvrir son propre
  // besoin, le dernier de la liste recupere tout le reste (le surplus
  // reste visible au lieu d'etre perdu ou attribue au hasard).
  function cascadeFamily(tuples: { key: string; demande: number }[], totalPool: number): Map<string, number> {
    const result = new Map<string, number>();
    let remaining = totalPool;
    tuples.forEach((tuple, index) => {
      const isLast = index === tuples.length - 1;
      const amount = isLast ? Math.max(0, remaining) : Math.min(Math.max(0, remaining), Math.max(0, tuple.demande));
      result.set(tuple.key, amount);
      remaining -= amount;
    });
    return result;
  }

  type CodeRowBase = {
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

  // Etape 1 : decoupage par code AU SEIN de chaque ligne (deja fabrique
  // cascade dans l'ordre des codes de CETTE ligne) - meme decoupage que le
  // Dashboard : vrac/carton via splitLigneIntoDisplayRows, emballage via
  // computeProduitParCode qui lit le code par entree quand il est connu.
  const baseRowsByKey = new Map<string, CodeRowBase>();
  for (const ligne of lignesWithLot) {
    const vracEntriesForLigne = (vracByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];
    const cartonEntriesForLigne = (cartonByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];
    const emballageEntriesForLigne = (emballageByLigne.get(ligne.id) ?? []) as { code: string; quantite: number }[];

    const totalVracFabrique = sumEntries(vracEntriesForLigne);
    const totalCartonFabrique = sumEntries(cartonEntriesForLigne);

    const vracSplits = splitLigneIntoDisplayRows(ligne, "qt_vrac", totalVracFabrique);
    const cartonSplits = splitLigneIntoDisplayRows(ligne, "qt_carton", totalCartonFabrique);

    const codes = vracSplits.map((split) => split.displayCode);
    const cartonPrevuByCode = new Map(cartonSplits.map((split) => [split.displayCode, split.displayQuantite]));
    const cartonFabriqueByCode = new Map(
      cartonSplits.map((split) => [
        split.displayCode,
        split.displayQuantite !== null ? (split.displayQuantite ?? 0) - (split.displayRestant ?? 0) : null,
      ])
    );

    const emballageProduitByCode = computeProduitParCode(
      emballageEntriesForLigne,
      codes,
      (code) => cartonFabriqueByCode.get(code) ?? 0
    );

    for (const vracSplit of vracSplits) {
      const code = vracSplit.displayCode;
      const vracDemande = vracSplit.displayQuantite ?? ligne.vrac_a_fabriquer ?? 0;
      const vracFabrique =
        vracSplit.displayQuantite !== null
          ? (vracSplit.displayQuantite ?? 0) - (vracSplit.displayRestant ?? 0)
          : totalVracFabrique;
      const cartonDemande = cartonPrevuByCode.get(code) ?? ligne.qt_carton ?? 0;
      const cartonFabrique = cartonFabriqueByCode.get(code) ?? totalCartonFabrique;
      const cartonEmballe = emballageProduitByCode.get(code) ?? 0;

      baseRowsByKey.set(`${ligne.id}::${code}`, {
        ligne,
        code,
        vracDemande,
        vracFabrique,
        cartonDemande,
        cartonFabrique,
        cartonEmballe,
      });
    }
  }

  // Etape 2 : les lignes (produits differents) qui partagent un meme code
  // (lot regroupe par le Dispatcher) doivent se repartir la production de
  // CE code - sinon un produit affiche tout le fabrique en surplus pendant
  // que l'autre n'en voit rien. Remplace le resultat de l'etape 1
  // uniquement pour les lignes concernees (les autres restent inchangees).
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
    const familyEmballagePool = orderedIds.reduce(
      (sum, id) => sum + sumEntries((emballageByLigne.get(id) ?? []) as { quantite: number }[]),
      0
    );

    const vracByTuple = cascadeFamily(
      tupleKeys.map((key) => ({ key, demande: baseRowsByKey.get(key)?.vracDemande ?? 0 })),
      familyVracPool
    );
    const cartonByTuple = cascadeFamily(
      tupleKeys.map((key) => ({ key, demande: baseRowsByKey.get(key)?.cartonDemande ?? 0 })),
      familyCartonPool
    );
    const emballageByTuple = cascadeFamily(
      tupleKeys.map((key) => ({ key, demande: cartonByTuple.get(key) ?? 0 })),
      familyEmballagePool
    );

    for (const key of tupleKeys) {
      const base = baseRowsByKey.get(key);
      if (!base) continue;
      baseRowsByKey.set(key, {
        ...base,
        vracFabrique: vracByTuple.get(key) ?? 0,
        cartonFabrique: cartonByTuple.get(key) ?? 0,
        cartonEmballe: emballageByTuple.get(key) ?? 0,
      });
    }
  }

  function buildEcartRow(base: CodeRowBase) {
    const { ligne, code, vracDemande, vracFabrique, cartonDemande, cartonFabrique, cartonEmballe } = base;

    // "Termine" = exactement quand la ligne a disparu des 3 colonnes du
    // Dashboard (reste <= 0 OU "Fin programme" appuye pour cette etape/ce
    // code precis, OU "Fin programme" general) - meme regle, pas une
    // estimation a part. Le bouton "Terminer" du Dashboard enregistre la fin
    // PAR CODE dans production_code_termine (terminatedCodes) ; les
    // drapeaux ligne.xxx_termine restent en repli pour les lignes/anciennes
    // saisies qui n'ont jamais eu qu'un seul code.
    // "manuel" = complete via le bouton "Fin programme" (pas parce que la
    // quantite a ete atteinte) - distingue de "naturel" pour afficher
    // "Termine Manuel" au lieu de "Termine" sur ces etapes-la.
    const vracManuel = Boolean(
      ligne.programme_termine || ligne.vrac_termine || terminatedCodes.has(`${ligne.id}::${code}::vrac`)
    );
    const vracNaturel = vracDemande <= 0 || vracFabrique >= vracDemande;
    const vracOk = vracManuel || vracNaturel;
    const cartonManuel = Boolean(
      ligne.programme_termine || ligne.carton_termine || terminatedCodes.has(`${ligne.id}::${code}::carton`)
    );
    const cartonNaturel = cartonDemande <= 0 || cartonFabrique >= cartonDemande;
    const cartonOk = cartonManuel || cartonNaturel;
    const emballageManuel = Boolean(
      ligne.programme_termine || ligne.emballage_termine || terminatedCodes.has(`${ligne.id}::${code}::emballage`)
    );
    // cartonDemande <= 0 : rien a emballer pour ce code, trivialement fait.
    // Sinon il faut que le conditionnement ait REELLEMENT produit quelque
    // chose (cartonFabrique > 0) et que l'emballage ait suivi - sinon une
    // ligne qui n'a encore rien fabrique affichait a tort "Termine" ici
    // (cartonFabrique <= 0 etait vrai aussi bien "rien a faire" que "rien
    // fait pour l'instant").
    const emballageNaturel = cartonDemande <= 0 || (cartonFabrique > 0 && cartonEmballe >= cartonFabrique);
    const emballageOk = emballageManuel || emballageNaturel;
    const hasStarted = vracFabrique > 0 || cartonFabrique > 0 || cartonEmballe > 0;
    // "Termine Manuel" seulement si au moins une etape depend du bouton
    // pour etre consideree fermee (les autres peuvent tres bien etre
    // naturellement completes en meme temps) - si les 3 sont naturellement
    // atteintes, le bouton n'a rien "force", donc "Termine" tout court.
    const allNaturel = vracNaturel && cartonNaturel && emballageNaturel;
    const statut: Statut =
      vracOk && cartonOk && emballageOk
        ? allNaturel
          ? "Termine"
          : "Termine Manuel"
        : hasStarted
          ? "En cours"
          : "Pas commence";

    return {
      statut,
      statutFabrication: stageStatut(vracManuel, vracNaturel, vracFabrique > 0),
      statutConditionnement: stageStatut(cartonManuel, cartonNaturel, cartonFabrique > 0),
      statutEmballage: stageStatut(emballageManuel, emballageNaturel, cartonEmballe > 0),
      id: ligne.id,
      key: `${ligne.id}::${code}`,
      date: ligne.date_jour,
      code,
      pd: pdLabelsForNumeroLot(code, pdLabelByCode),
      produit: ligne.produit || "-",
      vracDemande,
      vracFabrique,
      vracDiff: vracDemande - vracFabrique,
      cartonDemande,
      cartonFabrique,
      cartonDiff: cartonDemande - cartonFabrique,
      cartonEmballe,
      cartonEmballeDiff: cartonDemande - cartonEmballe,
      conditionnementEmballageDiff: cartonEmballe - cartonFabrique,
    };
  }

  const allRows = lignesWithLot.flatMap((ligne) =>
    ligneOwnCodes(ligne).flatMap((code) => {
      const base = baseRowsByKey.get(`${ligne.id}::${code}`);
      return base ? [buildEcartRow(base)] : [];
    })
  );

  const codeOptions = [...new Set(allRows.map((row) => row.code))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const pdOptions = [...new Set(allRows.map((row) => row.pd).filter((pd) => pd && pd !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));

  const rows = allRows.filter((row) => {
    if (codeFilter && !row.code.toLowerCase().includes(codeFilter)) return false;
    if (pdFilter && !row.pd.toLowerCase().includes(pdFilter)) return false;
    if (statutFilter.size > 0 && !statutFilter.has(row.statut)) return false;
    if (dateDebutFilter && row.date < dateDebutFilter) return false;
    if (dateFinFilter && row.date > dateFinFilter) return false;
    return true;
  });

  // Avec des milliers de codes, tout rendre d'un coup fait exploser le
  // temps de rendu et la memoire - meme filtre pagine que les autres
  // grosses listes de l'appli (/stock, /historique-programme...).
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(from, from + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.code) qs.set("code", params.code);
    if (params.pd) qs.set("pd", params.pd);
    if (params.date_debut) qs.set("date_debut", params.date_debut);
    if (params.date_fin) qs.set("date_fin", params.date_fin);
    for (const statut of statutFilter) qs.append("statut", statut);
    return `/production/rapport/ecarts?${qs.toString()}`;
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
                Rapport Ecarts Production
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Par code : vrac et carton demandes vs fabriques, et ecart entre ce qui a ete
                conditionne (carton) et ce qui a ete emballe.
              </p>
              {sinceDate ? (
                <p className="mt-1 text-xs text-slate-400">
                  Affiche les 3 derniers mois par defaut - cherche un code ou un PD pour
                  retrouver plus ancien.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="code"
              defaultValue={params.code || ""}
              options={codeOptions}
              placeholder="Code (N Lot)"
            />
            <SearchableFilterInput
              name="pd"
              defaultValue={params.pd || ""}
              options={pdOptions}
              placeholder="N programme (PD1, PD2...)"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/rapport/ecarts"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}

            <div className="flex flex-wrap items-end gap-4 sm:col-span-4">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date programme depuis
                <input
                  type="date"
                  name="date_debut"
                  defaultValue={params.date_debut || ""}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date programme jusqu&apos;au
                <input
                  type="date"
                  name="date_fin"
                  defaultValue={params.date_fin || ""}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-normal normal-case text-slate-900 outline-none"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:col-span-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Statut general
              </span>
              {STATUT_OPTIONS.map((statut) => (
                <label
                  key={statut}
                  className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    name="statut"
                    value={statut}
                    defaultChecked={statutFilter.has(statut)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {statut}
                </label>
              ))}
            </div>
          </form>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun code programme pour le moment."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                  <tr>
                    <th rowSpan={2} className="px-4 py-3 font-semibold align-bottom">Statut</th>
                    <th rowSpan={2} className="px-4 py-3 font-semibold align-bottom">Date programme</th>
                    <th rowSpan={2} className="px-4 py-3 font-semibold align-bottom">Code</th>
                    <th rowSpan={2} className="px-4 py-3 font-semibold align-bottom">Programme (PD)</th>
                    <th rowSpan={2} className="px-4 py-3 font-semibold align-bottom">Produit</th>
                    <th colSpan={5} className="bg-amber-50 px-4 py-2 text-center font-semibold text-amber-800">
                      Fabrication
                    </th>
                    <th colSpan={4} className="bg-sky-50 px-4 py-2 text-center font-semibold text-sky-800">
                      Conditionnement
                    </th>
                    <th colSpan={5} className="bg-emerald-50 px-4 py-2 text-center font-semibold text-emerald-800">
                      Emballage
                    </th>
                    {canDelete ? <th rowSpan={2} className="px-4 py-3 font-semibold align-bottom">Action</th> : null}
                  </tr>
                  <tr>
                    <th className="bg-amber-50/60 px-4 py-2 font-semibold text-amber-800">Statut</th>
                    <th className="bg-amber-50/60 px-4 py-2 font-semibold text-amber-800">Carton a fabriquer</th>
                    <th className="bg-amber-50/60 px-4 py-2 font-semibold text-amber-800">Vrac demande</th>
                    <th className="bg-amber-50/60 px-4 py-2 font-semibold text-amber-800">Vrac fabrique</th>
                    <th className="bg-amber-50/60 px-4 py-2 font-semibold text-amber-800">Ecart vrac</th>
                    <th className="bg-sky-50/60 px-4 py-2 font-semibold text-sky-800">Statut</th>
                    <th className="bg-sky-50/60 px-4 py-2 font-semibold text-sky-800">Carton demande</th>
                    <th className="bg-sky-50/60 px-4 py-2 font-semibold text-sky-800">Carton fabrique</th>
                    <th className="bg-sky-50/60 px-4 py-2 font-semibold text-sky-800">Ecart carton</th>
                    <th className="bg-emerald-50/60 px-4 py-2 font-semibold text-emerald-800">Statut</th>
                    <th className="bg-emerald-50/60 px-4 py-2 font-semibold text-emerald-800">Carton demande</th>
                    <th className="bg-emerald-50/60 px-4 py-2 font-semibold text-emerald-800">Carton emballe</th>
                    <th className="bg-emerald-50/60 px-4 py-2 font-semibold text-emerald-800">Ecart carton</th>
                    <th className="bg-emerald-50/60 px-4 py-2 font-semibold text-emerald-800">
                      Ecart emballage/conditionnement
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <StatutBadge statut={row.statut} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.code}</td>
                      <td className="px-4 py-3 text-slate-600">{row.pd}</td>
                      <td className="px-4 py-3 text-slate-600">{row.produit}</td>
                      <td className="bg-amber-50/30 px-4 py-3">
                        <StatutBadge statut={row.statutFabrication} />
                      </td>
                      <td className="bg-amber-50/30 px-4 py-3 text-slate-600">{Math.round(row.cartonDemande)}</td>
                      <td className="bg-amber-50/30 px-4 py-3 text-slate-600">{formatQty(row.vracDemande)}</td>
                      <td className="bg-amber-50/30 px-4 py-3 text-slate-600">{formatQty(row.vracFabrique)}</td>
                      <DiffCell value={row.vracDiff} />
                      <td className="bg-sky-50/30 px-4 py-3">
                        <StatutBadge statut={row.statutConditionnement} />
                      </td>
                      <td className="bg-sky-50/30 px-4 py-3 text-slate-600">{Math.round(row.cartonDemande)}</td>
                      <td className="bg-sky-50/30 px-4 py-3 text-slate-600">{Math.round(row.cartonFabrique)}</td>
                      <DiffCell value={row.cartonDiff} whole />
                      <td className="bg-emerald-50/30 px-4 py-3">
                        <StatutBadge statut={row.statutEmballage} />
                      </td>
                      <td className="bg-emerald-50/30 px-4 py-3 text-slate-600">{Math.round(row.cartonDemande)}</td>
                      <td className="bg-emerald-50/30 px-4 py-3 text-slate-600">{Math.round(row.cartonEmballe)}</td>
                      <DiffCell value={row.cartonEmballeDiff} whole />
                      <DiffCell value={row.conditionnementEmballageDiff} whole />
                      {canDelete ? (
                        <td className="px-4 py-3">
                          <form action={deleteProgrammeLigneRapportAction}>
                            <input type="hidden" name="ligne_id" value={row.id} />
                            <DeleteIconButton label="Supprimer cette ligne" />
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {totalRows > 0 ? (
          <div className="flex items-center justify-between rounded-[1.75rem] border border-black/5 bg-white px-6 py-4 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-slate-500">
              Codes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows}
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
