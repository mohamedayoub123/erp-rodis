import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { formatDate } from "../../production/suivi/data";
import { formatDateTime } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";
import { TestLaboPieChart } from "./test-labo-pie-chart";
import { TestLaboLineChart } from "./test-labo-line-chart";

type RapportRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  disposition_qualite: string | null;
  sous_derogation: boolean | null;
  utilisateur_test_labo: string | null;
  date_saisie_test_labo: string | null;
};

type LigneInfo = {
  produit: string | null;
  date_jour: string | null;
  plateforme: string | null;
  article_id: number | null;
};

async function fetchAllTestLaboRapports(): Promise<RapportRow[]> {
  const rows: RapportRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_rapports")
      .select(
        "id, programme_ligne_id, code, disposition_qualite, sous_derogation, utilisateur_test_labo, date_saisie_test_labo"
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
      .select("id, produit, date_jour, plateforme, article_id")
      .in("id", chunk);

    for (const row of (data as
      | { id: number; produit: string | null; date_jour: string | null; plateforme: string | null; article_id: number | null }[]
      | null) ?? []) {
      map.set(row.id, {
        produit: row.produit,
        date_jour: row.date_jour,
        plateforme: row.plateforme,
        article_id: row.article_id,
      });
    }

    from += pageSize;
  }

  return map;
}

type ArticleInfo = { type_article: string | null; gamme: string | null };

async function fetchArticleInfos(articleIds: number[]): Promise<Map<number, ArticleInfo>> {
  const map = new Map<number, ArticleInfo>();
  if (articleIds.length === 0) return map;

  let from = 0;
  const pageSize = 1000;
  const uniqueIds = [...new Set(articleIds)];

  while (from < uniqueIds.length) {
    const chunk = uniqueIds.slice(from, from + pageSize);
    const { data } = await supabaseServer.from("articles").select("id, type_article, gamme").in("id", chunk);

    for (const row of (data as { id: number; type_article: string | null; gamme: string | null }[] | null) ?? []) {
      map.set(row.id, { type_article: row.type_article, gamme: row.gamme });
    }

    from += pageSize;
  }

  return map;
}

