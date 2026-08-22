import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { fetchArticlesPlastique, DEPOT_PLASTIQUE_SOURCE_DEFAULT, DEPOT_PLASTIQUE_DEST_DEFAULT } from "../shared";
import { StagedProgrammePlastique } from "./staged-programme-plastique";

export default async function ProgrammePlastiquePage() {
  noStore();

  const [articles, depotsResult] = await Promise.all([
    fetchArticlesPlastique(),
    supabaseServer.from("depots").select("id, nom").order("nom", { ascending: true }),
  ]);

  const depots = ((depotsResult.data ?? []) as { id: number; nom: string }[]).map((d) => ({
    id: d.id,
    label: d.nom,
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe5_0%,#fbf8f2_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                Production Plastique
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Ajouter Programme</h1>
              <p className="mt-2 text-sm text-slate-600">
                Enregistre une production de flacons/capsules/pots - entre directement en stock et se transfere
                vers le depot d&apos;utilisation.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <BackButton href="/production-plastique" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        <StagedProgrammePlastique
          articles={articles.map((article) => ({ id: article.id, label: article.nom_article }))}
          depots={depots}
          depotSourceDefault={DEPOT_PLASTIQUE_SOURCE_DEFAULT}
          depotDestinationDefault={DEPOT_PLASTIQUE_DEST_DEFAULT}
        />
      </div>
    </main>
  );
}
