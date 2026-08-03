import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { createCommandeBcMpAction } from "../actions";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";

async function fetchArticleOptions() {
  const options: string[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles_matiere_premiere")
      .select("nom_article")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as { nom_article: string }[];
    options.push(...chunk.map((row) => row.nom_article));

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return options;
}

export default async function NouvelleCommandeBcMpPage() {
  const currentUser = await getCurrentStockUser();
  const canWriteNouvelle = await canWritePageUser(currentUser, "commandeBcMpNouvelle");
  const articleOptions = await fetchArticleOptions();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf8ff_0%,#f8fcff_48%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Ajouter commande MP
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/stock/matiere-premiere/bc" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWriteNouvelle ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : ajout de commande cache pour cet utilisateur.
            </p>
          ) : (
            <form action={createCommandeBcMpAction} className="grid gap-4">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Article
                <input
                  type="text"
                  name="article"
                  list="bc-article-options"
                  autoComplete="off"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                  required
                />
                <datalist id="bc-article-options">
                  {articleOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Quantite
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="quantite"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Doss. 4D
                <input
                  type="text"
                  name="n_doss_4d"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Doss. ERP
                <input
                  type="text"
                  name="n_doss_erp"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none"
                />
              </label>

              <div>
                <button
                  type="submit"
                  className="rounded-full bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
                >
                  Enregistrer commande
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
