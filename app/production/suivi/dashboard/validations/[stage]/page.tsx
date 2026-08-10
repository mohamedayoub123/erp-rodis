import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDate } from "@/lib/format-date";
import { vracLabelFromName } from "@/lib/gamme-families";
import { matchesArticleSearch } from "@/lib/article-search";
import { ProduitFilterInput } from "../../produit-filter-input";

type CodeTermineRow = {
  id: number;
  programme_ligne_id: number;
  code: string;
  numero_lot: string | null;
  termine_date: string | null;
};

type LigneRow = {
  id: number;
  article_id: number | null;
  produit: string | null;
  date_jour: string | null;
};

type ArticleRow = { id: number; nom_article: string; vrac_article_id: number | null };
type ArticleMpRow = { id: number; nom_article: string; unite: string | null };
type ReserveRow = { production_code_termine_id: number; article_mp_id: number; quantite: number };

async function fetchAllCodeTermineRows(stage: string): Promise<CodeTermineRow[]> {
  const rows: CodeTermineRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("production_code_termine")
      .select("id, programme_ligne_id, code, numero_lot, termine_date")
      .eq("stage", stage)
      .order("termine_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as CodeTermineRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchByIds<T>(table: string, select: string, column: string, ids: (number | string)[]): Promise<T[]> {
  if (ids.length === 0) return [];
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(select)
      .in(column, ids)
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

type SearchParams = Promise<{ produit?: string }>;

// Historique de tout ce qui a ete "Valide" via Salle de pesage
// (stage="pesage") ou Salle de conditionnement (stage="salle_conditionnement")
// - le Dashboard lui-meme ne montre QUE ce qui reste EN COURS (une ligne
// validee en disparait), donc rien nulle part d'autre ne permet de retrouver
// ce qui a deja ete valide pour un article donne.
export default async function ValidationsHistoriquePage({
  params,
  searchParams,
}: {
  params: Promise<{ stage: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const { stage: stageParam } = await params;
  if (stageParam !== "pesage" && stageParam !== "conditionnement") {
    notFound();
  }
  const storedStage = stageParam === "pesage" ? "pesage" : "salle_conditionnement";
  const titre = stageParam === "pesage" ? "Salle de pesage" : "Salle de conditionnement";

  const { produit: produitParam } = await searchParams;
  const produitFilter = (produitParam || "").trim().toLowerCase();

  const codeTermineRows = await fetchAllCodeTermineRows(storedStage);

  const ligneIds = [...new Set(codeTermineRows.map((r) => r.programme_ligne_id))];

  const [lignes, reserveRows] = await Promise.all([
    fetchByIds<LigneRow>("programme_lignes", "id, article_id, produit, date_jour", "id", ligneIds),
    fetchByIds<ReserveRow>(
      "production_mp_reserve",
      "production_code_termine_id, article_mp_id, quantite",
      "production_code_termine_id",
      codeTermineRows.map((r) => r.id)
    ),
  ]);

  const ligneById = new Map(lignes.map((l) => [l.id, l]));
  const articleIds = [...new Set(lignes.map((l) => l.article_id).filter((id): id is number => !!id))];
  const mpIds = [...new Set(reserveRows.map((r) => r.article_mp_id))];

  const [articles, articlesMp] = await Promise.all([
    fetchByIds<ArticleRow>("articles", "id, nom_article, vrac_article_id", "id", articleIds),
    fetchByIds<ArticleMpRow>("articles_matiere_premiere", "id, nom_article, unite", "id", mpIds),
  ]);

  const articleById = new Map(articles.map((a) => [a.id, a]));
  const articleMpById = new Map(articlesMp.map((a) => [a.id, a]));

  const reserveByCodeTermineId = new Map<number, { nom: string; unite: string; quantite: number }[]>();
  for (const r of reserveRows) {
    const list = reserveByCodeTermineId.get(r.production_code_termine_id) ?? [];
    list.push({
      nom: articleMpById.get(r.article_mp_id)?.nom_article ?? `#${r.article_mp_id}`,
      unite: articleMpById.get(r.article_mp_id)?.unite ?? "-",
      quantite: Number(r.quantite ?? 0),
    });
    reserveByCodeTermineId.set(r.production_code_termine_id, list);
  }

  const rows = codeTermineRows
    .map((row) => {
      const ligne = ligneById.get(row.programme_ligne_id);
      const article = ligne?.article_id ? articleById.get(ligne.article_id) : null;
      const label =
        stageParam === "pesage"
          ? (article?.vrac_article_id ? articleById.get(article.vrac_article_id)?.nom_article : null) ||
            vracLabelFromName(ligne?.produit ?? null) ||
            "-"
          : ligne?.produit || article?.nom_article || "-";
      return {
        id: row.id,
        date: row.termine_date,
        dateJour: ligne?.date_jour ?? null,
        label,
        code: row.code,
        numeroLot: row.numero_lot,
        mpList: reserveByCodeTermineId.get(row.id) ?? [],
      };
    })
    .filter((row) => !produitFilter || matchesArticleSearch(row.label, produitFilter));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                Historique des validations
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{titre}</h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/suivi/dashboard" label="Retour dashboard" />
              <RefreshButton />
            </div>
          </div>

          <form className="mt-4 max-w-sm">
            <ProduitFilterInput
              name="produit"
              defaultValue={produitParam || ""}
              articles={articles.map((a) => ({ id: a.id, label: a.nom_article }))}
              placeholder="Filtrer par article"
            />
          </form>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">Aucune validation pour le moment.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Date validee</th>
                    <th className="px-6 py-4 font-semibold">Article</th>
                    <th className="px-6 py-4 font-semibold">Code</th>
                    <th className="px-6 py-4 font-semibold">N de lot</th>
                    <th className="px-6 py-4 font-semibold">MP reservees</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top">
                      <td className="px-6 py-4 text-slate-600">
                        {row.date ? new Date(row.date).toLocaleString("fr-FR") : formatDate(row.dateJour)}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">{row.label}</td>
                      <td className="px-6 py-4 text-slate-700">{row.code}</td>
                      <td className="px-6 py-4 text-slate-700">{row.numeroLot || "-"}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.mpList.length === 0 ? (
                          "-"
                        ) : (
                          <ul className="space-y-0.5">
                            {row.mpList.map((mp, index) => (
                              <li key={index}>
                                {mp.nom} : {mp.quantite.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}{" "}
                                {mp.unite}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
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
