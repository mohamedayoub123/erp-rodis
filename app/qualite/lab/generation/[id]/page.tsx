import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { canQualiteLabOverwriteLotUser, canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { BackButton } from "@/app/_components/back-button";
import { RefreshButton } from "@/app/_components/refresh-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { ConfirmSubmitButton } from "@/app/_components/confirm-submit-button";
import { regenerateLabCodesAction, deleteLabCodeGenerationAction } from "../actions";

type GenerationRow = {
  id: number;
  article_id: number;
  qt_vrac: number | null;
  nb_code: number;
  type: "auto" | "manuel";
  generated_codes: string[] | null;
  utilisateur: string | null;
  updated_at: string;
};

type SearchParams = Promise<{ erreur?: string }>;

export default async function LabGenerationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  noStore();
  const { id } = await params;
  const generationId = Number(id);
  const { erreur } = await searchParams;

  if (!generationId) {
    notFound();
  }

  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "qualiteLab");
  const canOverwriteWhenFilled = await canQualiteLabOverwriteLotUser(currentUser);

  const { data: generationData } = await supabaseServer
    .from("qualite_lab_code_generations")
    .select("id, article_id, qt_vrac, nb_code, type, generated_codes, utilisateur, updated_at")
    .eq("id", generationId)
    .maybeSingle();
  const generation = generationData as GenerationRow | null;

  if (!generation) {
    notFound();
  }

  const field = generation.type === "auto" ? "lab_code_auto" : "lab_code_manu";
  const { data: articleData } = await supabaseServer
    .from("articles")
    .select(`nom_article, ${field}`)
    .eq("id", generation.article_id)
    .maybeSingle();
  const article = articleData as { nom_article: string } & Record<string, string | null>;
  const currentLabCode = article?.[field] ?? null;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_45%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
                ERP Rodis
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                {article?.nom_article || `#${generation.article_id}`}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <BackButton href="/qualite/lab/generation" label="Retour" />
              <RefreshButton />
            </div>
          </div>
        </section>

        {erreur ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">
            {erreur}
          </div>
        ) : null}

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qt vrac</p>
              <p className="text-lg font-bold text-slate-900">{generation.qt_vrac ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre de code</p>
              <p className="text-lg font-bold text-slate-900">{generation.nb_code}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</p>
              <p className="text-lg font-bold text-slate-900">{generation.type === "auto" ? "Auto" : "Manuel"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Code Lab actuel ({generation.type === "auto" ? "Code auto" : "Code manuel"})
              </p>
              <p className="text-lg font-bold text-slate-900">{currentLabCode || "-"}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Derniers codes generes
            </p>
            <p className="text-lg font-bold text-slate-900">
              {generation.generated_codes && generation.generated_codes.length > 0
                ? generation.generated_codes.join(", ")
                : "Aucun pour le moment"}
            </p>
          </div>

          {canWrite ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <form action={regenerateLabCodesAction}>
                <input type="hidden" name="generation_id" value={generation.id} />
                <SubmitButton
                  pendingLabel="Generation..."
                  className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
                >
                  Regenerer les codes
                </SubmitButton>
              </form>
              {!canOverwriteWhenFilled ? (
                <p className="text-xs text-slate-500">
                  Regenerer modifie un code deja rempli - reserve aux utilisateurs autorises.
                </p>
              ) : null}
              <form action={deleteLabCodeGenerationAction} className="ml-auto">
                <input type="hidden" name="generation_id" value={generation.id} />
                <ConfirmSubmitButton
                  confirmMessage="Supprimer cette entree Lab ?"
                  pendingLabel="Suppression..."
                  className="rounded-full border border-red-200 px-5 py-3 text-sm font-semibold text-red-700"
                >
                  Supprimer
                </ConfirmSubmitButton>
              </form>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
