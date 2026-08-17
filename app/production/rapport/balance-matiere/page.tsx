import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import {
  buildPdLabelByCode,
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllEmballageEntries,
  fetchAllProgrammeLignes,
  fetchAllVracEntries,
  fetchArticleKgFactorsByIds,
  formatDate,
  formatQty,
  groupCartonEntriesByLigne,
  pdLabelsForNumeroLot,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../../suivi/data";

type PoidsReelRow = { programme_ligne_id: number; code: string; poids_reel: number | null };

// Poids reel releve en Conditionnement (grammes), par ligne+code - prime sur
// la contenance nominale de la fiche article pour la conversion carton->kg,
// demande explicite : le poids theorique ne reflete pas toujours le poids
// reellement mesure au conditionnement (ex: 239g releve vs 237g theorique).
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

// Rapport Balance Matiere : par code, compare la masse qui est ENTREE dans
// le process (vrac fabrique, deja en kg) a la masse qui en est SORTIE
// (carton fabrique, convertie en kg via piece_par_carton * contenance) pour
// voir la perte/le gain matiere. Le decoupage par code (vracDemande/
// vracFabrique/cartonDemande/cartonFabrique) est une COPIE ADAPTEE de la
// logique de /production/rapport/ecarts/page.tsx (buildLigneRoots/
// cascadeFamily/splitLigneIntoDisplayRows/computeProduitParCode) - dupliquee
// ici volontairement pour ne jamais toucher ce rapport existant. Si la
// logique de repartition par code change un jour sur Rapport Ecarts,
// reporter le changement ici a la main.
type Statut = "Termine" | "Termine Manuel" | "En cours" | "Pas commence";

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

// Ecart matiere = Vrac fabrique - Carton fabrique converti (kg). Colore
// seulement quand l'ecart (en % du vrac fabrique) sort d'une fourchette
// normale de process (perte ou gain matiere inhabituel) - simple repere
// visuel, pas une alerte qualite formelle. "flagEligible" = le
// conditionnement de ce code est fini (naturellement ou via "Fin
// programme") - sans ce garde-fou, un code dont le vrac est deja fait mais
// dont le carton n'a simplement pas encore demarre afficherait "100% de
// perte" en rouge en permanence, ce qui serait juste du bruit pour un code
// normalement en cours (verifie sur des donnees reelles : tres frequent).
function EcartMatiereCell({
  ecartKg,
  ecartPct,
  flagEligible,
}: {
  ecartKg: number | null;
  ecartPct: number | null;
  flagEligible: boolean;
}) {
  if (ecartKg === null) {
    return <td className="px-4 py-3 text-slate-400">-</td>;
  }

  const absPct = ecartPct === null ? null : Math.abs(ecartPct);
  const className =
    flagEligible && absPct !== null && absPct > 10
      ? "font-semibold text-red-700"
      : flagEligible && absPct !== null && absPct > 5
        ? "font-semibold text-amber-700"
        : "text-slate-600";

  return (
    <td className={`px-4 py-3 ${className}`}>
      {formatQty(ecartKg)}
      {ecartPct !== null ? (
        <span className="ml-1 text-xs font-normal text-slate-400">({formatQty(ecartPct)}%)</span>
      ) : null}
    </td>
  );
}

const PAGE_SIZE = 200;

type SearchParams = Promise<{
  produit?: string;
  code?: string;
  page?: string;
  date_debut?: string;
  date_fin?: string;
}>;

export default async function RapportBalanceMatierePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const hasFilters = Boolean(produitFilter || codeFilter || dateDebutFilter || dateFinFilter);
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  // Meme raisonnement que Rapport Ecarts : sans recherche, fenetre par
  // defaut de 3 mois (perf) - toute recherche (produit ou date) repasse sans
  // borne pour que la repartition par code (familles de lignes qui
  // partagent un lot) reste juste sur tout l'historique, puis filtre par
  // date seulement a l'affichage plus bas.
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sinceDate = hasFilters ? undefined : threeMonthsAgo.toISOString().slice(0, 10);

  const [{ rows: lignes }, vracEntries, cartonEntries, emballageEntries, pdLabelByCode] =
    await Promise.all([
      fetchAllProgrammeLignes({ sinceDate }),
      fetchAllVracEntries(),
      fetchAllCartonEntries(),
      fetchAllEmballageEntries(),
      buildPdLabelByCode(),
    ]);

  const codeTermineRows = await fetchAllCodeTermineRows(lignes.map((ligne) => ligne.id));
  const terminatedCodes = new Set(
    codeTermineRows.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`)
  );

  const articleFactors = await fetchArticleKgFactorsByIds(lignes.map((ligne) => ligne.article_id));
  const poidsReelByKey = await fetchPoidsReelByLigneCode(lignes.map((ligne) => ligne.id));

  function sumEntries(entries: { quantite: number }[]) {
    return entries.reduce((sum, entry) => sum + Number(entry.quantite), 0);
  }

  const vracByLigne = groupCartonEntriesByLigne(vracEntries);
  const cartonByLigne = groupCartonEntriesByLigne(cartonEntries);
  const emballageByLigne = groupCartonEntriesByLigne(emballageEntries);

  // Les codes (lots) d'une ligne, dans le meme ordre/texte que
  // splitLigneIntoDisplayRows.
  function ligneOwnCodes(ligne: ProgrammeLigneRow): string[] {
    return splitLigneIntoDisplayRows(ligne, "qt_vrac", 0).map((split) => split.displayCode);
  }

  // Deux lignes (2 produits differents) peuvent partager UN MEME code quand
  // le Dispatcher a regroupe leurs vracs dans un seul lot - union-find pour
  // regrouper les lignes qui partagent au moins un code.
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
  // besoin, le dernier de la liste recupere tout le reste.
  function cascadeFamily(
    tuples: { key: string; demande: number }[],
    totalPool: number
  ): Map<string, number> {
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

  // Etape 1 : decoupage par code AU SEIN de chaque ligne. La demande par
  // code vient toujours du split fige (numero_lot_detail) - mais le
  // FABRIQUE reel utilise desormais computeProduitParCode (meme helper deja
  // utilise plus bas pour l'emballage) : somme directe des entrees qui
  // portent deja le bon code, repli sur l'ancienne repartition en cascade
  // seulement pour les entrees historiques encore en code partage "".
  // Avant ce correctif, le fabrique venait du meme split "demande - restant"
  // que la demande elle-meme, ce qui PLAFONNAIT silencieusement le fabrique
  // reel a la demande (jamais de depassement visible, meme quand la
  // production reelle d'un code depassait ce qui etait prevu pour lui).
  const baseRowsByKey = new Map<string, CodeRowBase>();
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

    const vracFabriqueByCode = computeProduitParCode(
      vracEntriesForLigne,
      codes,
      (code) => vracDemandeByCode.get(code) ?? 0
    );
    const cartonFabriqueByCode = computeProduitParCode(
      cartonEntriesForLigne,
      codes,
      (code) => cartonDemandeByCode.get(code) ?? 0
    );

    for (const code of codes) {
      baseRowsByKey.set(`${ligne.id}::${code}`, {
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

  // Etape 2 : les lignes qui partagent un meme code (lot regroupe par le
  // Dispatcher) se repartissent la production reelle de ce code.
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
      tupleKeys.map((key) => ({ key, demande: baseRowsByKey.get(key)?.vracDemande ?? 0 })),
      familyVracPool
    );
    const cartonByTuple = cascadeFamily(
      tupleKeys.map((key) => ({ key, demande: baseRowsByKey.get(key)?.cartonDemande ?? 0 })),
      familyCartonPool
    );

    for (const key of tupleKeys) {
      const base = baseRowsByKey.get(key);
      if (!base) continue;
      baseRowsByKey.set(key, {
        ...base,
        vracFabrique: vracByTuple.get(key) ?? 0,
        cartonFabrique: cartonByTuple.get(key) ?? 0,
      });
    }
  }

  // Emballage n'entre pas dans la balance matiere (vrac vs carton) mais
  // reste necessaire pour reproduire le meme "Statut" que Rapport Ecarts
  // (une ligne dont l'emballage n'a pas suivi reste "En cours" la-bas, donc
  // ici aussi, pour ne pas raconter 2 histoires differentes sur le meme
  // code). Meme repartition par code que ecarts/page.tsx, via la fonction
  // partagee computeProduitParCode (deja exportee par suivi/data.ts).
  for (const ligne of lignesWithLot) {
    const codes = ligneOwnCodes(ligne);
    const emballageEntriesForLigne = (emballageByLigne.get(ligne.id) ?? []) as {
      code: string;
      quantite: number;
    }[];
    const emballageProduitByCode = computeProduitParCode(
      emballageEntriesForLigne,
      codes,
      (code) => baseRowsByKey.get(`${ligne.id}::${code}`)?.cartonFabrique ?? 0
    );
    for (const code of codes) {
      const key = `${ligne.id}::${code}`;
      const base = baseRowsByKey.get(key);
      if (!base) continue;
      baseRowsByKey.set(key, { ...base, cartonEmballe: emballageProduitByCode.get(code) ?? 0 });
    }
  }

  // Meme redistribution en famille pour l'emballage (etape 2, refaite ici
  // separement car elle depend du cartonFabrique deja redistribue ci-dessus).
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
    const emballageByTuple = cascadeFamily(
      tupleKeys.map((key) => ({ key, demande: baseRowsByKey.get(key)?.cartonFabrique ?? 0 })),
      familyEmballagePool
    );
    for (const key of tupleKeys) {
      const base = baseRowsByKey.get(key);
      if (!base) continue;
      baseRowsByKey.set(key, { ...base, cartonEmballe: emballageByTuple.get(key) ?? 0 });
    }
  }

  function buildBalanceRow(base: CodeRowBase) {
    const { ligne, code, vracDemande, vracFabrique, cartonDemande, cartonFabrique, cartonEmballe } = base;

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
      ligne.programme_termine ||
        ligne.emballage_termine ||
        terminatedCodes.has(`${ligne.id}::${code}::emballage`)
    );
    const emballageNaturel = cartonDemande <= 0 || (cartonFabrique > 0 && cartonEmballe >= cartonFabrique);
    const emballageOk = emballageManuel || emballageNaturel;
    const hasStarted = vracFabrique > 0 || cartonFabrique > 0 || cartonEmballe > 0;
    const allNaturel = vracNaturel && cartonNaturel && emballageNaturel;
    const statut: Statut =
      vracOk && cartonOk && emballageOk
        ? allNaturel
          ? "Termine"
          : "Termine Manuel"
        : hasStarted
          ? "En cours"
          : "Pas commence";

    // Carton fabrique (unites) -> kg : nb_carton * piece_par_carton *
    // contenance (deja en kg par unite, confirme sur des articles reels -
    // aucune autre conversion). "-" si l'article ou ses facteurs manquent,
    // plutot que d'afficher 0 (trompeur : on ne SAIT pas, on n'a pas "zero").
    // Le poids reel releve en Conditionnement pour CE code (grammes) prime
    // sur la contenance nominale de la fiche article des qu'il est
    // disponible - demande explicite de l'utilisateur.
    const factor = ligne.article_id ? articleFactors.get(ligne.article_id) : undefined;
    const pieceParCarton = factor?.pieceParCarton ?? null;
    const poidsReelGrammes = poidsReelByKey.get(`${ligne.id}::${code}`) ?? null;
    const contenance = poidsReelGrammes !== null ? poidsReelGrammes / 1000 : factor?.contenance ?? null;
    const canConvert = pieceParCarton !== null && contenance !== null && pieceParCarton > 0 && contenance > 0;
    const cartonFabriqueKg = canConvert ? cartonFabrique * (pieceParCarton as number) * (contenance as number) : null;
    // Ecart = vrac COMMANDE - carton (vrac tire), pas vrac fabrique - voir
    // aussi les KPI globaux en haut de page (meme principe).
    const ecartMatiereKg = cartonFabriqueKg !== null ? vracDemande - cartonFabriqueKg : null;
    const ecartPct =
      ecartMatiereKg !== null && vracDemande > 0 ? (ecartMatiereKg / vracDemande) * 100 : null;

    return {
      statut,
      id: ligne.id,
      key: `${ligne.id}::${code}`,
      date: ligne.date_jour,
      code,
      pd: pdLabelsForNumeroLot(code, pdLabelByCode),
      produit: ligne.produit || "-",
      vracDemande,
      vracFabrique,
      cartonFabrique,
      cartonFabriqueKg,
      ecartMatiereKg,
      ecartPct,
      // Le conditionnement de ce code est fini (naturellement ou "Fin
      // programme") - condition pour colorer l'ecart en alerte, voir
      // EcartMatiereCell.
      cartonOk,
    };
  }

  const allRows = lignesWithLot.flatMap((ligne) =>
    ligneOwnCodes(ligne).flatMap((code) => {
      const base = baseRowsByKey.get(`${ligne.id}::${code}`);
      return base ? [buildBalanceRow(base)] : [];
    })
  );

  const produitOptions = [...new Set(allRows.map((row) => row.produit).filter((p) => p && p !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const codeOptions = [...new Set(allRows.map((row) => row.code).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
    .map((label, id) => ({ id, label }));

  const rows = allRows
    .filter((row) => {
      // Uniquement le vrac+conditionnement reellement termines (naturellement
      // ou via "Fin programme") - un code "En cours"/"Pas commence" n'a pas
      // fini de consommer son vrac, donc l'ecart matiere serait trompeur.
      if (row.statut !== "Termine" && row.statut !== "Termine Manuel") return false;
      // Code sans rien a comparer (jamais rien commande ni fabrique) - passe
      // trivialement le test "0 <= 0" mais n'a rien a montrer dans le rapport.
      if (row.vracDemande <= 0 && row.vracFabrique <= 0 && row.cartonFabrique <= 0) return false;
      if (produitFilter && !row.produit.toLowerCase().includes(produitFilter)) return false;
      if (codeFilter && !row.code.toLowerCase().includes(codeFilter)) return false;
      if (dateDebutFilter && row.date < dateDebutFilter) return false;
      if (dateFinFilter && row.date > dateFinFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const pdCompare = b.pd.localeCompare(a.pd, "fr", { numeric: true });
      if (pdCompare !== 0) return pdCompare;
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.code.localeCompare(b.code, "fr", { numeric: true });
    });

  // KPI globaux sur TOUTES les lignes filtrees (rows, pas juste la page
  // affichee) - "vrac tire" = le vrac reellement consomme pour remplir les
  // cartons (carton fabrique converti en kg), donc different du vrac
  // fabrique reel (vracFabrique) : l'ecart commande/tire montre le manque
  // global entre ce qui etait prevu et ce qui a vraiment ete tire en carton.
  const totalVracCommande = rows.reduce((sum, row) => sum + row.vracDemande, 0);
  const totalVracFabrique = rows.reduce((sum, row) => sum + row.vracFabrique, 0);
  const totalCartonVracTire = rows.reduce((sum, row) => sum + (row.cartonFabriqueKg ?? 0), 0);
  const ecartCommandeTire = totalVracCommande - totalCartonVracTire;

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(from, from + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.produit) qs.set("produit", params.produit);
    if (params.code) qs.set("code", params.code);
    if (params.date_debut) qs.set("date_debut", params.date_debut);
    if (params.date_fin) qs.set("date_fin", params.date_fin);
    return `/production/rapport/balance-matiere?${qs.toString()}`;
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
                Rapport Balance Matiere
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Par code : vrac fabrique (kg) compare au carton fabrique converti en kg
                (piece par carton x contenance), et l&apos;ecart matiere entre les deux.
              </p>
              {sinceDate ? (
                <p className="mt-1 text-xs text-slate-400">
                  Affiche les 3 derniers mois par defaut - cherche un produit ou une date pour
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
              name="produit"
              defaultValue={params.produit || ""}
              options={produitOptions}
              placeholder="Produit"
            />
            <SearchableFilterInput
              name="code"
              defaultValue={params.code || ""}
              options={codeOptions}
              placeholder="Code"
            />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            {hasFilters ? (
              <Link
                href="/production/rapport/balance-matiere"
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
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.75rem] border border-black/5 bg-amber-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              Total vrac commande
            </p>
            <p className="mt-2 text-3xl font-black text-amber-900">{formatQty(totalVracCommande)} kg</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-amber-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              Total vrac fabrique
            </p>
            <p className="mt-2 text-3xl font-black text-amber-900">{formatQty(totalVracFabrique)} kg</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-sky-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
              Total carton (vrac tire)
            </p>
            <p className="mt-2 text-3xl font-black text-sky-900">{formatQty(totalCartonVracTire)} kg</p>
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Ecart commande - tire
            </p>
            <p
              className={`mt-2 text-3xl font-black ${
                ecartCommandeTire > 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {formatQty(ecartCommandeTire)} kg
            </p>
          </div>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun code programme pour le moment."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Statut</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date programme</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Programme (PD)</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Produit</th>
                    <th className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800">
                      Vrac demande (kg)
                    </th>
                    <th className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800">
                      Vrac fabrique (kg)
                    </th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                      Carton fabrique (unites)
                    </th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">
                      Carton fabrique converti (kg)
                    </th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">
                      Ecart matiere (kg)
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
                      <td className="bg-amber-50/30 px-4 py-3 text-slate-600">{formatQty(row.vracDemande)}</td>
                      <td className="bg-amber-50/30 px-4 py-3 text-slate-600">{formatQty(row.vracFabrique)}</td>
                      <td className="bg-sky-50/30 px-4 py-3 text-slate-600">{Math.round(row.cartonFabrique)}</td>
                      <td className="bg-sky-50/30 px-4 py-3 text-slate-600">
                        {row.cartonFabriqueKg === null ? "-" : formatQty(row.cartonFabriqueKg)}
                      </td>
                      <EcartMatiereCell
                        ecartKg={row.ecartMatiereKg}
                        ecartPct={row.ecartPct}
                        flagEligible={row.cartonOk}
                      />
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
