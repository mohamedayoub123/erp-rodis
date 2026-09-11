import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/_components/back-button";
import { SubmitButton } from "@/app/_components/submit-button";
import { SelectWithAddOption } from "@/app/_components/select-with-add-option";
import { canWritePageUser, getCurrentStockUser } from "@/lib/stock-auth";
import { createNcConfidentielAction } from "../actions";

const CLASSE_OPTIONS = ["Majeure", "Mineure"];

async function fetchDistinctValues(column: string): Promise<string[]> {
  const values = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseServer
      .from("qualite_nc_confidentiel")
      .select(column)
      .range(from, from + pageSize - 1);
    if (error) break;

    const chunk = (data ?? []) as unknown as Record<string, string | null>[];
    for (const row of chunk) {
      const value = String(row[column] || "").trim();
      if (value) values.add(value);
    }

    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return [...values].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

const inputClass = "rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none";

export default async function NouvelleNcConfidentiellePage() {
  noStore();
  const currentUser = await getCurrentStockUser();
  const canWrite = await canWritePageUser(currentUser, "qualiteNcConfidentiel");
  if (!canWrite) {
    redirect("/qualite/nc-confidentiel");
  }

  const [auditOptions, processusOptions, serviceOptions] = await Promise.all([
    fetchDistinctValues("audit"),
    fetchDistinctValues("processus_concerne"),
    fetchDistinctValues("service_concerne"),
  ]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f0ff_0%,#faf8ff_50%,#ffffff_100%)] px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">ERP Rodis</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Nouvelle NC</h1>
              <p className="mt-2 text-sm text-slate-600">
                Le constat initial seulement - Correction, Action Corrective et statuts se remplissent
                ensuite depuis le tableau NC Confidentiel.
              </p>
            </div>
            <BackButton href="/qualite/nc-confidentiel" label="Retour NC Confidentiel" />
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/5 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <form action={createNcConfidentielAction} className="grid gap-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Audit
              <SelectWithAddOption
                name="audit"
                options={auditOptions}
                addLabel="+ Nouvel audit..."
                addPlaceholder="Ex: 4"
                className={inputClass}
              />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Constat
              <textarea name="constat" rows={4} className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Classe
              <select name="classe" defaultValue="" className={inputClass}>
                <option value="">-</option>
                {CLASSE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Processus concerné
              <SelectWithAddOption
                name="processus_concerne"
                options={processusOptions}
                addLabel="+ Nouveau processus..."
                addPlaceholder="Nom du processus"
                className={inputClass}
              />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Service concerné
              <SelectWithAddOption
                name="service_concerne"
                options={serviceOptions}
                addLabel="+ Nouveau service..."
                addPlaceholder="Nom du service"
                className={inputClass}
              />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Norme concernée
              <input type="text" name="norme_concernee" className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Chapitre
              <input type="text" name="chapitre" className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Sous chapitre
              <input type="text" name="sous_chapitre" className={inputClass} />
            </label>

            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Sous sous chapitre
              <input type="text" name="sous_sous_chapitre" className={inputClass} />
            </label>

            <div className="mt-2 flex justify-end">
              <SubmitButton
                pendingLabel="Enregistrement..."
                className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-60"
              >
                Enregistrer cette NC
              </SubmitButton>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
