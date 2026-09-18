import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { matchesArticleSearch } from "@/lib/article-search";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";

type LotRow = {
  article_id: number | null;
  numero_lot: string | null;
  date_fabrication: string | null;
  qte_entree: number;
  qte_sortie: number;
  articles: { nom_article: string } | { nom_article: string }[] | null;
};

type CodeRow = {
  key: string;
  article: string;
  code: string;
  quantite: number;
  dateFabrication: string | null;
  pdLabel: string;
  dateDispatch: string | null;
  programme: string;
};

type PdInfo = { pdLabel: string; date: string };
type DispatcherHistoryRow = { groupe_id: number | null; code: string | null; created_at: string };

// "Programme" (colonne du meme nom sur Programme par ligne) - champ libre
// tape a la main sur une ligne (programme_lignes.programe), independant du
// code auto-genere - demande explicite : le retrouver aussi ici, associe
// au code. Un meme code peut porter plusieurs "Programme" differents s'il
// est partage entre plusieurs lignes (rare) - jamais ecrase, tous gardes.
async function fetchProgrammeByCode(): Promise<Map<string, string>> {
  type LigneProgrammeRow = { numero_lot: string | null; programe: string | null };
  const rows: LigneProgrammeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("numero_lot, programe")
      .not("programe", "is", null)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as LigneProgrammeRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const programmesByCode = new Map<string, Set<string>>();
  for (const row of rows) {
    const programme = (row.programe || "").trim();
    if (!programme) continue;
    const codes = (row.numero_lot || "").split(",").map((c) => c.trim()).filter(Boolean);
    for (const code of codes) {
      const set = programmesByCode.get(code) ?? new Set<string>();
      set.add(programme);
      programmesByCode.set(code, set);
    }
  }

  const result = new Map<string, string>();
  for (const [code, set] of programmesByCode.entries()) {
    result.set(code, [...set].join(", "));
  }
  return result;
}

// PD + date de dispatch par code (programme_dispatcher_history) - meme
// numerotation "PDn" que buildPdLabelByCode (app/production/suivi/data.ts),
// recalculee ici directement pour ne pas dupliquer un aller-retour reseau
// en plus (cette page n'a pas besoin des autres donnees Suivi Production).
// Garde la date de dispatch la plus ANCIENNE quand un meme code apparait
// plusieurs fois dans l'historique.
async function fetchPdInfoByCode(): Promise<Map<string, PdInfo>> {
  const rows: DispatcherHistoryRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_history")
      .select("groupe_id, code, created_at")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as DispatcherHistoryRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  const earliestByGroup = new Map<number, string>();
  for (const row of rows) {
    if (row.groupe_id === null) continue;
    const current = earliestByGroup.get(row.groupe_id);
    if (!current || new Date(row.created_at).getTime() < new Date(current).getTime()) {
      earliestByGroup.set(row.groupe_id, row.created_at);
    }
  }

  const orderedGroupIds = [...earliestByGroup.entries()]
    .sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime())
    .map(([groupeId]) => groupeId);

  const pdLabelByGroup = new Map<number, string>();
  orderedGroupIds.forEach((groupeId, index) => {
    pdLabelByGroup.set(groupeId, `PD${index + 1}`);
  });

  const infoByCode = new Map<string, PdInfo>();
  for (const row of rows) {
    const code = (row.code || "").trim();
    if (!code || row.groupe_id === null) continue;
    const pdLabel = pdLabelByGroup.get(row.groupe_id);
    if (!pdLabel) continue;

    const existing = infoByCode.get(code);
    if (!existing || new Date(row.created_at).getTime() < new Date(existing.date).getTime()) {
      infoByCode.set(code, { pdLabel, date: row.created_at });
    }
  }

  return infoByCode;
}

