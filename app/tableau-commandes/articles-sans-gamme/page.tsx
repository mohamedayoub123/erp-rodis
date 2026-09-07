import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import {
  FAMILY_ORDER,
  FAMILY_BUTTON_STYLES,
  FAMILY_SUBGAMMES,
  getFamilySubGamme,
  matchesFamilyGamme,
  ilikePatternForFamily,
} from "../family-lib";
import { reassignArticlesGammeAction } from "./actions";

type ArticleRow = {
  id: number;
  nom_article: string | null;
  gamme: string | null;
  nature: string | null;
};

type SearchParams = Promise<{ famille?: string }>;

export default async function ArticlesSansGammePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const params = await searchParams;
  const selectedFamille = String(params.famille || "").trim();
  const isKnownFamily = FAMILY_ORDER.includes(selectedFamille);

  let articles: ArticleRow[] = [];
  let groupEntries: [string, ArticleRow[]][] = [];
  let pageTitle = "Articles sans gamme reconnue";
  let pageIntro =
    "Ces articles produit fini n'appartiennent a aucune famille du tableau de commandes - coche-les puis choisis une gamme existante, ou tape le nom d'une nouvelle gamme pour les y ranger.";

  if (isKnownFamily) {
    const { data } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme, nature")
      .neq("nature", "vrac")
      .ilike("gamme", ilikePatternForFamily(selectedFamille))
      .order("nom_article", { ascending: true });

    articles = ((data as ArticleRow[] | null) ?? []).filter((row) =>
      matchesFamilyGamme(String(row.gamme || ""), String(row.nom_article || ""), selectedFamille)
    );

    // Sous-groupes par banniere (meme convention que le tableau par gamme)
    // quand la famille en a, sinon un seul groupe avec tout dedans.
    const groups = new Map<string, ArticleRow[]>();
    for (const article of articles) {
      const subGamme = FAMILY_SUBGAMMES[selectedFamille]
        ? getFamilySubGamme(selectedFamille, String(article.gamme || ""))
        : null;
      const key = subGamme?.label || selectedFamille;
      const list = groups.get(key) ?? [];
      list.push(article);
      groups.set(key, list);
    }
    groupEntries = [...groups.entries()];

    pageTitle = `Articles de la famille "${selectedFamille}"`;
    pageIntro =
      "Coche les articles a deplacer, puis choisis une autre gamme existante, ou tape le nom d'une nouvelle gamme.";
  } else {
    const { data } = await supabaseServer
      .from("articles")
      .select("id, nom_article, gamme, nature")
      .neq("nature", "vrac")
      .order("gamme", { ascending: true })
      .order("nom_article", { ascending: true });

    const rows = (data as ArticleRow[] | null) ?? [];

    // Un article est "orphelin" si aucune famille curee (FAMILY_ORDER) du
    // tableau de commandes ne le reconnait - meme logique que la page
    // principale, mais sans le bucket automatique par gamme (fetchDynamicFamilies)
    // pour que cette page reste le seul endroit qui liste vraiment tout ce qui
    // n'a pas encore ete range volontairement dans une famille.
    articles = rows.filter(
      (row) =>
        !FAMILY_ORDER.some((family) =>
          matchesFamilyGamme(String(row.gamme || ""), String(row.nom_article || ""), family)
        )
    );

    const groups = new Map<string, ArticleRow[]>();
    for (const article of articles) {
      const key = String(article.gamme || "").trim() || "(sans gamme)";
      const list = groups.get(key) ?? [];
      list.push(article);
      groups.set(key, list);
    }
    groupEntries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">ERP Rodis</p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight">{pageTitle}</h1>
              <p className="mt-2 text-sm text-slate-600">{pageIntro}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isKnownFamily ? (
                <BackButton href="/tableau-commandes/articles-sans-gamme" label="Choisir une autre famille" />
              ) : null}
              <BackButton href="/tableau-commandes" label="Retour" />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <p className="mb-3 text-sm font-medium text-slate-700">
            Ou choisis directement une famille pour voir tout ce qu&apos;elle contient et la reorganiser :
          </p>
          <div className="flex flex-wrap gap-2">
            {FAMILY_ORDER.map((family) => {
              const buttonStyle = FAMILY_BUTTON_STYLES[family] || "bg-slate-200 text-slate-950";
              const isActive = family === selectedFamille;
              return (
                <Link
                  key={family}
                  href={`/tableau-commandes/articles-sans-gamme?famille=${encodeURIComponent(family)}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold leading-none shadow-sm transition hover:opacity-90 ${buttonStyle} ${
                    isActive ? "ring-2 ring-slate-950/30" : ""
                  }`}
                >
                  {family}
                </Link>
              );
            })}
          </div>
        </section>

        {groupEntries.length === 0 ? (
          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            {isKnownFamily
              ? "Cette famille ne contient aucun article pour le moment."
              : "Tous les articles produit fini sont rattaches a une gamme reconnue."}
          </section>
        ) : (
          <form action={reassignArticlesGammeAction} className="space-y-5">
            {groupEntries.map(([groupLabel, groupArticles]) => (
              <section
                key={groupLabel}
                className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
              >
                <h2 className="text-lg font-semibold text-slate-900">
                  {groupLabel}{" "}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    ({groupArticles.length} article{groupArticles.length > 1 ? "s" : ""})
                  </span>
                </h2>
                <ul className="mt-3 divide-y divide-slate-100">
                  {groupArticles.map((article) => (
                    <li key={article.id} className="flex items-center gap-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="article_id"
                        value={article.id}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span>{article.nom_article}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section className="sticky bottom-4 rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
              <p className="text-sm font-medium text-slate-700">
                Coche les articles ci-dessus, puis choisis ou les mettre :
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  Gamme existante
                  <select name="gamme_existante" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">-- choisir --</option>
                    {FAMILY_ORDER.map((family) => (
                      <option key={family} value={family}>
                        {family}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="pb-2 text-sm text-slate-500">ou</span>
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  Nouvelle gamme
                  <input
                    type="text"
                    name="nouvelle_gamme"
                    placeholder="Nom de la nouvelle gamme"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full bg-amber-600 px-5 py-2 text-[15px] font-medium text-white shadow-sm transition hover:opacity-90"
                >
                  Assigner la selection
                </button>
              </div>
            </section>
          </form>
        )}
      </div>
    </main>
  );
}
