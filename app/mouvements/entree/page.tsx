import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { EntreeClient } from "./entree-client";
import { BackButton } from "@/app/_components/back-button";

export default async function EntreeMouvementPage() {
  const currentStockUser = await getCurrentStockUser();
  const canWriteMouvements = canWritePageUser(currentStockUser, "mouvementsEntree");

  const { data: articlesData } = await supabaseServer
    .from("articles")
    .select("id, nom_article")
    .order("nom_article", { ascending: true })
    .limit(10000);

  const articles = ((articlesData as { id: number; nom_article: string }[] | null) ?? []).map(
    (article) => ({
      id: article.id,
      label: article.nom_article,
    })
  );

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
                Entrer stock
              </h1>
            </div>

            <BackButton href="/mouvements/produit-fini" />
          </div>
        </section>

        <EntreeClient articles={articles} canWrite={canWriteMouvements} />
      </div>
    </main>
  );
}