async function fetchAllLots() {
  const rows: LotRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("lots_stock")
      .select("article_id, numero_lot, date_fabrication, qte_entree, qte_sortie, articles!inner(nom_article)")
      .range(from, from + pageSize - 1);

    if (error) return { rows, error };

    const chunk = (data ?? []) as unknown as LotRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

function articleName(row: LotRow) {
  return Array.isArray(row.articles) ? row.articles[0]?.nom_article : row.articles?.nom_article;
}

type SearchParams = Promise<{ article?: string; code?: string }>;

export default async function StockParCodePfPage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const articleFilter = (params.article || "").trim();
  const codeFilter = (params.code || "").trim().toLowerCase();
  const hasFilters = Boolean(articleFilter || codeFilter);

  const [{ rows: lots, error }, pdInfoByCode, programmeByCode] = await Promise.all([
    fetchAllLots(),
    fetchPdInfoByCode(),
    fetchProgrammeByCode(),
  ]);

  // Regroupe par code (numero de lot) - la quantite est le solde
  // entree-sortie de ce lot precis, et la date de fabrication vient de la
  // ligne d'entree de ce lot (une sortie ne porte pas sa propre date de
  // fabrication).
  const groups = new Map<string, CodeRow>();
  for (const row of lots) {
    const code = (row.numero_lot || "").trim();
    if (!row.article_id || !code) continue;

    const key = `${row.article_id}::${code.toUpperCase()}`;
    let group = groups.get(key);
    if (!group) {
      const pdInfo = pdInfoByCode.get(code);
      group = {
        key,
        article: articleName(row) || "-",
        code,
        quantite: 0,
        dateFabrication: null,
        pdLabel: pdInfo?.pdLabel || "-",
        dateDispatch: pdInfo?.date || null,
        programme: programmeByCode.get(code) || "-",
      };
      groups.set(key, group);
    }

    group.quantite += Number(row.qte_entree ?? 0) - Number(row.qte_sortie ?? 0);
    if (!group.dateFabrication && Number(row.qte_entree ?? 0) > 0 && row.date_fabrication) {
      group.dateFabrication = row.date_fabrication;
    }
  }

  const articleOptions = (
    [...new Set(lots.map((row) => articleName(row)).filter(Boolean))] as string[]
  ).map((label, index) => ({ id: index, label }));

  const codeRows = [...groups.values()]
    .filter((row) => row.quantite > 0)
    .filter((row) => !articleFilter || matchesArticleSearch(row.article, articleFilter))
    .filter((row) => !codeFilter || row.code.toLowerCase().includes(codeFilter))
    .sort((a, b) => {
      const articleCompare = a.article.localeCompare(b.article, "fr", { sensitivity: "base" });
      if (articleCompare !== 0) return articleCompare;
      return (a.dateFabrication || "").localeCompare(b.dateFabrication || "");
    });

  const totalQuantite = codeRows.reduce((sum, row) => sum + row.quantite, 0);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eef5f0_0%,#f8fbf8_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-black/5 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              ERP Rodis
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Stock par Code</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Ecris un article : tous ses codes (lots) avec un stock superieur a 0, la quantite et la
              date de fabrication.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackButton href="/stock/rapport" label="Retour rapport" />
            <RefreshButton />
          </div>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-emerald-700 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-100">
            Quantite totale {hasFilters ? "(filtre)" : "(tous les codes)"}
          </p>
          <p className="mt-2 text-4xl font-black tracking-tight">
            {totalQuantite.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
          </p>
        </div>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <form className="grid gap-3 sm:grid-cols-3">
            <SearchableFilterInput
              name="article"
              defaultValue={articleFilter}
              options={articleOptions}
              placeholder="Article..."
            />
            <input
              type="text"
              name="code"
              defaultValue={params.code || ""}
              placeholder="Code (numero de lot)"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Filtrer
              </button>
              {hasFilters ? (
                <a
                  href="/stock/rapport/code"
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                >
                  Effacer
                </a>
              ) : null}
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {error ? (
            <div className="px-6 py-8">
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error.message}
              </p>
            </div>
          ) : codeRows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              {hasFilters ? "Aucun resultat pour ce filtre." : "Aucun code en stock pour le moment."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">Quantite</th>
                    <th className="px-6 py-4 font-semibold">Date fabrication</th>
                    <th className="px-6 py-4 font-semibold">PD</th>
                    <th className="px-6 py-4 font-semibold">Date dispatch</th>
                    <th className="px-6 py-4 font-semibold">Programme</th>
                  </tr>
                </thead>
                <tbody>
                  {codeRows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-medium text-slate-900">{row.article}</td>
                      <td className="px-6 py-4 text-slate-600">{row.code}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          {row.quantite.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(row.dateFabrication)}</td>
                      <td className="px-6 py-4 text-slate-600">{row.pdLabel}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(row.dateDispatch)}</td>
                      <td className="px-6 py-4 text-slate-600">{row.programme}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
