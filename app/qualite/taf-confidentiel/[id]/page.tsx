import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { canViewPageUser, canWritePageUser, getCurrentStockUser, getNcTafProcessusAutorisesUser } from "@/lib/stock-auth";
import { formatDate } from "../../../production/suivi/data";
import { updateTafConfidentielDetailAction } from "../actions";

type TafRow = {
  id: number;
  audit: string | null;
  numero: string | null;
  constat: string | null;
  processus_concerne: string | null;
  service_concerne: string | null;
  statut: string | null;
  created_at: string | null;
  date_realisation: string | null;
  qui: string | null;
  delais: string | null;
  commentaire: string | null;
  t1: string | null;
  t2: string | null;
  t3: string | null;
  t4: string | null;
};

const inputClass = "w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

type Params = Promise<{ id: string }>;

// Page dediee plein ecran pour remplir le suivi (Qui/Delais/Commentaire/
// T1-T4) d'un TAF existant - demande explicite, meme principe que
// /qualite/nc-confidentiel/[id]. L'edition en ligne sur le tableau reste
// disponible en plus, cette page ne la remplace pas.
export default async function TafConfidentielDetailPage({ params }: { params: Params }) {
  noStore();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!id) notFound();

  const currentUser = await getCurrentStockUser();
  const canView = await canViewPageUser(currentUser, "qualiteTafConfidentiel");
  if (!canView) {
    redirect("/qualite/taf-confidentiel");
  }

  const { data, error } = await supabaseServer.from("qualite_taf_confidentiel").select("*").eq("id", id).maybeSingle();
  if (error || !data) notFound();
  const row = data as TafRow;

  // Meme perimetre "Processus concerne" que le tableau - empeche d'acceder a
  // un TAF hors perimetre en tapant directement son URL.
  const processusAutorises = await getNcTafProcessusAutorisesUser(currentUser);
  if (processusAutorises !== "all" && !processusAutorises.includes(String(row.processus_concerne ?? "").trim())) {
    redirect("/qualite/taf-confidentiel");
  }

  const canWrite = await canWritePageUser(currentUser, "qualiteTafConfidentiel");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                TAF {row.audit ? `- Audit ${row.audit}` : ""} {row.numero ? `n°${row.numero}` : ""}
              </h1>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{row.constat || "-"}</p>
            </div>
            <BackButton href="/qualite/taf-confidentiel" label="Retour TAF Confidentiel" />
          </div>

          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:grid-cols-3 lg:grid-cols-5">
            <p>Processus : <span className="font-semibold text-slate-700">{row.processus_concerne || "-"}</span></p>
            <p>Service : <span className="font-semibold text-slate-700">{row.service_concerne || "-"}</span></p>
            <p>Statut : <span className="font-semibold text-slate-700">{row.statut || "-"}</span></p>
            <p>Date : <span className="font-semibold text-slate-700">{row.created_at ? formatDate(row.created_at) : "-"}</span></p>
            <p>Date de realisation : <span className="font-semibold text-slate-700">{row.date_realisation ? formatDate(row.date_realisation) : "-"}</span></p>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form action={updateTafConfidentielDetailAction} className="grid gap-5 sm:grid-cols-2">
            <input type="hidden" name="id" value={row.id} />

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Qui
              <input type="text" name="qui" defaultValue={row.qui || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Délais
              <input type="text" name="delais" defaultValue={row.delais || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              Commentaire
              <textarea name="commentaire" defaultValue={row.commentaire || ""} rows={4} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              T1
              <input type="text" name="t1" defaultValue={row.t1 || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              T2
              <input type="text" name="t2" defaultValue={row.t2 || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              T3
              <input type="text" name="t3" defaultValue={row.t3 || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              T4
              <input type="text" name="t4" defaultValue={row.t4 || ""} disabled={!canWrite} className={inputClass} />
            </label>

            {canWrite ? (
              <div className="mt-2 flex justify-end sm:col-span-2">
                <SubmitButton
                  pendingLabel="Enregistrement..."
                  className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
                >
                  Enregistrer
                </SubmitButton>
              </div>
            ) : null}
          </form>
        </section>
      </div>
    </main>
  );
}
