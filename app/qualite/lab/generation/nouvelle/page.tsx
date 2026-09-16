import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { ProduitPickerField } from "@/app/production/suivi-production/produit-picker-field";
import { createLabCodeGenerationAction } from "../actions";

type ArticleOption = { id: number; nom_article: string };

async function fetchAllArticles(): Promise<ArticleOption[]> {
  const rows: ArticleOption[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("articles")
      .select("id, nom_article")
      .order("nom_article", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const chunk = (data ?? []) as ArticleOption[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

const inputClass = "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none";

export default async function NouvelleLabGenerationPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "qualiteLab");
  const articles = await fetchAllArticles();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Nouvelle entree Lab</h1>
            </div>
            <BackButton href="/qualite/lab/generation" label="Retour" />
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {!canWrite ? (
            <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              Lecture seule : creation cachee pour cet utilisateur.
            </p>
          ) : (
            <form action={createLabCodeGenerationAction} className="grid gap-4">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Article
                <ProduitPickerField
                  articles={articles.map((article) => ({ id: article.id, label: article.nom_article }))}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Qt vrac
                <input type="number" step="0.01" name="qt_vrac" defaultValue="0" required className={inputClass} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Nombre de code
                <input type="number" step="1" min="1" name="nb_code" defaultValue="1" required className={inputClass} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Type
                <select name="type" defaultValue="auto" required className={inputClass}>
                  <option value="auto">Auto</option>
                  <option value="manuel">Manuel</option>
                </select>
              </label>

              <div>
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600"
                >
                  Save
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
