import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { formatDateTime } from "@/lib/format-date";

type GenerationRow = {
  id: number;
  article_id: number;
  qt_vrac: number | null;
  nb_code: number;
  type: "auto" | "manuel";
  generated_codes: string[] | null;
  updated_at: string;
};

export default async function QualiteLabGenerationListPage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canEdit = await canWritePageUser(currentUser, "qualiteLab");

  const { data: generationsData } = await supabaseServer
    .from("qualite_lab_code_generations")
    .select("id, article_id, qt_vrac, nb_code, type, generated_codes, updated_at")
    .order("updated_at", { ascending: false });
  const generations = (generationsData ?? []) as GenerationRow[];

  const articleIds = [...new Set(generations.map((row) => row.article_id))];
  const { data: articlesData } =
    articleIds.length > 0
      ? await supabaseServer.from("articles").select("id, nom_article").in("id", articleIds)
      : { data: [] as { id: number; nom_article: string }[] };
  const articleNameById = new Map(
    ((articlesData ?? []) as { id: number; nom_article: string }[]).map((row) => [row.id, row.nom_article])
  );

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
                Article, qt vrac et nombre de codes - rouvre une entree pour regenerer ses codes.
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
          {generations.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Aucune entree pour le moment.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-slate-50 text-slate-950">
                  <tr>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Article</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Qt vrac</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Nb de code</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Type</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Derniers codes generes</th>
                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">Mis a jour</th>
                  </tr>
                </thead>
                <tbody>
                  {generations.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <Link href={`/qualite/lab/generation/${row.id}`} className="text-violet-700 hover:underline">
                          {articleNameById.get(row.article_id) || `#${row.article_id}`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.qt_vrac ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.nb_code}</td>
                      <td className="px-4 py-3 text-slate-600">{row.type === "auto" ? "Auto" : "Manuel"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.generated_codes && row.generated_codes.length > 0
                          ? row.generated_codes.join(", ")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(row.updated_at)}</td>
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
