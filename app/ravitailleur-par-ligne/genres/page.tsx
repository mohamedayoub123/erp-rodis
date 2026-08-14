import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";

type DispatcherRow = {
  id: number;
  produit: string | null;
  code: string | null;
  article_id: number | null;
  groupe_id: number | null;
  zone: string;
  chaine: string;
};

type ProgrammeLigneKeyRow = {
  groupe_id: number | null;
  article_id: number | null;
  zone: string;
  chaine: string;
  plateforme: string | null;
};

async function fetchAllDispatcherRows(): Promise<DispatcherRow[]> {
  const rows: DispatcherRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_dispatcher_lignes")
      .select("id, produit, code, article_id, groupe_id, zone, chaine")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as DispatcherRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchAllProgrammeLigneKeys(): Promise<ProgrammeLigneKeyRow[]> {
  const rows: ProgrammeLigneKeyRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("programme_lignes")
      .select("groupe_id, article_id, zone, chaine, plateforme")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ProgrammeLigneKeyRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function plateformeKey(groupeId: number | null, articleId: number | null, zone: string, chaine: string) {
  return `${groupeId ?? ""}::${articleId ?? ""}::${zone}::${chaine}`;
}

type ArticleTypeRow = { id: number; type_article: string | null };

async function fetchAllArticleTypes(): Promise<ArticleTypeRow[]> {
  const rows: ArticleTypeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, type_article")
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ArticleTypeRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Le genre vient du vrai champ "Type article" (deja renseigne a la main sur
// chaque article Produit Fini, voir Articles Produit Fini) - PAS devine
// depuis le nom. Confirme sur les vraies donnees : "Lait WHITE SECRET" a
// type_article="clarifiant" (pas "lait"), donc aucune regle basee sur le
// nom (Lait/Creme/DSR...) ne pouvait jamais retrouver cette classification
// correctement. Normalise casse/espaces pour le regroupement, affiche
// proprement capitalise.
function formatGenreLabel(typeArticle: string | null): string {
  const trimmed = (typeArticle || "").trim();
  if (!trimmed) return "Autre";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

type GenreRow = { id: number; produit: string; code: string; plateforme: string | null };

function RavitailleurGenreTable({
  title,
  rows,
  className = "",
}: {
  title: string;
  rows: GenreRow[];
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)] ${className}`}
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        {/* Largeur exacte au contenu pour Article/Code (nowrap, sans
            largeur forcee - table-layout:auto natif) - le globals.css a une
            regle desormais STRICTEMENT plus specifique que celle qui
            cassait ca a l'impression (voir .print-readable-table), donc
            plus d'ambiguite sur laquelle des 2 s'applique. Remarque
            (print-remarque-cell) garde une largeur minimale genereuse pour
            ne jamais s'ecraser. */}
        <table className="print-readable-table w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap border border-slate-300 bg-slate-200 px-3 py-2 text-left font-bold text-slate-900">
                ARTICLE
              </th>
              <th className="whitespace-nowrap border border-slate-300 bg-slate-200 px-3 py-2 text-center font-bold text-slate-900">
                CODE
              </th>
              <th className="border border-slate-300 bg-slate-200 px-3 py-2 text-left font-bold text-slate-900">
                REMARQUE
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="border border-slate-300 bg-white px-3 py-6 text-center text-slate-500">
                  Aucun article pour le moment.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap border border-slate-300 bg-white px-3 py-6 font-medium text-slate-900">
                    {row.produit}
                  </td>
                  <td className="whitespace-nowrap border border-slate-300 bg-white px-3 py-6 text-center">
                    {row.code || "-"}
                  </td>
                  <td className="print-remarque-cell border border-slate-300 bg-white px-3 py-6" />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function RavitailleurGenresPage() {
  noStore();

  const [dispatcherRows, programmeLigneKeys, articleTypes] = await Promise.all([
    fetchAllDispatcherRows(),
    fetchAllProgrammeLigneKeys(),
    fetchAllArticleTypes(),
  ]);

  const plateformeByKey = new Map<string, string | null>();
  for (const ligne of programmeLigneKeys) {
    plateformeByKey.set(plateformeKey(ligne.groupe_id, ligne.article_id, ligne.zone, ligne.chaine), ligne.plateforme);
  }

  const typeArticleByArticleId = new Map(articleTypes.map((article) => [article.id, article.type_article]));

  const rowsByGenre = new Map<string, GenreRow[]>();
  for (const row of dispatcherRows) {
    const genre = formatGenreLabel(row.article_id !== null ? typeArticleByArticleId.get(row.article_id) ?? null : null);
    const plateforme = plateformeByKey.get(plateformeKey(row.groupe_id, row.article_id, row.zone, row.chaine)) ?? null;
    const list = rowsByGenre.get(genre) ?? [];
    list.push({ id: row.id, produit: row.produit || "-", code: row.code || "", plateforme });
    rowsByGenre.set(genre, list);
  }

  for (const list of rowsByGenre.values()) {
    list.sort((a, b) => a.produit.localeCompare(b.produit, "fr", { sensitivity: "base" }));
  }

  // Genres tries alphabetiquement (ordre stable, previsible a l'impression) -
  // "Autre" (rien de reconnu) toujours en dernier.
  const genreOrder = [...rowsByGenre.keys()].sort((a, b) => {
    if (a === "Autre") return 1;
    if (b === "Autre") return -1;
    return a.localeCompare(b, "fr", { sensitivity: "base" });
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Impression pour detail de fabrication
              </h1>
            </div>

            <div className="no-print flex items-center gap-3">
              <BackButton href="/ravitailleur-par-ligne" />
              <RefreshButton />
              <SimplePrintButton />
            </div>
          </div>
        </section>

        {/* Auto/Manuel s'applique a TOUS les genres, sans exception - le
            genre lui-meme n'apparait que s'il a au moins 1 ligne dispatchee,
            jamais de section/page vide a l'impression. */}
        {genreOrder.map((genre, sectionIndex) => {
          const genreRows = rowsByGenre.get(genre) ?? [];
          const pageBreakClass = sectionIndex > 0 ? "print-page-break" : "";

          const autoRows = genreRows.filter((row) => row.plateforme === "A");
          const manuRows = genreRows.filter((row) => row.plateforme === "M");
          const nonClasseRows = genreRows.filter((row) => row.plateforme !== "A" && row.plateforme !== "M");

          return (
            <div key={genre} className={`space-y-6 ${pageBreakClass}`}>
              {autoRows.length > 0 ? <RavitailleurGenreTable title={`${genre} - Auto`} rows={autoRows} /> : null}
              {manuRows.length > 0 ? <RavitailleurGenreTable title={`${genre} - Manuel`} rows={manuRows} /> : null}
              {nonClasseRows.length > 0 ? (
                <RavitailleurGenreTable title={`${genre} - Non classe`} rows={nonClasseRows} />
              ) : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}
