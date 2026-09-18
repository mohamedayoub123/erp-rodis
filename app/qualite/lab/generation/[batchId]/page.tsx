import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SimplePrintButton } from "@/app/_components/simple-print-button";
import { formatDateTime } from "@/lib/format-date";

type BatchRow = { id: number; utilisateur: string | null; created_at: string };

type GenerationRow = {
  id: number;
  article_id: number;
  qt_vrac: number | null;
  nb_code: number;
  type: "auto" | "manuel";
  generated_codes: string[] | null;
};

export default async function QualiteLabGenerationBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  noStore();
  const { batchId } = await params;
  const batchIdNum = Number(batchId);

  if (!batchIdNum) {
    notFound();
  }

  // Numerote ce CLAB par ordre de creation parmi tous les batchs (le plus
  // ancien = CLAB1) - meme calcul que la liste.
  const { data: allBatchesData } = await supabaseServer
    .from("qualite_lab_code_batches")
    .select("id, utilisateur, created_at")
    .order("created_at", { ascending: true });
  const allBatches = (allBatchesData ?? []) as BatchRow[];
  const batchIndex = allBatches.findIndex((row) => row.id === batchIdNum);
  const batch = batchIndex >= 0 ? allBatches[batchIndex] : null;

  if (!batch) {
    notFound();
  }
  const label = `CLAB${batchIndex + 1}`;

  const { data: generationsData } = await supabaseServer
    .from("qualite_lab_code_generations")
    .select("id, article_id, qt_vrac, nb_code, type, generated_codes")
    .eq("batch_id", batchIdNum)
    .order("id", { ascending: true });
  const generations = (generationsData ?? []) as GenerationRow[];

  if (generations.length === 0) {
    notFound();
  }

  const articleIds = [...new Set(generations.map((row) => row.article_id))];
  const { data: articlesData } = await supabaseServer
    .from("articles")
    .select("id, nom_article")
    .in("id", articleIds);
  const articleNameById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string }[]).map((row) => [row.id, row.nom_article])
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="no-print rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{label}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formatDateTime(batch.created_at)}
                {batch.utilisateur ? ` - ${batch.utilisateur}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/qualite/lab/generation" label="Retour" />
              <RefreshButton />
              <SimplePrintButton />
            </div>
          </div>
        </section>

        <section className="hidden text-center print:block">
          <p className="text-lg font-black">{label}</p>
          <p className="text-sm">{formatDateTime(batch.created_at)}</p>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-50 text-slate-950">
                <tr>
                  <th className="px-4 py-3 font-semibold">Article</th>
                  <th className="px-4 py-3 font-semibold">Qt vrac</th>
                  <th className="px-4 py-3 font-semibold">Nb de code</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Codes generes</th>
                </tr>
              </thead>
              <tbody>
                {generations.map((generation) => (
                  <tr key={generation.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {articleNameById.get(generation.article_id) || `#${generation.article_id}`}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{generation.qt_vrac ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{generation.nb_code}</td>
                    <td className="px-4 py-3 text-slate-600">{generation.type === "auto" ? "Auto" : "Manuel"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {generation.generated_codes && generation.generated_codes.length > 0
                        ? generation.generated_codes.join(", ")
                        : "Aucun pour le moment"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
