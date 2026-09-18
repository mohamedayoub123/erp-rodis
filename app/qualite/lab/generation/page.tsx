import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDateTime } from "@/lib/format-date";

type BatchRow = {
  id: number;
  utilisateur: string | null;
  created_at: string;
};

type GenerationRow = {
  batch_id: number;
  article_id: number;
};

export default async function QualiteLabGenerationListPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "qualiteLab");

  const { data: batchesData } = await supabaseServer
    .from("qualite_lab_code_batches")
    .select("id, utilisateur, created_at")
    .order("created_at", { ascending: true });
  const batches = (batchesData ?? []) as BatchRow[];

  const { data: generationsData } = await supabaseServer
    .from("qualite_lab_code_generations")
    .select("batch_id, article_id");
  const generations = (generationsData ?? []) as GenerationRow[];

  const articleIds = [...new Set(generations.map((row) => row.article_id))];
  const { data: articlesData } =
    articleIds.length > 0
      ? await supabaseServer.from("articles").select("id, nom_article").in("id", articleIds)
      : { data: [] as { id: number; nom_article: string }[] };
  const articleNameById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string }[]).map((row) => [row.id, row.nom_article])
  );

  const articleIdsByBatch = new Map<number, number[]>();
  for (const row of generations) {
    const list = articleIdsByBatch.get(row.batch_id) ?? [];
    list.push(row.article_id);
    articleIdsByBatch.set(row.batch_id, list);
  }

  // CLAB numerote par ordre de creation (le plus ancien = CLAB1) - affiche
  // ensuite du plus recent au plus ancien.
  const batchRows = batches
    .map((batch, index) => ({
      batch,
      label: `CLAB${index + 1}`,
      articleIds: articleIdsByBatch.get(batch.id) ?? [],
    }))
    .reverse();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                Lab - Generation de codes
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Chaque Save (un ou plusieurs articles a la fois) devient un CLAB - ouvre-le pour voir les articles
                et leurs codes, et l&apos;imprimer.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <BackButton href="/qualite/lab" label="Retour Lab" />
              <RefreshButton />
              {canEdit ? (
                <Link
                  href="/qualite/lab/generation/nouvelle"
                  className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white"
                >
                  Nouvelle entree
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          {batchRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Aucune entree pour le moment.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">CLAB</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Articles</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Date</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Utilisateur</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map(({ batch, label, articleIds: ids }) => (
                    <tr key={batch.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <Link href={`/qualite/lab/generation/${batch.id}`} className="text-violet-700 hover:underline">
                          {label}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {ids.length === 0
                          ? "-"
                          : ids.map((id) => articleNameById.get(id) || `#${id}`).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(batch.created_at)}</td>
                      <td className="px-4 py-3 text-slate-500">{batch.utilisateur || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
