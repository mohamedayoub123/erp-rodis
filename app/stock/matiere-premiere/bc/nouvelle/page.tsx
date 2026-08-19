import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { StagedBcMp } from "../staged-bc-mp";

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
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Ajouter commande MP
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Ajoute autant d&apos;articles que necessaire, ils seront enregistres dans le
                meme BC.
              </p>
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
            <StagedBcMp articleOptions={articleOptions} />
          )}
        </section>
      </div>
    </main>
  );
}
