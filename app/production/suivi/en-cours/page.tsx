import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { supabaseServer } from "@/lib/supabase-server";
import { formatDateTime } from "@/lib/format-date";
import {
  buildPdLabelByCode,
  computeProduitParCode,
  fetchAllCartonEntries,
  fetchAllCodeTermineRows,
  fetchAllEmballageEntries,
  fetchAllProgrammeLignes,
  fetchAllVracEntries,
  groupCartonEntriesByLigne,
  pdLabelsForNumeroLot,
  splitLigneIntoDisplayRows,
  type ProgrammeLigneRow,
} from "../data";

type RapportDateRow = {
  programme_ligne_id: number;
  code: string;
  date_saisie_fabrication: string | null;
  date_saisie_conditionnement: string | null;
  date_saisie_emballage: string | null;
};

// Date de saisie (quand la fiche a ete enregistree, pas la date de
// production choisie dans le formulaire) - une par etape puisque
// Fabrication/Conditionnement/Emballage peuvent etre saisis a des moments
// differents pour le meme code. byCode = rapport scope a un code precis ;
// legacyByLigne = repli "code vide" pour une ligne a un seul lot jamais
// reouverte depuis le decoupage par code (meme repli que Suivi Production -
// applique par l'appelant, pas ici, pour ne jamais l'utiliser sur une ligne
// a plusieurs codes ou ce serait ambigu).
async function fetchDateSaisieMaps(
  ligneIds: number[],
  stage: "vrac" | "carton" | "emballage"
): Promise<{ byCode: Map<string, string | null>; legacyByLigne: Map<number, string | null> }> {
  const byCode = new Map<string, string | null>();
  const legacyByLigne = new Map<number, string | null>();
  if (ligneIds.length === 0) return { byCode, legacyByLigne };

  const column =
    stage === "vrac"
      ? "date_saisie_fabrication"
      : stage === "carton"
        ? "date_saisie_conditionnement"
        : "date_saisie_emballage";

  const rows: RapportDateRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(`programme_ligne_id, code, ${column}`)
      .in("programme_ligne_id", ligneIds)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as unknown as RapportDateRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  for (const row of rows) {
    if (row.code) byCode.set(`${row.programme_ligne_id}::${row.code}`, row[column]);
    else legacyByLigne.set(row.programme_ligne_id, row[column]);
  }

  return { byCode, legacyByLigne };
}

// Suivi par Etape : contrairement au Dashboard (les 3 etapes cote a cote
// sur une seule vue) ou a Rapport Ecarts (toutes les lignes, terminees
// incluses), cette page montre UNE SEULE etape a la fois (bouton
// Fabrication/Conditionnement/Emballage) - demande explicite de ne jamais
// melanger les 3 - et se limite aux PROGRAMMES encore actifs
// (programme_termine=false, meme filtre que le Dashboard). Un code peut
// etre "Termine Manuel" pour CETTE etape precise (bouton "Fin programme"
// sur le Dashboard) sans que le programme entier le soit (les autres
// etapes de la meme ligne continuent) - dans ce cas le Reste affiche 0
// pour cette etape, meme si la quantite theorique n'est pas atteinte.
type Statut = "Termine" | "Termine Manuel" | "En cours" | "Pas commence";

type Etape = "fabrication" | "conditionnement" | "emballage";

const ETAPES: { key: Etape; label: string; stage: "vrac" | "carton" | "emballage" }[] = [
  { key: "fabrication", label: "Fabrication", stage: "vrac" },
  { key: "conditionnement", label: "Conditionnement", stage: "carton" },
  { key: "emballage", label: "Emballage", stage: "emballage" },
];

function StatutBadge({ statut }: { statut: Statut }) {
  const className =
    statut === "Termine"
      ? "bg-emerald-100 text-emerald-800"
      : statut === "Termine Manuel"
        ? "bg-violet-100 text-violet-800"
        : statut === "En cours"
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{statut}</span>;
}

const PAGE_SIZE = 200;

type SearchParams = Promise<{
  etape?: string;
  produit?: string;
  code?: string;
  jour?: string;
  page?: string;
}>;

