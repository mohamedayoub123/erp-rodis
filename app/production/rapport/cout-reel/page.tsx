import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SearchableFilterInput } from "@/app/_components/searchable-filter-input";
import { matchesArticleSearch } from "@/lib/article-search";

type ArticleOptionRow = { id: number; nom_article: string; code_auto: string | null; code_manu: string | null };

async function fetchAllArticlesPourRecherche(): Promise<ArticleOptionRow[]> {
  const rows: ArticleOptionRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article, code_auto, code_manu")
      .range(from, from + pageSize - 1);

    if (error) break;
    const chunk = (data ?? []) as ArticleOptionRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function labelFor(article: ArticleOptionRow) {
  return article.nom_article;
}

type SearchParams = Promise<{ article?: string }>;

// Recherche un article par code (ou nom) - resout directement cote serveur
// (pas de client JS necessaire) et redirige vers sa fiche de cout des qu'un
// seul article correspond.
export default async function CoutReelRecherchePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const params = await searchParams;
  const query = (params.article || "").trim();

  const articles = await fetchAllArticlesPourRecherche();

  let aucunResultat = false;
  if (query) {
    const exact = articles.find((a) => labelFor(a) === query);
    if (exact) {
      redirect(`/production/rapport/cout-reel/${exact.id}`);
    }

    const parCode = articles.find(
      (a) =>
        (a.code_manu && a.code_manu.toLowerCase() === query.toLowerCase()) ||
        (a.code_auto && a.code_auto.toLowerCase() === query.toLowerCase())
    );
    if (parCode) {
      redirect(`/production/rapport/cout-reel/${parCode.id}`);
    }

    const parNom = articles.filter((a) => matchesArticleSearch(a.nom_article, query));
    if (parNom.length === 1) {
      redirect(`/production/rapport/cout-reel/${parNom[0].id}`);
    }

    aucunResultat = true;
  }

  const options = articles
    .map((a) => ({ id: a.id, label: labelFor(a) }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Cout Reel</h1>
              <p className="mt-2 text-sm text-slate-600">
                Ecris le code d&apos;un article pour voir son cout de revient reel (vrac/conditionnement
                reellement utilises, electricite machine, journaliers) sur une periode.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production/rapport" label="Retour rapports" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form className="grid gap-3">
            <SearchableFilterInput name="article" placeholder="Ecris le code ou le nom..." defaultValue={query} options={options} />
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Chercher
            </button>
          </form>
          {aucunResultat ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Aucun article trouve pour &quot;{query}&quot; - choisis une suggestion dans la liste.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
