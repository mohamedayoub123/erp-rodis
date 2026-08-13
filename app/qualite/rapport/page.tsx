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
  type_fabrication: string | null;
  disposition_qualite: string | null;
  sous_derogation: boolean | null;
  utilisateur_test_labo: string | null;
  date_saisie_test_labo: string | null;
};

type LigneInfo = { produit: string | null; date_jour: string | null };

async function fetchAllTestLaboRapports(): Promise<RapportRow[]> {
  const rows: RapportRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(
        "id, programme_ligne_id, code, type_fabrication, disposition_qualite, sous_derogation, utilisateur_test_labo, date_saisie_test_labo"
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
      .select("id, produit, date_jour")
      .in("id", chunk);

    for (const row of (data as { id: number; produit: string | null; date_jour: string | null }[] | null) ?? []) {
      map.set(row.id, { produit: row.produit, date_jour: row.date_jour });
    }

    from += pageSize;
  }

  return map;
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

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-[1.5rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black tracking-tight ${className || "text-slate-900"}`}>{value}</p>
    </div>
  );
}

const PAGE_SIZE = 200;

type SearchParams = Promise<{
  code?: string;
  produit?: string;
  type?: string;
  page?: string;
  date_debut?: string;
  date_fin?: string;
}>;

export default async function QualiteRapportPage({
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
    };
  });

  const typeOptions = [...new Set(allRows.map((r) => r.type_fabrication).filter((v): v is string => !!v))]
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
      if (typeFilter && row.type_fabrication !== typeFilter) return false;
      if (dateDebutFilter && (!row.date || row.date < dateDebutFilter)) return false;
      if (dateFinFilter && (!row.date || row.date > dateFinFilter)) return false;
      return true;
    })
    .sort((a, b) => (b.date_saisie_test_labo || "").localeCompare(a.date_saisie_test_labo || ""));

  // Le resume (cartes + repartition par type) porte sur les lignes filtrees
  // (date/produit/code/type), pas sur l'ensemble - pour repondre a "combien
  // sur telle periode / tel produit" sans devoir recompter a la main.
  const total = rows.length;
  const nonConforme = rows.filter((r) => r.disposition_qualite === "a_recuperer" || r.disposition_qualite === "a_detruire").length;
  const aRecuperer = rows.filter((r) => r.disposition_qualite === "a_recuperer").length;
  const aDetruire = rows.filter((r) => r.disposition_qualite === "a_detruire").length;
  const sousDerogation = rows.filter((r) => r.sous_derogation === true).length;
  const conforme = total - nonConforme;

  const countByType = new Map<string, number>();
  for (const row of rows) {
    const key = row.type_fabrication || "Non renseigne";
    countByType.set(key, (countByType.get(key) ?? 0) + 1);
  }
  const typeBreakdown = [...countByType.entries()].sort((a, b) => b[1] - a[1]);

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
    return `/qualite/rapport?${qs.toString()}`;
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
                Rapport Test labo
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Nombre de preparations passees au Test labo, par type de fabrication et par statut
                qualite.
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
              placeholder="Type de fabrication"
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
                href="/qualite/rapport"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Effacer
              </Link>
            ) : null}
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Preparations" value={total} />
          <StatCard label="Conforme" value={conforme} className="text-emerald-700" />
          <StatCard label="Non conforme" value={nonConforme} className="text-amber-700" />
          <StatCard label="A recuperer" value={aRecuperer} className="text-amber-700" />
          <StatCard label="A detruire" value={aDetruire} className="text-red-700" />
          <StatCard label="Sous derogation" value={sousDerogation} className="text-violet-700" />
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Par type de fabrication</h2>
          {typeBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune preparation pour ce filtre.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {typeBreakdown.map(([type, count]) => (
                <span
                  key={type}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800"
                >
                  {type} : {count}
                </span>
              ))}
            </div>
          )}
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
                    <th className="px-4 py-3 font-semibold">Sous derogation</th>
                    <th className="px-4 py-3 font-semibold">Saisi par</th>
                    <th className="px-4 py-3 font-semibold">Date saisie</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-600">{row.date ? formatDate(row.date) : "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.produit}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.code || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.type_fabrication || "-"}</td>
                      <td className="px-4 py-3">
                        <DispositionBadge value={row.disposition_qualite} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.sous_derogation ? "Oui" : "Non"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.utilisateur_test_labo || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(row.date_saisie_test_labo)}
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