export default async function SuiviParEtapePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const etapeKey: Etape = ETAPES.some((e) => e.key === params.etape) ? (params.etape as Etape) : "fabrication";
  const etape = ETAPES.find((e) => e.key === etapeKey)!;

  const produitFilter = (params.produit || "").trim().toLowerCase();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const jourFilter = (params.jour || "").trim();
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  // Programmes encore actifs uniquement (meme filtre que le Dashboard) -
  // "en cours" veut dire le PROGRAMME n'est pas ferme, pas que cette etape
  // precise ne l'est pas (voir le repli Reste=0 plus bas).
  const [{ rows: lignes }, vracEntries, cartonEntries, emballageEntries, pdLabelByCode] = await Promise.all([
    fetchAllProgrammeLignes({ activeOnly: true }),
    etape.stage === "vrac" ? fetchAllVracEntries() : Promise.resolve([]),
    etape.stage === "carton" || etape.stage === "emballage" ? fetchAllCartonEntries() : Promise.resolve([]),
    etape.stage === "emballage" ? fetchAllEmballageEntries() : Promise.resolve([]),
    buildPdLabelByCode(),
  ]);

  const ligneIds = lignes.map((ligne) => ligne.id);
  const [codeTermineRows, { byCode: dateSaisieByCode, legacyByLigne: dateSaisieLegacyByLigne }] = await Promise.all([
    fetchAllCodeTermineRows(ligneIds),
    fetchDateSaisieMaps(ligneIds, etape.stage),
  ]);
  const terminatedCodes = new Set(
    codeTermineRows.map((row) => `${row.programme_ligne_id}::${row.code}::${row.stage}`)
  );

  const entriesByLigne = groupCartonEntriesByLigne(
    etape.stage === "vrac" ? vracEntries : etape.stage === "carton" ? cartonEntries : emballageEntries
  );

  function ligneOwnCodes(ligne: ProgrammeLigneRow): string[] {
    return splitLigneIntoDisplayRows(ligne, "qt_vrac", 0).map((split) => split.displayCode);
  }

  const lignesWithLot = lignes.filter((ligne) => ligne.numero_lot);

  const allRows = lignesWithLot.flatMap((ligne) => {
    const codes = ligneOwnCodes(ligne);
    const entriesForLigne = (entriesByLigne.get(ligne.id) ?? []) as { code: string; quantite: number; date_jour: string }[];

    // La demande de reference : vrac pour Fabrication, carton pour
    // Conditionnement ET Emballage (Emballage emballe ce qui a ete
    // conditionne, meme base que Rapport Ecarts).
    const demandeSplits = splitLigneIntoDisplayRows(ligne, etape.stage === "vrac" ? "qt_vrac" : "qt_carton", 0);
    const demandeByCode = new Map(
      demandeSplits.map((split) => [
        split.displayCode,
        split.displayQuantite ?? (etape.stage === "vrac" ? ligne.vrac_a_fabriquer : ligne.qt_carton) ?? 0,
      ])
    );

    const fabriqueByCode = computeProduitParCode(entriesForLigne, codes, (code) => demandeByCode.get(code) ?? 0);

    // Date de SAISIE du rapport (quand la fiche a ete enregistree, pas la
    // date de production choisie dans le formulaire) - demande explicite,
    // sert aussi au tri "le plus recent en premier". Repli sur le rapport
    // legacy "code vide" seulement pour une ligne a un seul lot (sinon
    // ambigu entre plusieurs codes), puis sur la date programme si rien
    // n'a jamais ete saisi pour cette etape.
    const isSingleCodeLigne = codes.length <= 1;
    return codes.map((code) => {
      const demande = demandeByCode.get(code) ?? 0;
      const fabrique = fabriqueByCode.get(code) ?? 0;

      const manuel = Boolean(
        ligne.programme_termine ||
          (etape.stage === "vrac" && ligne.vrac_termine) ||
          (etape.stage === "carton" && ligne.carton_termine) ||
          (etape.stage === "emballage" && ligne.emballage_termine) ||
          terminatedCodes.has(`${ligne.id}::${code}::${etape.stage}`)
      );
      const naturel = demande <= 0 || fabrique >= demande;
      const hasStarted = fabrique > 0;
      const statut: Statut = manuel || naturel ? (naturel ? "Termine" : "Termine Manuel") : hasStarted ? "En cours" : "Pas commence";

      // Termine (naturel ou manuel) => Reste affiche 0, meme si la
      // quantite theorique n'est pas atteinte (demande explicite).
      const reste = statut === "Termine" || statut === "Termine Manuel" ? 0 : Math.max(0, demande - fabrique);

      const dateSaisie =
        dateSaisieByCode.get(`${ligne.id}::${code}`) ??
        (isSingleCodeLigne ? dateSaisieLegacyByLigne.get(ligne.id) : undefined) ??
        null;

      return {
        key: `${ligne.id}::${code}`,
        date: dateSaisie ?? ligne.date_jour,
        code,
        pdLabel: pdLabelsForNumeroLot(code, pdLabelByCode),
        produit: ligne.produit || "-",
        statut,
        demande,
        fabrique,
        reste,
      };
    });
  });

  const produitOptions = [...new Set(allRows.map((row) => row.produit).filter((p) => p && p !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const codeOptions = [...new Set(allRows.map((row) => row.code).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
    .map((label, id) => ({ id, label }));

  const rows = allRows
    .filter((row) => {
      // "Pas commence" (rien fabrique du tout pour ce code sur cette
      // etape) exclu d'office - demande explicite de ne montrer que ce
      // qui a deja demarre.
      if (row.statut === "Pas commence") return false;
      if (produitFilter && !row.produit.toLowerCase().includes(produitFilter)) return false;
      if (codeFilter && !row.code.toLowerCase().includes(codeFilter)) return false;
      if (jourFilter && row.date.slice(0, 10) !== jourFilter) return false;
      return true;
    })
    // Le plus recent en premier (demande explicite) - depart entre 2 lignes
    // de meme date par le code pour un ordre stable.
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.code.localeCompare(b.code, "fr", { numeric: true });
    });

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(from, from + PAGE_SIZE);

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const merged = { etape: params.etape || etapeKey, produit: params.produit, code: params.code, jour: params.jour, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) qs.set(key, value);
    }
    return `/production/suivi/en-cours?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Suivi par Etape</h1>
              <p className="mt-2 text-sm text-slate-600">
                Programmes encore actifs : commande, fabrique et reste par code, une seule etape a la fois.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi" label="Retour planning" />
              <RefreshButton />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {ETAPES.map((e) => (
              <Link
                key={e.key}
                href={buildHref({ etape: e.key, page: undefined })}
                className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
                  e.key === etapeKey ? "bg-slate-950 text-white" : "border border-slate-200 text-slate-700 hover:border-slate-400"
                }`}
              >
                {e.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
            <input type="hidden" name="etape" value={etapeKey} />
            <SearchableFilterInput name="produit" defaultValue={params.produit || ""} options={produitOptions} placeholder="Article" />
            <SearchableFilterInput name="code" defaultValue={params.code || ""} options={codeOptions} placeholder="Code" />
            <input
              type="date"
              name="jour"
              defaultValue={params.jour || ""}
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none"
            />
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
              Filtrer
            </button>
            {produitFilter || codeFilter || jourFilter ? (
              <Link
                href={buildHref({ produit: undefined, code: undefined, jour: undefined, page: undefined })}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Rien en cours pour {etape.label.toLowerCase()} avec ce filtre.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Statut</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">PD</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-amber-50 px-4 py-3 font-semibold text-amber-800">Qt commandee</th>
                    <th className="sticky top-0 z-10 bg-sky-50 px-4 py-3 font-semibold text-sky-800">Qt fabriquee</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Reste a fabriquer</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <StatutBadge statut={row.statut} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(row.date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.code}</td>
                      <td className="px-4 py-3 text-slate-700">{row.pdLabel}</td>
                      <td className="px-4 py-3 text-slate-600">{row.produit}</td>
                      <td className="bg-amber-50/30 px-4 py-3 text-slate-600">{Math.round(row.demande)}</td>
                      <td className="bg-sky-50/30 px-4 py-3 text-slate-600">{Math.round(row.fabrique)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{Math.round(row.reste)}</td>
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
                href={buildHref({ page: String(Math.max(1, currentPage - 1)) })}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage === 1 ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-slate-950 text-white"
                }`}
              >
                Precedent
              </Link>
              <Link
                href={buildHref({ page: String(Math.min(totalPages, currentPage + 1)) })}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage >= totalPages ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-slate-950 text-white"
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