// "clarifiant" -> "Clarifiant" - meme normalisation que Ravitailleur par
// genre (articles.type_article est saisi a la main, casse pas toujours
// coherente).
function capitalize(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "-";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

// "Type" de preparation = Plateforme saisie sur Programme par ligne
// (colonne M/A) - le champ type_fabrication de la fiche Fabrication n'est
// pas rempli de facon fiable, contrairement a la Plateforme.
function plateformeLabel(value: string | null | undefined) {
  if (value === "A") return "Auto";
  if (value === "M") return "Manuel";
  return "-";
}

function dispositionQualiteLabel(value: string | null | undefined) {
  if (value === "a_recuperer") return "A recuperer";
  if (value === "a_detruire") return "A detruire";
  if (value === "non_conforme") return "Non conforme";
  return "Conforme";
}

function DispositionBadge({ value }: { value: string | null | undefined }) {
  const className =
    value === "a_detruire" || value === "non_conforme"
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

// Quand une preparation est non conforme, elle n'a que 2 issues possibles :
// detruite, ou gardee sous derogation (ce qui couvre aussi "A recuperer" -
// meme principe que "sous derogation", garder le lot malgre le hors spec).
// "A detruire" est prioritaire : un lot ne peut pas etre a la fois detruit
// et garde sous derogation.
function decisionLabel(row: { disposition_qualite: string | null; sous_derogation: boolean | null }) {
  if (row.disposition_qualite === "a_detruire") return "A detruire";
  if (row.disposition_qualite === "a_recuperer" || row.sous_derogation) return "Sous derogation";
  // "Non conforme" auto (parametre hors spec) sans A recuperer/A detruire
  // choisi ensuite - decision encore en attente.
  if (row.disposition_qualite === "non_conforme") return "A decider";
  return "-";
}

function DecisionBadge({ row }: { row: { disposition_qualite: string | null; sous_derogation: boolean | null } }) {
  const label = decisionLabel(row);
  const className =
    label === "A detruire"
      ? "bg-red-100 text-red-800"
      : label === "Sous derogation"
        ? "bg-fuchsia-100 text-fuchsia-800"
        : label === "A decider"
          ? "bg-orange-100 text-orange-800"
          : "bg-slate-100 text-slate-500";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
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

const MOIS_NOMS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

// "2026-08" -> "Aout 2026" - cle triable telle quelle (ordre chronologique).
function moisLabel(moisKey: string) {
  const [year, month] = moisKey.split("-");
  const index = Number(month) - 1;
  return `${MOIS_NOMS[index] ?? month} ${year}`;
}

type SearchParams = Promise<{
  code?: string;
  produit?: string;
  type?: string;
  type_article?: string;
  gamme?: string;
  page?: string;
  date_debut?: string;
  date_fin?: string;
  mois?: string;
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
  const typeArticleFilter = (params.type_article || "").trim();
  const gammeFilter = (params.gamme || "").trim();
  const dateDebutFilter = (params.date_debut || "").trim();
  const dateFinFilter = (params.date_fin || "").trim();
  const moisFilter = (params.mois || "").trim();
  const hasFilters = Boolean(
    codeFilter ||
      produitFilter ||
      typeFilter ||
      typeArticleFilter ||
      gammeFilter ||
      dateDebutFilter ||
      dateFinFilter ||
      moisFilter
  );
  const currentPage = Math.max(1, Number(params.page || "1") || 1);

  const allRapports = await fetchAllTestLaboRapports();
  const lignesInfo = await fetchLignesInfo(allRapports.map((r) => r.programme_ligne_id));
  const articleInfos = await fetchArticleInfos(
    [...lignesInfo.values()].map((l) => l.article_id).filter((id): id is number => id !== null)
  );

  const allRows = allRapports.map((r) => {
    const ligne = lignesInfo.get(r.programme_ligne_id);
    const article = ligne?.article_id ? articleInfos.get(ligne.article_id) : undefined;
    return {
      ...r,
      produit: ligne?.produit || "-",
      date: ligne?.date_jour || (r.date_saisie_test_labo ? r.date_saisie_test_labo.slice(0, 10) : ""),
      typeLabel: plateformeLabel(ligne?.plateforme),
      typeArticleLabel: capitalize(article?.type_article),
      gammeLabel: article?.gamme?.trim() || "-",
    };
  });

  const typeOptions = [...new Set(allRows.map((r) => r.typeLabel).filter((v) => v !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const typeArticleOptions = [...new Set(allRows.map((r) => r.typeArticleLabel).filter((v) => v !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const gammeOptions = [...new Set(allRows.map((r) => r.gammeLabel).filter((v) => v !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const codeOptions = [...new Set(allRows.map((r) => r.code).filter((v): v is string => !!v))]
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }))
    .map((label, id) => ({ id, label }));
  const produitOptions = [...new Set(allRows.map((r) => r.produit).filter((p) => p && p !== "-"))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((label, id) => ({ id, label }));
  const moisOptions = [...new Set(allRows.map((r) => r.date.slice(0, 7)).filter((m) => m.length === 7))]
    .sort((a, b) => b.localeCompare(a))
    .map((key, id) => ({ id, label: moisLabel(key), value: key }));

  const rows = allRows
    .filter((row) => {
      if (codeFilter && !row.code.toLowerCase().includes(codeFilter)) return false;
      if (produitFilter && !matchesArticleSearch(row.produit, produitFilter)) return false;
      if (typeFilter && row.typeLabel !== typeFilter) return false;
      if (typeArticleFilter && row.typeArticleLabel !== typeArticleFilter) return false;
      if (gammeFilter && row.gammeLabel !== gammeFilter) return false;
      if (dateDebutFilter && (!row.date || row.date < dateDebutFilter)) return false;
      if (dateFinFilter && (!row.date || row.date > dateFinFilter)) return false;
      if (moisFilter && row.date.slice(0, 7) !== moisFilter) return false;
      return true;
    })
    .sort((a, b) => (b.date_saisie_test_labo || "").localeCompare(a.date_saisie_test_labo || ""));

  // Le resume (cartes + repartition par type) porte sur les lignes filtrees
  // (date/produit/code/type), pas sur l'ensemble - pour repondre a "combien
  // sur telle periode / tel produit" sans devoir recompter a la main.
  // Non conforme = tout ce qui a une decision (A detruire, Sous derogation,
  // ou A decider) - "sous derogation" veut dire que le lot etait hors spec,
  // donc non conforme, meme si le statut qualite est reste "Conforme".
  const total = rows.length;
  const decisions = rows.map((r) => decisionLabel(r));
  const aDetruire = decisions.filter((d) => d === "A detruire").length;
  const sousDerogation = decisions.filter((d) => d === "Sous derogation").length;
  const aDecider = decisions.filter((d) => d === "A decider").length;
  const nonConforme = aDetruire + sousDerogation + aDecider;
  const conforme = total - nonConforme;

  const countByType = new Map<string, number>();
  for (const row of rows) {
    countByType.set(row.typeLabel, (countByType.get(row.typeLabel) ?? 0) + 1);
  }
  const typeBreakdown = [...countByType.entries()].sort((a, b) => b[1] - a[1]);

  // Evolution par mois (graphique multi-courbes) - meme filtre que le reste
  // de la page, triee chronologiquement (le plus ancien a gauche). 5
  // series : total, sous derogation, a detruire (statut qualite) + auto,
  // manuel (plateforme) - toutes en "nombre de preparations", meme axe.
  const monthKeysSet = new Set<string>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (key.length === 7) monthKeysSet.add(key);
  }
  const monthKeys = [...monthKeysSet].sort((a, b) => a.localeCompare(b));

  const totalByMonth = new Map<string, number>();
  const sousDerogationByMonth = new Map<string, number>();
  const aDetruireByMonth = new Map<string, number>();
  const autoByMonth = new Map<string, number>();
  const manuelByMonth = new Map<string, number>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (key.length !== 7) continue;
    totalByMonth.set(key, (totalByMonth.get(key) ?? 0) + 1);
    const decision = decisionLabel(row);
    if (decision === "Sous derogation") sousDerogationByMonth.set(key, (sousDerogationByMonth.get(key) ?? 0) + 1);
    if (decision === "A detruire") aDetruireByMonth.set(key, (aDetruireByMonth.get(key) ?? 0) + 1);
    if (row.typeLabel === "Auto") autoByMonth.set(key, (autoByMonth.get(key) ?? 0) + 1);
    if (row.typeLabel === "Manuel") manuelByMonth.set(key, (manuelByMonth.get(key) ?? 0) + 1);
  }

  const monthLabels = monthKeys.map((key) => moisLabel(key));
  const lineChartSeries = [
    {
      key: "total",
      label: "Preparations faites",
      color: "#0d9488",
      values: monthKeys.map((key) => totalByMonth.get(key) ?? 0),
    },
    {
      key: "sous_derogation",
      label: "Sous derogation",
      color: "#c026d3",
      values: monthKeys.map((key) => sousDerogationByMonth.get(key) ?? 0),
    },
    {
      key: "a_detruire",
      label: "A detruire",
      color: "#dc2626",
      values: monthKeys.map((key) => aDetruireByMonth.get(key) ?? 0),
    },
    {
      key: "auto",
      label: "Auto",
      color: "#0284c7",
      values: monthKeys.map((key) => autoByMonth.get(key) ?? 0),
    },
    {
      key: "manuel",
      label: "Manuel",
      color: "#ca8a04",
      values: monthKeys.map((key) => manuelByMonth.get(key) ?? 0),
    },
  ];

  // % sous derogation et % non conforme detruit par mois (sur le total de
  // preparations de ce mois) - memes couleurs que les series equivalentes
  // du graphe en nombre, pour que la couleur reste attachee a la meme
  // categorie d'un graphe a l'autre.
  const pctChartSeries = [
    {
      key: "pct_sous_derogation",
      label: "% Sous derogation",
      color: "#c026d3",
      values: monthKeys.map((key) => {
        const total = totalByMonth.get(key) ?? 0;
        return total > 0 ? Math.round(((sousDerogationByMonth.get(key) ?? 0) / total) * 1000) / 10 : 0;
      }),
    },
    {
      key: "pct_a_detruire",
      label: "% Non conforme detruit",
      color: "#dc2626",
      values: monthKeys.map((key) => {
        const total = totalByMonth.get(key) ?? 0;
        return total > 0 ? Math.round(((aDetruireByMonth.get(key) ?? 0) / total) * 1000) / 10 : 0;
      }),
    },
  ];

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
    if (params.type_article) qs.set("type_article", params.type_article);
    if (params.gamme) qs.set("gamme", params.gamme);
    if (params.date_debut) qs.set("date_debut", params.date_debut);
    if (params.date_fin) qs.set("date_fin", params.date_fin);
    if (params.mois) qs.set("mois", params.mois);
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
                Nombre de preparations passees au Test labo, par plateforme (Auto/Manuel) et par
                statut qualite.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/qualite" label="Retour qualite" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto_auto]">
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
            <SearchableFilterInput
              name="type_article"
              placeholder="Type (clarifiant, hydratant...)"
              defaultValue={params.type_article || ""}
              options={typeArticleOptions}
            />
            <SearchableFilterInput
              name="gamme"
              placeholder="Gamme"
              defaultValue={params.gamme || ""}
              options={gammeOptions}
            />
            <select
              name="mois"
              defaultValue={params.mois || ""}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            >
              <option value="">Tous les mois</option>
              {moisOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
          <StatCard label="A decider" value={aDecider} className="text-orange-700" />
          <StatCard label="A detruire" value={aDetruire} className="text-red-700" />
          <StatCard label="Sous derogation" value={sousDerogation} className="text-violet-700" />
        </section>

        {/* 2 graphiques cote a cote, chacun en grand - prennent presque toute
            la largeur de la page (grid pleine largeur, 1 colonne sur petit
            ecran, 2 sur large). */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <TestLaboPieChart
              conforme={conforme}
              aDetruire={aDetruire}
              sousDerogation={sousDerogation}
              aDecider={aDecider}
            />
          </div>
          <div className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <TestLaboLineChart months={monthLabels} series={lineChartSeries} />
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <TestLaboLineChart
            months={monthLabels}
            series={pctChartSeries}
            title="% sous derogation / % non conforme detruit par mois"
            unit="%"
          />
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Par plateforme (Auto / Manuel)</h2>
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
                    <th className="px-4 py-3 font-semibold">Decision</th>
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
                      <td className="px-4 py-3 text-slate-600">{row.typeLabel}</td>
                      <td className="px-4 py-3">
                        <DispositionBadge value={row.disposition_qualite} />
                      </td>
                      <td className="px-4 py-3">
                        <DecisionBadge row={row} />
                      </td>
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
