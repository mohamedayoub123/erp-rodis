import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { FAMILY_ORDER, matchesFamilyGamme } from "../family-lib";
import { reassignArticlesGammeAction } from "./actions";

type ArticleRow = {
  id: number;
  nom_article: string | null;
  gamme: string | null;
  nature: string | null;
};

export default async function ArticlesSansGammePage() {
  noStore();

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
  const orphans = rows.filter(
    (row) =>
      !FAMILY_ORDER.some((family) =>
        matchesFamilyGamme(String(row.gamme || ""), String(row.nom_article || ""), family)
      )
  );

  const groups = new Map<string, ArticleRow[]>();
  for (const article of orphans) {
    const key = String(article.gamme || "").trim() || "(sans gamme)";
    const list = groups.get(key) ?? [];
    list.push(article);
    groups.set(key, list);
  }
  const groupEntries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-slate-900 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b95b16]">ERP Rodis</p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight">Articles sans gamme reconnue</h1>
              <p className="mt-2 text-sm text-slate-600">
                Ces articles produit fini n&apos;appartiennent a aucune famille du tableau de commandes -
                coche-les puis choisis une gamme existante, ou tape le nom d&apos;une nouvelle gamme pour les
                y ranger.
              </p>
            </div>
            <BackButton href="/tableau-commandes" label="Retour" />
          </div>
        </section>

        {groupEntries.length === 0 ? (
          <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            Tous les articles produit fini sont rattaches a une gamme reconnue.
          </section>
        ) : (
          <form action={reassignArticlesGammeAction} className="space-y-5">
            {groupEntries.map(([gamme, articles]) => (
              <section
                key={gamme}
                className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
              >
                <h2 className="text-lg font-semibold text-slate-900">
                  {gamme}{" "}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    ({articles.length} article{articles.length > 1 ? "s" : ""})
                  </span>
                </h2>
                <ul className="mt-3 divide-y divide-slate-100">
                  {articles.map((article) => (
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
