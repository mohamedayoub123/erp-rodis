import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { canViewPageUser, canWritePageUser, getCurrentStockUser, getNcTafProcessusAutorisesUser } from "@/lib/stock-auth";
import { formatDate } from "../../../production/suivi/data";
import { updateNcConfidentielDetailAction } from "../actions";

type NcRow = {
  id: number;
  audit: string | null;
  numero: string | null;
  constat: string | null;
  classe: string | null;
  processus_concerne: string | null;
  service_concerne: string | null;
  statut_correction: string | null;
  statut_ac: string | null;
  statut_cloture: string | null;
  created_at: string | null;
  date_realisation_correction: string | null;
  date_realisation_ac: string | null;
  date_realisation: string | null;
  correction: string | null;
  responsable_correction: string | null;
  delais_correction: string | null;
  commentaire: string | null;
  analyse_causes: string | null;
  action_corrective_ac: string | null;
  responsable_ac: string | null;
  delais_ac: string | null;
  commentaire2: string | null;
  methode_mesure_efficacite_ac: string | null;
  mesure_efficacite_ac: string | null;
  realise_par: string | null;
  commentaire3: string | null;
};

const inputClass = "w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

type Params = Promise<{ id: string }>;

// Page dediee plein ecran pour remplir Correction/Action Corrective d'une NC
// existante - demande explicite (les colonnes correspondantes restent
// exploitables, mais trop etroites pour saisir confortablement depuis le
// tableau NC Confidentiel). L'edition en ligne sur le tableau reste
// disponible en plus, cette page ne la remplace pas.
export default async function NcConfidentielDetailPage({ params }: { params: Params }) {
  noStore();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!id) notFound();

  const currentUser = await getCurrentStockUser();
  const canView = await canViewPageUser(currentUser, "qualiteNcConfidentiel");
  if (!canView) {
    redirect("/qualite/nc-confidentiel");
  }

  const { data, error } = await supabaseServer.from("qualite_nc_confidentiel").select("*").eq("id", id).maybeSingle();
  if (error || !data) notFound();
  const row = data as NcRow;

  // Meme perimetre "Processus concerne" que le tableau - empeche d'acceder a
  // une NC hors perimetre en tapant directement son URL.
  const processusAutorises = await getNcTafProcessusAutorisesUser(currentUser);
  if (processusAutorises !== "all" && !processusAutorises.includes(String(row.processus_concerne ?? "").trim())) {
    redirect("/qualite/nc-confidentiel");
  }

  const canWrite = await canWritePageUser(currentUser, "qualiteNcConfidentiel");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                NC {row.audit ? `- Audit ${row.audit}` : ""} {row.numero ? `n°${row.numero}` : ""}
              </h1>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{row.constat || "-"}</p>
            </div>
            <BackButton href="/qualite/nc-confidentiel" label="Retour NC Confidentiel" />
          </div>

          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:grid-cols-3 lg:grid-cols-6">
            <p>Classe : <span className="font-semibold text-slate-700">{row.classe || "-"}</span></p>
            <p>Processus : <span className="font-semibold text-slate-700">{row.processus_concerne || "-"}</span></p>
            <p>Service : <span className="font-semibold text-slate-700">{row.service_concerne || "-"}</span></p>
            <p>Statut correction : <span className="font-semibold text-slate-700">{row.statut_correction || "-"}</span></p>
            <p>Statut AC : <span className="font-semibold text-slate-700">{row.statut_ac || "-"}</span></p>
            <p>Statut cloture : <span className="font-semibold text-slate-700">{row.statut_cloture || "-"}</span></p>
            <p>Date : <span className="font-semibold text-slate-700">{row.created_at ? formatDate(row.created_at) : "-"}</span></p>
            <p>Date correction réalisée : <span className="font-semibold text-slate-700">{row.date_realisation_correction ? formatDate(row.date_realisation_correction) : "-"}</span></p>
            <p>Date AC réalisée : <span className="font-semibold text-slate-700">{row.date_realisation_ac ? formatDate(row.date_realisation_ac) : "-"}</span></p>
            <p>Date de clôture : <span className="font-semibold text-slate-700">{row.date_realisation ? formatDate(row.date_realisation) : "-"}</span></p>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form action={updateNcConfidentielDetailAction} className="grid gap-5 sm:grid-cols-2">
            <input type="hidden" name="id" value={row.id} />

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              Correction
              <textarea name="correction" defaultValue={row.correction || ""} rows={4} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Responsable de la correction
              <input type="text" name="responsable_correction" defaultValue={row.responsable_correction || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Délais Correction
              <input type="text" name="delais_correction" defaultValue={row.delais_correction || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              Commentaire
              <textarea name="commentaire" defaultValue={row.commentaire || ""} rows={4} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              Analyse des causes
              <textarea name="analyse_causes" defaultValue={row.analyse_causes || ""} rows={4} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              Action Corrective (AC)
              <textarea name="action_corrective_ac" defaultValue={row.action_corrective_ac || ""} rows={4} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Responsable AC
              <input type="text" name="responsable_ac" defaultValue={row.responsable_ac || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Délais AC
              <input type="text" name="delais_ac" defaultValue={row.delais_ac || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              commentaire2
              <textarea name="commentaire2" defaultValue={row.commentaire2 || ""} rows={4} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              Methode de Mesure efficacité AC
              <textarea name="methode_mesure_efficacite_ac" defaultValue={row.methode_mesure_efficacite_ac || ""} rows={4} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              Mesure efficacité AC
              <textarea name="mesure_efficacite_ac" defaultValue={row.mesure_efficacite_ac || ""} rows={4} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Réalisé par
              <input type="text" name="realise_par" defaultValue={row.realise_par || ""} disabled={!canWrite} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
              commentaire3
              <textarea name="commentaire3" defaultValue={row.commentaire3 || ""} rows={4} disabled={!canWrite} className={inputClass} />
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
