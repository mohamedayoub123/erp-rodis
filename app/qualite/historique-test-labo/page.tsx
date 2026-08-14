import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { formatDate } from "../../production/suivi/data";
import { formatDateTime } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";

type RapportRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  ph: number | null;
  densite: number | null;
  viscosite: number | null;
  degre_alcool: number | null;
  stabilite: string | null;
  couleur: string | null;
  odeur: string | null;
  texture: string | null;
  taux_humidite: number | null;
  pression_atmospherique: number | null;
  temperature_test: number | null;
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
};

type LigneInfo = { produit: string | null; date_jour: string | null; plateforme: string | null };

async function fetchAllTestLaboRapports(): Promise<RapportRow[]> {
  const rows: RapportRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(
        "id, programme_ligne_id, code, ph, densite, viscosite, degre_alcool, stabilite, couleur, odeur, texture, taux_humidite, pression_atmospherique, temperature_test, remarque, disposition_qualite, sous_derogation, motif_derogation, date_prise_echantillon, heure_prise_echantillon, heure_debut_analyse, heure_fin_analyse, nom_labo, utilisateur_test_labo, date_saisie_test_labo"
      )
      .not("utilisateur_test_labo", "is", null)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as RapportRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchLignesInfo(ligneIds: number[]): Promise<Map<number, LigneInfo>> {
  const map = new Map<number, LigneInfo>();
  if (ligneIds.length === 0) return map;

  let from = 0;
  const pageSize = 1000;
  const uniqueIds = [...new Set(ligneIds)];

  while (from < uniqueIds.length) {
    const chunk = uniqueIds.slice(from, from + pageSize);
    const { data } = await supabaseServer
      .from("programme_lignes")
      .select("id, produit, date_jour, plateforme")
      .in("id", chunk);

    for (const row of (data as
      | { id: number; produit: string | null; date_jour: string | null; plateforme: string | null }[]
      | null) ?? []) {
      map.set(row.id, { produit: row.produit, date_jour: row.date_jour, plateforme: row.plateforme });
    }

    from += pageSize;
  }

  return map;
}

// Meme convention que Rapport Test labo : "type" = Plateforme du Programme
// par ligne (M/A), pas type_fabrication (pas rempli de facon fiable).
function plateformeLabel(value: string | null | undefined) {
  if (value === "A") return "Auto";
  if (value === "M") return "Manuel";
  return "-";
}

function dispositionQualiteLabel(value: string | null | undefined) {
  if (value === "a_recuperer") return "A recuperer";
  if (value === "a_detruire") return "A detruire";
  return "Conforme";
}

function DispositionBadge({ value }: { value: string | null | undefined }) {
  const className =
    value === "a_detruire"
      ? "bg-red-100 text-red-800"
      : value === "a_recuperer"
        ? "bg-amber-100 text-amber-800"
        : "bg-emerald-100 text-emerald-800";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {dispositionQualiteLabel(value)}
    </span>
  );
}

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{formatValue(value)}</p>
    </div>
  );
}

const PAGE_SIZE = 100;

type SearchParams = Promise<{
  code?: string;
  produit?: string;
  type?: string;
  page?: string;
  date_debut?: string;
  date_fin?: string;
}>;

export default async function QualiteHistoriqueTestLaboPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const params = await searchParams;
  const codeFilter = (params.code || "").trim().toLowerCase();
  const produitFilter = (params.produit || "").trim().toLowerCase();
  const typeFilter = (params.type || "").trim();
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const hasFilters = Boolean(codeFilter || produitFilter || typeFilter || dateDebutFilter || dateFinFilter);
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  const allRapports = await fetchAllTestLaboRapports();
  const lignesInfo = await fetchLignesInfo(allRapports.map((r) => r.programme_ligne_id));

  const allRows = allRapports.map((r) => {
    const ligne = lignesInfo.get(r.programme_ligne_id);
    return {
      ...r,
      produit: ligne?.produit || "-",
      date: ligne?.date_jour || (r.date_saisie_test_labo ? r.date_saisie_test_labo.slice(0, 10) : ""),
      typeLabel: plateformeLabel(ligne?.plateforme),
    };
  });

  const typeOptions = [...new Set(allRows.map((r) => r.typeLabel).filter((v) => v !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const codeOptions = [...new Set(allRows.map((r) => r.code).filter((v): v is string => !!v))]
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
    .map((label, id) => ({ id, label }));
  const produitOptions = [...new Set(allRows.map((r) => r.produit).filter((p) => p && p !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));

  const rows = allRows
    .filter((row) => {
      if (codeFilter && !row.code.toLowerCase().includes(codeFilter)) return false;
      if (produitFilter && !matchesArticleSearch(row.produit, produitFilter)) return false;
      if (typeFilter && row.typeLabel !== typeFilter) return false;
      if (dateDebutFilter && (!row.date || row.date < dateDebutFilter)) return false;
      if (dateFinFilter && (!row.date || row.date > dateFinFilter)) return false;
      return true;
    })
    .sort((a, b) => (b.date_saisie_test_labo || "").localeCompare(a.date_saisie_test_labo || ""));

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(from, from + PAGE_SIZE);

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (params.code) qs.set("code", params.code);
    if (params.produit) qs.set("produit", params.produit);
    if (params.type) qs.set("type", params.type);
    if (params.date_debut) qs.set("date_debut", params.date_debut);
    if (params.date_fin) qs.set("date_fin", params.date_fin);
    return `/qualite/historique-test-labo?${qs.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Historique Test labo
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Chaque Test labo enregistre, avec toutes les valeurs mesurees (clique "Details" sur une
                ligne).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite" label="Retour qualite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto]">
            <SearchableFilterInput
              name="code"
              placeholder="Code"
              defaultValue={params.code || ""}
              options={codeOptions}
            />
            <SearchableFilterInput
              name="produit"
              placeholder="Produit"
              defaultValue={params.produit || ""}
              options={produitOptions}
            />
            <SearchableFilterInput
              name="type"
              placeholder="Auto / Manuel"
              defaultValue={params.type || ""}
              options={typeOptions}
            />
            <input
              type="date"
              name="date_debut"
              defaultValue={params.date_debut || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <input
              type="date"
              name="date_fin"
              defaultValue={params.date_fin || ""}
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
                href="/qualite/historique-test-labo"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun Test labo enregistre pour le moment."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Produit</th>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Statut qualite</th>
                    <th className="px-4 py-3 font-semibold">Saisi par</th>
                    <th className="px-4 py-3 font-semibold">Date saisie</th>
                    <th className="px-4 py-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 text-slate-600">{row.date ? formatDate(row.date) : "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.produit}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.code || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.typeLabel}</td>
                      <td className="px-4 py-3">
                        <DispositionBadge value={row.disposition_qualite} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.utilisateur_test_labo || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(row.date_saisie_test_labo)}
                      </td>
                      <td className="px-4 py-3">
                        <details className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <summary className="cursor-pointer text-xs font-semibold text-violet-700">
                            Voir
                          </summary>
                          <div className="mt-3 grid w-72 gap-3 sm:grid-cols-2">
                            <DetailField label="pH" value={row.ph} />
                            <DetailField label="Densite" value={row.densite} />
                            <DetailField label="Viscosite" value={row.viscosite} />
                            <DetailField label="Degre alcool" value={row.degre_alcool} />
                            <DetailField label="Stabilite" value={row.stabilite} />
                            <DetailField label="Couleur" value={row.couleur} />
                            <DetailField label="Odeur" value={row.odeur} />
                            <DetailField label="Texture" value={row.texture} />
                            <DetailField label="Taux humidite" value={row.taux_humidite} />
                            <DetailField label="Pression atmospherique" value={row.pression_atmospherique} />
                            <DetailField label="Temperature test" value={row.temperature_test} />
                            <DetailField label="Nom labo" value={row.nom_labo} />
                            <DetailField
                              label="Date prise echantillon"
                              value={row.date_prise_echantillon ? formatDate(row.date_prise_echantillon) : null}
                            />
                            <DetailField label="Heure prise echantillon" value={row.heure_prise_echantillon} />
                            <DetailField label="Heure debut analyse" value={row.heure_debut_analyse} />
                            <DetailField label="Heure fin analyse" value={row.heure_fin_analyse} />
                            <div className="sm:col-span-2">
                              <DetailField
                                label="Sous derogation"
                                value={row.sous_derogation ? "Oui" : "Non"}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <DetailField label="Motif derogation" value={row.motif_derogation} />
                            </div>
                            <div className="sm:col-span-2">
                              <DetailField label="Remarque" value={row.remarque} />
                            </div>
                          </div>
                        </details>
                      </td>
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
              Lignes {from + 1} a {Math.min(from + PAGE_SIZE, totalRows)} sur {totalRows}
            </p>
            <div className="flex gap-3">
              <Link
                href={buildPageHref(Math.max(1, currentPage - 1))}
                className={`rounded-full px-4 py-2 font-semibold ${
                  currentPage === 1 ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-slate-950 text-white"
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
